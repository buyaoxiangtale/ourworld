import Foundation
import Security
import CoreData

typealias JSON = [String: Any]
func sameMediaOrigin(_ media: URL, base: URL) -> Bool {
    func port(_ url: URL) -> Int { url.port ?? (url.scheme?.lowercased() == "https" ? 443 : 80) }
    return media.scheme?.lowercased() == base.scheme?.lowercased() && media.host?.lowercased() == base.host?.lowercased() && port(media) == port(base)
}
func referencedResources(_ rows: [JSON], refs: [String]) -> [JSON] {
    refs.isEmpty ? rows : refs.compactMap { reference in rows.first { $0.str("id") == reference } }
}
func nativeMediaURL(_ value: String, base: String) -> URL? {
    guard let origin = URL(string: base + "/"), let media = URL(string: value, relativeTo: origin)?.absoluteURL else { return nil }
    if sameMediaOrigin(media, base: origin), media.path.range(of: "^/api/v1/(seed|assets)/(avatar|city|country)/[^/]+\\.svg$", options: .regularExpression) != nil, var parts = URLComponents(url: media, resolvingAgainstBaseURL: false) {
        parts.path = String(media.path.dropLast(4)) + ".png"
        return parts.url
    }
    return media
}
func parseISODate(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
}
func displayDate(_ value: String, locale: String) -> String {
    guard let date = parseISODate(value) else { return value }
    let formatter = DateFormatter(); formatter.locale = Locale(identifier: locale == "zh" ? "zh_CN" : "en_US"); formatter.dateStyle = .medium; formatter.timeStyle = .short
    return formatter.string(from: date)
}
extension Dictionary where Key == String, Value == Any {
    func str(_ key: String, _ fallback: String = "") -> String { self[key] as? String ?? fallback }
    func obj(_ key: String) -> JSON { self[key] as? JSON ?? [:] }
    func rows(_ key: String = "items") -> [JSON] { self[key] as? [JSON] ?? [] }
    func strings(_ key: String) -> [String] { self[key] as? [String] ?? [] }
    func int(_ key: String) -> Int { (self[key] as? NSNumber)?.intValue ?? 0 }
    func dbl(_ key: String) -> Double { (self[key] as? NSNumber)?.doubleValue ?? 0 }
    func has(_ key: String) -> Bool { self[key] != nil && !(self[key] is NSNull) }
    func flag(_ key: String) -> Bool { self[key] as? Bool ?? false }
    func localized(_ key: String, _ locale: String) -> String { obj(key).str(locale, str(key)) }
}
struct APIError: LocalizedError { let message: String; var errorDescription: String? { message } }
final class Keychain {
    func get(_ key: String) -> String {
        let query: JSON = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app.ourworld", kSecAttrAccount as String: key, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return "" }
        return String(data: data, encoding: .utf8) ?? ""
    }
    func set(_ key: String, _ value: String) {
        let query: JSON = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "app.ourworld", kSecAttrAccount as String: key]
        SecItemDelete(query as CFDictionary)
        if !value.isEmpty { var record = query; record[kSecValueData as String] = Data(value.utf8); record[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly; SecItemAdd(record as CFDictionary, nil) }
    }
}
@MainActor final class ResourceCache {
    private let container: NSPersistentContainer
    init() {
        let model = NSManagedObjectModel(); let entity = NSEntityDescription(); entity.name = "CachedResource"; entity.managedObjectClassName = "NSManagedObject"
        let key = NSAttributeDescription(); key.name = "key"; key.attributeType = .stringAttributeType
        let value = NSAttributeDescription(); value.name = "value"; value.attributeType = .binaryDataAttributeType
        entity.properties = [key, value]; entity.uniquenessConstraints = [["key"]]; model.entities = [entity]
        container = NSPersistentContainer(name: "OurworldCache", managedObjectModel: model)
        container.loadPersistentStores { _, error in if let error { print("Cache unavailable: \(error.localizedDescription)") } }
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
    }
    func get(_ key: String) -> JSON? {
        let request = NSFetchRequest<NSManagedObject>(entityName: "CachedResource"); request.predicate = NSPredicate(format: "key == %@", key)
        guard let item = try? container.viewContext.fetch(request).first, let data = item.value(forKey: "value") as? Data else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? JSON
    }
    func put(_ key: String, _ value: JSON) {
        guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        let request = NSFetchRequest<NSManagedObject>(entityName: "CachedResource"); request.predicate = NSPredicate(format: "key == %@", key)
        let item = (try? container.viewContext.fetch(request).first) ?? NSEntityDescription.insertNewObject(forEntityName: "CachedResource", into: container.viewContext)
        item.setValue(key, forKey: "key"); item.setValue(data, forKey: "value"); try? container.viewContext.save()
    }
    func clear() { let request = NSFetchRequest<NSManagedObject>(entityName: "CachedResource"); (try? container.viewContext.fetch(request))?.forEach(container.viewContext.delete); try? container.viewContext.save() }
}
@MainActor final class API {
    let session = Keychain()
    let base: String
    var onEvent: ((JSON) -> Void)?
    private var socket: URLSessionWebSocketTask?
    private var receiver: Task<Void, Never>?
    private var refreshTask: Task<JSON, Error>?
    init() {
        base = (Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String ?? "http://127.0.0.1:8188/api/v1").trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        #if !DEBUG
        precondition(base.hasPrefix("https://"), "Release API must use HTTPS")
        #endif
    }
    func saveSession(_ result: JSON) { session.set("access", result.str("accessToken")); if !result.str("refreshToken").isEmpty { session.set("refresh", result.str("refreshToken")) } }
    func call(_ path: String, method: String = "GET", body: JSON = [:], retry: Bool = true) async throws -> JSON {
        guard let url = URL(string: base + path) else { throw APIError(message: "Invalid API address") }
        var request = URLRequest(url: url); request.httpMethod = method; request.timeoutInterval = 100
        let token = session.get("access"); if !token.isEmpty { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if method != "GET" { request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError(message: "Invalid server response") }
        let result = (try? JSONSerialization.jsonObject(with: data) as? JSON) ?? [:]
        if http.statusCode == 401 && retry && !path.hasPrefix("/auth/") && !session.get("refresh").isEmpty {
            try await refreshSession(token)
            return try await call(path, method: method, body: body, retry: false)
        }
        guard (200...299).contains(http.statusCode) else { throw APIError(message: result.str("message", "HTTP \(http.statusCode)")) }
        return result
    }
    private func refreshSession(_ failedToken: String) async throws {
        if session.get("access") != failedToken { return }
        if let refreshTask { _ = try await refreshTask.value; return }
        let task = Task { let value = try await self.call("/auth/refresh", method: "POST", body: ["refreshToken": self.session.get("refresh")], retry: false); self.saveSession(value); return value }
        refreshTask = task
        defer { refreshTask = nil }
        _ = try await task.value
    }
    func connect() {
        disconnect(); guard !session.get("access").isEmpty, let url = URL(string: base.replacingOccurrences(of: "http", with: "ws", options: .anchored) + "/ws") else { return }
        let task = URLSession.shared.webSocketTask(with: url); socket = task; task.resume()
        receiver = Task {
            do {
                let auth = try JSONSerialization.data(withJSONObject: ["event": "auth", "data": ["token": session.get("access")]])
                try await task.send(.string(String(decoding: auth, as: UTF8.self))); onEvent?(["event": "connected"])
                while !Task.isCancelled { let message = try await task.receive(); let data: Data; switch message { case .string(let text): data = Data(text.utf8); case .data(let raw): data = raw; @unknown default: continue }; if let event = try JSONSerialization.jsonObject(with: data) as? JSON { onEvent?(event) } }
            } catch { if !Task.isCancelled { onEvent?(["event": "disconnected"]) } }
        }
    }
    func disconnect() { receiver?.cancel(); receiver = nil; socket?.cancel(with: .goingAway, reason: nil); socket = nil }
    func upload(_ data: Data, name: String, mime: String, purpose: String) async throws -> JSON {
        guard data.count <= 10 * 1024 * 1024 else { throw APIError(message: "Maximum file size is 10 MB") }
        let boundary = UUID().uuidString; var payload = Data()
        payload.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\n\(purpose)\r\n--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(name)\"\r\nContent-Type: \(mime)\r\n\r\n".utf8)); payload.append(data); payload.append(Data("\r\n--\(boundary)--\r\n".utf8))
        var request = URLRequest(url: URL(string: base + "/uploads")!); request.httpMethod = "POST"; request.httpBody = payload; request.setValue("Bearer \(session.get("access"))", forHTTPHeaderField: "Authorization"); request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        let (raw, response) = try await URLSession.shared.data(for: request); let result = (try? JSONSerialization.jsonObject(with: raw) as? JSON) ?? [:]
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else { throw APIError(message: result.str("message", "Upload failed")) }; return result
    }
}
