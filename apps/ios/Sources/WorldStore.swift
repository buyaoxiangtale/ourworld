import SwiftUI

@MainActor final class WorldStore: ObservableObject {
    let api = API(); let cache = ResourceCache()
    @Published var locale = UserDefaults.standard.string(forKey: "locale") ?? "zh"
    @Published var tab = 0
    @Published var route = ""
    @Published var busy = false
    @Published var error = ""
    @Published var notice = ""
    @Published var user: JSON?
    @Published var places: [JSON] = []
    @Published var favorites: Set<String> = []
    @Published var query = ""
    @Published var results: [JSON] = []
    @Published var searchCompleted = false
    @Published var searching = false
    @Published var city: JSON?
    @Published var country: JSON?
    @Published var countryCities: [JSON] = []
    @Published var people: [JSON] = []
    @Published var personIndex = 0
    @Published var peopleLoading = false
    @Published var peopleError = ""
    @Published var feedGeneration = 0
    @Published var connectingPerson = ""
    @Published var resumeConnectId = ""
    private var loadingGeneration: Int?
    private var pendingConnect: JSON?
    private var pendingGeneration = 0
    @Published var exhausted = false
    @Published var feedCities: Set<String> = []
    @Published var coverage = "any"
    var feedId = ""; var cursor: String?
    @Published var conversations: [JSON] = []
    @Published var conversation: JSON?
    @Published var messages: [JSON] = []
    @Published var outgoing: [String: JSON] = [:]
    @Published var messagesLoading = false
    @Published var hasOlderMessages = false
    @Published var historyLoading = false
    @Published var messageError = ""
    private var initializedMessagesId = ""
    @Published var peerReadSequence = 0
    var threadMessages: [JSON] {
        let confirmed = Set(messages.map { $0.str("clientMessageId") })
        return (messages + outgoing.values.filter { $0.str("conversationId") == conversation?.str("id") && !confirmed.contains($0.str("clientMessageId")) }).sorted { a,b in a.int("sequence") == b.int("sequence") ? a.str("createdAt") < b.str("createdAt") : a.int("sequence") < b.int("sequence") }
    }
    @Published var trips: [JSON] = []
    @Published var profile: JSON = [:]
    @Published var draft: JSON = [:]
    @Published var layout: JSON = [:]
    @Published var job: JSON?
    @Published var posts: [JSON] = []
    @Published var online = false
    @Published var newConversation = false
    @Published var globeCommand: JSON?
    var savedCamera: JSON?
    var profileReturnRoute = ""
    var authReturnRoute = ""
    private var connecting: Set<String> = []
    private var layoutUndo: [JSON] = []
    func t(_ zh: String, _ en: String) -> String { locale == "zh" ? zh : en }
    func language() { locale = locale == "zh" ? "en" : "zh"; UserDefaults.standard.set(locale, forKey: "locale") }
    func run(_ action: @escaping @MainActor () async throws -> Void) { Task { busy = true; error = ""; do { try await action() } catch { self.error = error.localizedDescription }; busy = false } }
    init() {
        api.onEvent = { [weak self] event in Task { @MainActor in guard let self else { return }; switch event.str("event") {
            case "connected": self.online = true; try? await self.refreshConversations(); if self.conversation != nil { try? await self.loadMessages() }
            case "disconnected": self.online = false; try? await Task.sleep(nanoseconds: 3_000_000_000); if self.user != nil { self.api.connect() }
            case "conversation.read": let data = event.obj("data"); if data.str("conversationId") == self.conversation?.str("id"), data.str("userId") != self.user?.str("id") { self.peerReadSequence = max(self.peerReadSequence, data.int("sequence")) }; try? await self.refreshConversations()
            case "message.created", "conversation.created": try? await self.refreshConversations(); if self.conversation != nil { try? await self.loadMessages() }
            case "trip.updated": try? await self.loadTrips()
            case "profile.job.updated": if let job = self.job { self.job = try? await self.api.call("/profile/jobs/\(job.str("id"))") }
            default: break
        } } }
        run { self.places = self.cache.get("places")?.rows() ?? []; let value = try await self.api.call("/places"); self.places = value.rows(); self.cache.put("places", value)
            if !self.api.session.get("access").isEmpty { self.user = try await self.api.call("/me"); try await self.refreshFavorites(); try await self.refreshConversations(); self.api.connect() }
        }
    }
    func requireLogin() -> Bool { if user == nil { authReturnRoute = route; route = "auth"; return false }; return true }
    func back() { if route == "public" { route = profileReturnRoute == "auth" && user != nil ? "" : profileReturnRoute } else if route == "auth" { pendingConnect = nil; resumeConnectId = ""; route = authReturnRoute } else if route == "people" { route = "city" } else { route = "" } }
    func updateSearch(_ value: String) { query = value; results = []; searchCompleted = false; searching = false }
    func search() {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { updateSearch(query); return }
        searching = true
        run {
            defer { if self.query.trimmingCharacters(in: .whitespacesAndNewlines) == term { self.searching = false } }
            let rows = try await self.api.call("/places?q=" + (term.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "")).rows()
            if self.query.trimmingCharacters(in: .whitespacesAndNewlines) == term { self.results = rows; self.searchCompleted = true }
        }
    }
    func select(_ place: JSON) {
        globeCommand = ["bridgeVersion": 1, "event": "focusPlace", "data": ["place": place]]; updateSearch("")
        switch place.str("kind") { case "city": city = place; route = "city"; case "attraction": run { self.city = try await self.api.call("/places/\(place.str("parentId"))"); self.route = "city" }; case "country": run { self.country = try await self.api.call("/places/\(place.str("id"))"); self.countryCities = try await self.api.call("/places?parentId=\(place.str("id"))&kind=city").rows(); self.route = "country" }; default: break }
    }
    func showUnlistedCountry(_ data: JSON) {
        let name = data.str("geoName"); guard !name.isEmpty else { return }
        country = ["id": "geo-" + data.str("geoId"), "kind": "country", "name": ["zh": name, "en": name], "description": ["zh": "这个国家的资料暂未收录，更多介绍与城市内容正在准备中。你可以返回地球继续探索。", "en": "This country has not been added yet. Its introduction and cities are being prepared. Return to the globe to keep exploring."], "image": ""]
        countryCities = []; route = "country"
    }
    func refreshFavorites() async throws { favorites = Set(try await api.call("/favorites").rows().map { $0.str("id") }) }
    func favorite() { guard requireLogin(), let city else { return }; run { _ = try await self.api.call("/favorites/\(city.str("id"))", method: self.favorites.contains(city.str("id")) ? "DELETE" : "PUT"); try await self.refreshFavorites() } }
    func startPeople() { feedCities = Set([city?.str("id") ?? ""].filter { !$0.isEmpty }); coverage = "any"; restartPeople() }
    func restartPeople() { feedGeneration += 1; people = []; personIndex = 0; feedId = ""; cursor = nil; exhausted = false; peopleError = ""; pendingConnect = nil; resumeConnectId = ""; route = "people"; Task { await loadPeople() } }
    func loadPeople() async {
        let generation = feedGeneration
        guard loadingGeneration != generation, let city else { return }
        loadingGeneration = generation; peopleLoading = true; peopleError = ""
        defer { if generation == feedGeneration { peopleLoading = false; loadingGeneration = nil } }
        do {
            let suffix = feedId.isEmpty ? "?cityIds=\(feedCities.sorted().joined(separator: ","))&coverage=\(coverage)" : "?feedId=\(feedId)&cursor=\(cursor ?? "")"
            let value = try await api.call("/cities/\(city.str("id"))/people-feed\(suffix)")
            guard generation == feedGeneration else { return }
            feedId = value.str("feedId"); cursor = value["nextCursor"] as? String; exhausted = value.flag("exhausted") || cursor == nil
            let old = Set(people.map { $0.str("id") }); people += value.rows().filter { !old.contains($0.str("id")) }
        } catch { if generation == feedGeneration { peopleError = error.localizedDescription } }
    }
    func next() { if personIndex < people.count { personIndex += 1 }; if people.count - personIndex < 3 && !exhausted { Task { await loadPeople() } } }
    func advancePerson(_ id: String, generation: Int) { if generation == feedGeneration, people.indices.contains(personIndex), people[personIndex].str("id") == id { next() } }
    func ensureConnectAuth(_ person: JSON) -> Bool { if user?.flag("verified") == true { return true }; pendingConnect = person; pendingGeneration = feedGeneration; authReturnRoute = route; route = "auth"; return false }
    private func resumePendingConnect() { if let pending = pendingConnect, user?.flag("verified") == true, pendingGeneration == feedGeneration { pendingConnect = nil; if route == "people", people.indices.contains(personIndex), people[personIndex].str("id") == pending.str("id") { resumeConnectId = pending.str("id") } else { connect(pending) } } }
    func refreshVerification() async throws { user = try await api.call("/me"); guard user?.flag("verified") == true else { throw APIError(message: t("邮箱尚未验证，请打开验证邮件。", "Open the verification email first.")) }; route = authReturnRoute; resumePendingConnect() }
    func connectForSwipe(_ person: JSON) async -> Bool {
        let id = person.str("id"), generation = feedGeneration
        guard ensureConnectAuth(person), !connecting.contains(id) else { return false }
        connecting.insert(id); connectingPerson = id; peopleError = ""
        defer { connecting.remove(id); if connectingPerson == id { connectingPerson = "" } }
        let cityId = feedCities.sorted().first { person.strings("cityIds").contains($0) } ?? city?.str("id") ?? person.strings("cityIds").first ?? ""
        do { _ = try await api.call("/conversations/direct", method: "POST", body: ["userId": id, "cityId": cityId]); newConversation = true; notice = t("已加入对话，继续探索", "Added to chats. Keep exploring."); Task { try? await refreshConversations() }; return true }
        catch { if generation == feedGeneration { peopleError = error.localizedDescription }; return false }
    }
    func connect(_ person: JSON) { guard ensureConnectAuth(person) else { return }; let generation = feedGeneration; Task { if await connectForSwipe(person) { if route == "people" { advancePerson(person.str("id"), generation: generation) } } else if route != "people" { error = peopleError } } }
    func openProfile(_ id: String) { notice = ""; let source = route; run { self.profile = try await self.api.call("/users/\(id)"); self.profileReturnRoute = source; self.route = "public" } }
    func ownProfile() { guard requireLogin(), let user else { return }; run { self.profile = try await self.api.call("/users/\(user.str("id"))"); self.route = "" } }
    func refreshConversations() async throws { let value = try await api.call("/conversations"); conversations = value.rows(); cache.put("conversations", value) }
    func openConversation(_ value: JSON) { conversation = value; initializedMessagesId = ""; hasOlderMessages = false; messages = cache.get("messages:\(value.str("id"))")?.rows() ?? []; peerReadSequence = 0; messageError = ""; route = "conversation"; Task { messagesLoading = true; defer { messagesLoading = false }; do { try await loadMessages(); try await loadTrips() } catch { messageError = error.localizedDescription } } }
    func loadMessages() async throws { guard let conversation else { return }; let id = conversation.str("id"); let value = try await api.call("/conversations/\(id)/messages"); guard self.conversation?.str("id") == id else { return }; if initializedMessagesId != id { hasOlderMessages = value["nextCursor"] is String; initializedMessagesId = id }; let known = Set(messages.map { $0.str("id") }); messages = (messages + value.rows().filter { !known.contains($0.str("id")) }).sorted { $0.int("sequence") < $1.int("sequence") }; cache.put("messages:\(id)", value); for message in messages { outgoing.removeValue(forKey: message.str("clientMessageId")) }; if let last = messages.last { _ = try await api.call("/conversations/\(id)/read", method: "PUT", body: ["sequence": last.int("sequence")]) } }
    func history() { guard !historyLoading, let c = conversation, let first = messages.first else { return }; Task { historyLoading = true; defer { historyLoading = false }; do { let result = try await api.call("/conversations/\(c.str("id"))/messages?before=\(first.int("sequence"))"); guard conversation?.str("id") == c.str("id") else { return }; let oldIds = Set(messages.map { $0.str("id") }); messages = (result.rows().filter { !oldIds.contains($0.str("id")) } + messages).sorted { $0.int("sequence") < $1.int("sequence") }; hasOlderMessages = result["nextCursor"] is String } catch { messageError = error.localizedDescription } } }
    func send(_ body: String, type: String = "text", data: JSON = [:], clientId: String = UUID().uuidString) {
        guard !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, let c = conversation, outgoing[clientId]?.str("delivery") != "sending" else { return }
        let pending: JSON = ["id": "local-" + clientId, "clientMessageId": clientId, "conversationId": c.str("id"), "senderId": user?.str("id") ?? "", "sequence": Int.max, "createdAt": ISO8601DateFormatter().string(from: Date()), "type": type, "body": body, "data": data, "delivery": "sending"]
        outgoing[clientId] = pending
        Task { do { let result = try await api.call("/conversations/\(c.str("id"))/messages", method: "POST", body: ["clientMessageId": clientId, "type": type, "body": body, "data": data]); if conversation?.str("id") == c.str("id"), !messages.contains(where: { $0.str("id") == result.str("id") }) { messages.append(result); messages.sort { $0.int("sequence") < $1.int("sequence") } }; outgoing.removeValue(forKey: clientId); try? await refreshConversations() } catch { var failed = pending; failed["delivery"] = "failed"; outgoing[clientId] = failed } }
    }
    func retryMessage(_ message: JSON) { send(message.str("body"), type: message.str("type"), data: message.obj("data"), clientId: message.str("clientMessageId")) }
    func loadTrips() async throws { guard let conversation else { return }; trips = try await api.call("/conversations/\(conversation.str("id"))/trips").rows() }
    func createTrip(_ title: String, end: String) { guard let c = conversation else { return }; run { guard let date = ISO8601DateFormatter().date(from: end) else { throw APIError(message: self.t("请输入 ISO UTC 时间", "Use ISO UTC time")) }; _ = try await self.api.call("/conversations/\(c.str("id"))/trips", method: "POST", body: ["title": title, "cityId": c.str("cityId", self.city?.str("id") ?? ""), "endAt": ISO8601DateFormatter().string(from: date)]); try await self.loadTrips() } }
    func tripAction(_ trip: JSON, _ action: String) { run { do { _ = try await self.api.call("/trips/\(trip.str("id"))/\(action)", method: "POST", body: action == "accept" ? ["expectedEndAt": trip.str("endAt")] : [:]) } catch { try? await self.loadTrips(); throw error }; try await self.loadTrips() } }
    func editTrip(_ trip: JSON, end: Date) { run { _ = try await self.api.call("/trips/\(trip.str("id"))", method: "PATCH", body: ["endAt": ISO8601DateFormatter().string(from: end)]); try await self.loadTrips(); self.notice = self.t("结束时间已修改，等待对方重新确认", "End time updated; waiting for the other person to accept again.") } }
    func editProfileCard(_ section: String) { guard ["gallery", "prompts"].contains(section), requireLogin() else { return }; run { self.draft = try await self.api.call("/profile/draft"); self.layout = self.draft.obj("layout"); self.route = "profile-" + section } }
    func saveDraft() async throws { draft = try await api.call("/profile/draft", method: "PUT", body: ["revision": draft.int("revision"), "layout": layout]); layout = draft.obj("layout") }
    func updateLayout(_ key: String, _ value: Any) { layoutUndo.append(layout); layout[key] = value }
    func undoLayout() { if let previous = layoutUndo.popLast() { layout = previous } }
    func restoreRevision(_ revision: Int) async throws { draft = try await api.call("/profile/restore", method: "POST", body: ["revision": revision]); layout = draft.obj("layout"); layoutUndo = [] }
    func save(_ publish: Bool = false) { run { try await self.saveDraft(); if publish { _ = try await self.api.call("/profile/publish", method: "POST", body: ["revision": self.draft.int("revision")]); if let user = self.user { self.profile = try await self.api.call("/users/\(user.str("id"))") }; self.notice = self.t("主页已发布", "Profile published") } } }
    func generate(_ prompt: String) { run { try await self.saveDraft(); self.job = try await self.api.call("/profile/jobs", method: "POST", body: ["prompt": prompt, "baseRevision": self.draft.int("revision")]); while let job = self.job, ["queued", "running", "validating"].contains(job.str("status")) { try await Task.sleep(nanoseconds: 1_500_000_000); self.job = try await self.api.call("/profile/jobs/\(job.str("id"))") } } }
    func applyJob() { guard let job else { return }; run { guard NSDictionary(dictionary: self.layout).isEqual(to: self.draft.obj("layout")) else { throw APIError(message: self.t("草稿有未保存修改，请先保存后再处理生成结果", "You have unsaved edits. Save before applying this result.")) }; self.draft = try await self.api.call("/profile/jobs/\(job.str("id"))/apply", method: "POST", body: ["revision": self.draft.int("revision")]); self.layout = self.draft.obj("layout"); self.job = nil } }
    func cancelJob() { guard let job else { return }; run { _ = try await self.api.call("/profile/jobs/\(job.str("id"))", method: "DELETE"); self.job = nil } }
    func restore() { run { let history = try await self.api.call("/profile/history").rows(); guard let last = history.last else { throw APIError(message: self.t("暂无历史版本", "No history yet")) }; self.draft = try await self.api.call("/profile/restore", method: "POST", body: ["revision": last.int("revision")]); self.layout = self.draft.obj("layout") } }
    func loadPosts() { run { self.posts = try await self.api.call("/posts?cityId=\(self.city?.str("id") ?? "")").rows(); self.route = "posts" } }
    func report(_ type: String, id: String) { guard requireLogin() else { return }; run { _ = try await self.api.call("/reports", method: "POST", body: ["targetType": type, "targetId": id, "reason": "Reported by user"]); self.notice = self.t("举报已提交", "Report submitted") } }
    func block(_ id: String) { run { _ = try await self.api.call("/blocks/\(id)", method: "PUT"); self.notice = self.t("已拉黑", "Blocked"); self.route = "" } }
    func logout() { run { _ = try? await self.api.call("/auth/logout", method: "POST", body: ["refreshToken": self.api.session.get("refresh")]); self.api.disconnect(); self.api.session.set("access", ""); self.api.session.set("refresh", ""); self.cache.clear(); self.user = nil; self.conversations = []; self.messages = []; self.favorites = []; self.profile = [:]; self.job = nil; self.route = "" } }
    func signedIn(_ value: JSON) async throws { api.saveSession(value); user = try await api.call("/me"); route = pendingConnect != nil && user?.flag("verified") != true ? "auth" : authReturnRoute; if tab == 2, route.isEmpty, let user { profile = try await api.call("/users/\(user.str("id"))") }; try await refreshFavorites(); try await refreshConversations(); api.connect(); resumePendingConnect() }
}
