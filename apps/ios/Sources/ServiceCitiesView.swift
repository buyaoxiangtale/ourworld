import SwiftUI
import Foundation

@MainActor func currentProfileDetails(_ store: WorldStore) -> JSON { let profile = store.profile.obj("user"); return !profile.str("id").isEmpty && profile.str("id") == store.user?.str("id") ? profile : store.user ?? [:] }
let profileEducationLevels = ["high-school", "vocational", "associate", "bachelor", "master", "doctorate", "other"]
func profileEducationLabel(_ value: String, _ locale: String) -> String {
    let labels = ["high-school": ["高中", "High school"], "vocational": ["中专 / 职业教育", "Vocational education"], "associate": ["大专", "Associate degree"], "bachelor": ["本科", "Bachelor’s degree"], "master": ["硕士", "Master’s degree"], "doctorate": ["博士", "Doctorate"], "other": ["其他", "Other"]]
    return labels[value]?[locale == "zh" ? 0 : 1] ?? ""
}
func profileEducationText(_ user: JSON, _ locale: String) -> String { [user.str("school"), profileEducationLabel(user.str("educationLevel"), locale)].filter { !$0.isEmpty }.joined(separator: " · ") }

@MainActor struct ServiceCitiesView: View {
    @EnvironmentObject var s: WorldStore
    var onClose: (() -> Void)? = nil
    @State private var cities: [JSON] = []
    @State private var countries: [JSON] = []
    @State private var selected: [String] = []
    @State private var query = ""
    @State private var loading = true
    @State private var loadError = ""
    private func close() { if let onClose { onClose() } else { s.route = "" } }
    private func searchKey(_ value: String) -> String { value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: s.locale)) }
    private func country(_ city: JSON) -> String { countries.first { $0.str("country") == city.str("country") }?.localized("name", s.locale) ?? city.str("country") }
    private var filtered: [JSON] {
        let words = searchKey(query).split(whereSeparator: { $0.isWhitespace }).map(String.init)
        return cities.filter { city in let text = searchKey([city.localized("name", "zh"), city.localized("name", "en"), city.str("country"), country(city), city.strings("aliases").joined(separator: " ")].joined(separator: " ")); return words.allSatisfy { text.contains($0) } }.sorted { $0.localized("name", s.locale) < $1.localized("name", s.locale) }
    }
    private func toggle(_ id: String) { if selected.contains(id) { selected.removeAll { $0 == id } } else if selected.count < 50 { selected.append(id) } }
    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) { Button(action: close) { Image(systemName: "arrow.left").frame(width: 44, height: 44) }.disabled(s.busy).accessibilityLabel(s.t("返回", "Back")); VStack(alignment: .leading, spacing: 4) { Text(s.t("服务城市", "Service cities")).font(ourFont(22)).fontWeight(.semibold); Text(s.t("选择你熟悉、可以提供服务的城市", "Choose the cities where you offer your services")).font(ourFont(12)).foregroundStyle(OWVisual.inkMuted) }; Spacer(minLength: 0) }.padding(.horizontal, 8)
            HStack { Image(systemName: "magnifyingglass"); TextField(s.t("搜索城市、国家或地区", "Search cities or countries"), text: $query).textInputAutocapitalization(.never).disableAutocorrection(true); if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill") }.accessibilityLabel(s.t("清空搜索", "Clear search")) } }.padding(12).background(OWVisual.raised).clipShape(RoundedRectangle(cornerRadius: 16)).padding(.horizontal, 16)
            if !selected.isEmpty { ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 8) { ForEach(selected, id: \.self) { id in Button { toggle(id) } label: { HStack(spacing: 6) { Text(cities.first { $0.str("id") == id }?.localized("name", s.locale) ?? s.t("已选城市", "Selected city")); Image(systemName: "xmark").font(.system(size: 11)) }.font(ourFont(12)).padding(.horizontal, 12).padding(.vertical, 9).background(OWVisual.surface, in: Capsule()) }.disabled(s.busy).buttonStyle(.plain) } }.padding(.horizontal, 16) } }
            HStack { Text(s.t("\(filtered.count) 座城市", "\(filtered.count) cities")); Spacer(); Text(s.t("已选 \(selected.count) / 50", "\(selected.count) / 50 selected")) }.font(ourFont(12)).foregroundStyle(OWVisual.inkMuted).padding(.horizontal, 18)
            if !loadError.isEmpty { Text(loadError).font(ourFont(13)).foregroundStyle(OWVisual.nope); Button(s.t("重试", "Retry")) { Task { await load() } } }
            if loading { Spacer(); EarthLoading(); Spacer() } else {
                ScrollView(showsIndicators: false) { LazyVStack(spacing: 0) {
                    if filtered.isEmpty && loadError.isEmpty { Text(s.t("未找到城市，请尝试其他名称。", "No cities found. Try another name.")).foregroundStyle(OWVisual.inkMuted).padding(24) }
                    ForEach(Array(filtered.enumerated()), id: \.offset) { _, city in Button { toggle(city.str("id")) } label: { HStack(spacing: 12) { Image(systemName: "mappin.and.ellipse").foregroundStyle(OWVisual.inkMuted).frame(width: 36); VStack(alignment: .leading, spacing: 5) { Text(city.localized("name", s.locale)).font(ourFont(15)); Text(city.localized("name", "en") + " · " + country(city)).font(ourFont(12)).foregroundStyle(OWVisual.inkMuted) }; Spacer(); Image(systemName: selected.contains(city.str("id")) ? "checkmark.circle.fill" : "circle").font(.system(size: 23)).foregroundStyle(selected.contains(city.str("id")) ? OWVisual.accent : OWVisual.inkFaint) }.frame(minHeight: 72).contentShape(Rectangle()) }.buttonStyle(.plain).disabled(s.busy || (!selected.contains(city.str("id")) && selected.count >= 50)); Divider().overlay(OWVisual.line) }
                }.padding(.horizontal, 16) }
            }
            Button { s.run { s.user = try await s.api.call("/me", method: "PATCH", body: ["cityIds": selected]); if let user = s.user { s.profile = try await s.api.call("/users/\(user.str("id"))") }; s.notice = s.t("服务城市已更新", "Service cities updated"); close() } } label: { Text(s.t("保存所选城市（\(selected.count)）", "Save selected cities (\(selected.count))")).font(ourFont(14)).fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 48).background(OWVisual.accent, in: Capsule()).foregroundStyle(OWVisual.accentInk) }.disabled(s.busy || loading || !loadError.isEmpty).padding(16)
        }.padding(.top, 8).starlight().foregroundStyle(OWVisual.ink)
        .task { selected = currentProfileDetails(s).strings("cityIds"); await load() }
    }
    private func catalogue(_ kind: String) async throws -> [JSON] {
        var all: [JSON] = []; var offset = 0
        while true { let page = try await s.api.call("/places?kind=\(kind)&limit=250&offset=\(offset)"); all += page.rows("items"); if !page.has("nextOffset") { break }; let next = page.int("nextOffset"); guard next > offset else { throw APIError(message: "Invalid catalogue pagination") }; offset = next }
        return all.filter { $0.str("kind") == kind }
    }
    private func load() async { loading = true; loadError = ""; do { cities = try await catalogue("city"); countries = try await catalogue("country") } catch { loadError = error.localizedDescription }; loading = false }
}
