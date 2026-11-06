import SwiftUI
import WebKit
import PhotosUI
import UniformTypeIdentifiers
import CoreText
import UIKit

let sky = Color(hex: "eef4f5")
let night = OWVisual.bg
let nightSurface = OWVisual.surface
let moon = OWVisual.ink
let moonMuted = OWVisual.inkMuted
let paper = OWVisual.bg
let ink = OWVisual.ink
let coral = OWVisual.accent
extension Color { init(hex: String) { let value = UInt64(hex.replacingOccurrences(of: "#", with: ""), radix: 16) ?? 0x193936; self.init(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255) } }

@MainActor func ourFont(_ size: CGFloat, display: Bool = false) -> Font {
    let chinese = (UserDefaults.standard.string(forKey: "locale") ?? "zh") == "zh"
    let family = chinese ? "Noto" : "Manrope"
    if let match = UIFont.familyNames.first(where: { $0.localizedCaseInsensitiveContains(family) }), let name = UIFont.fontNames(forFamilyName: match).first { return .custom(name, size: size, relativeTo: display ? .title : .body) }
    return .system(size: size, design: .default)
}
@main @MainActor struct OurworldApp: App {
    @StateObject private var store = WorldStore()
    init() { for name in ["Manrope", "Newsreader", "NotoSansSC"] { if let file = Bundle.main.url(forResource: name, withExtension: "ttf", subdirectory: "Resources/fonts") ?? Bundle.main.url(forResource: name, withExtension: "ttf", subdirectory: "fonts") { CTFontManagerRegisterFontsForURL(file as CFURL, .process, nil) } } }
    var body: some Scene { WindowGroup { WorldRoot().environmentObject(store).tint(ink).font(ourFont(16)) } }
}

@MainActor struct WorldRoot: View {
    @EnvironmentObject var s: WorldStore
    private var globePage: Bool { s.tab == 0 && ["", "city", "country", "people"].contains(s.route) }
    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .top) {
                ExploreView().opacity(globePage ? 1 : 0).allowsHitTesting(globePage && s.route != "people")
                Group { switch s.route {
                    case "auth": AuthView()
                    case "people": PeopleView()
                    case "public": PublicProfileView()
                    case "conversation": ChatView()
                    case "edit": ProfileEditorView()
                    case "settings": SettingsView()
                    case "packages": PackagesView()
                    case "verification": VerificationView()
                    case "posts": StoriesView()
                    default: if s.tab == 1 { ConversationsView() } else if s.tab == 2 { OwnProfileView() }
                } }.frame(maxWidth: .infinity, maxHeight: .infinity)
                if s.busy && !globePage { ProgressView().frame(maxWidth: .infinity).padding(5) }
                if !s.error.isEmpty { banner(s.error, error: true) { s.error = "" } }
            }
            if s.route != "conversation" && s.route != "public" {
                HStack { nav(0, "globe.europe.africa", s.t("地球", "Earth")); nav(1, "bubble.left.and.bubble.right", s.t("聊天", "Chat")); nav(2, "person.crop.circle", "Profile") }.background(globePage ? night : paper)
            }
        }.background((globePage ? night : paper).ignoresSafeArea()).foregroundStyle(ink).preferredColorScheme(globePage ? .dark : .light)
        .overlay(alignment: .bottom) { if !s.notice.isEmpty { Text(s.notice).font(ourFont(14)).padding(16).background(nightSurface).foregroundStyle(moon).clipShape(RoundedRectangle(cornerRadius: 16)).padding(.horizontal, 16).padding(.bottom, s.route == "conversation" ? 80 : 64).allowsHitTesting(false) } }
        .task(id: s.notice) { let value = s.notice; if !value.isEmpty { try? await Task.sleep(nanoseconds: 3_200_000_000); if !Task.isCancelled && s.notice == value { s.notice = "" } } }
        .sheet(isPresented: Binding(get: { s.route == "city" || s.route == "country" }, set: { if !$0 && ["city", "country"].contains(s.route) { s.route = "" } })) {
            Group { if s.route == "country" { CountryView() } else { CityView() } }.environmentObject(s).foregroundStyle(ink).tint(ink).preferredColorScheme(.light).presentationDetents(s.route == "country" ? [.fraction(0.85), .large] : [.fraction(0.67), .large]).presentationDragIndicator(.visible)
        }
    }
    private func nav(_ index: Int, _ symbol: String, _ label: String) -> some View { Button {
        s.notice = ""; s.tab = index; s.route = ""; if index == 1 { s.newConversation = false; if s.requireLogin() { s.run { try await s.refreshConversations() } } }; if index == 2 { s.ownProfile() }
    } label: { VStack(spacing: 4) { ZStack(alignment: .topTrailing) { Image(systemName: symbol).font(.system(size: 24)); if index == 1 && s.newConversation { Circle().fill(coral).frame(width: 7, height: 7).offset(x: 7, y: -3) } } }.foregroundStyle(globePage ? (s.tab == index ? moon : moonMuted) : (s.tab == index ? ink : ink.opacity(0.5))).frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle()) }.buttonStyle(.plain).accessibilityLabel(label) }
    private func banner(_ value: String, error: Bool, dismiss: @escaping () -> Void) -> some View { HStack { Text(value).font(.footnote); Spacer(); Button(action: dismiss) { Image(systemName: "xmark") } }.padding(12).background(error ? Color(hex: "efc6c2") : Color(hex: "cbe8d4")) }
}

@MainActor struct Page<Content: View>: View {
    @EnvironmentObject var s: WorldStore
    let title: String
    let content: Content
    init(_ title: String, @ViewBuilder content: () -> Content) { self.title = title; self.content = content() }
    var body: some View { VStack(spacing: 0) { HStack { Button(action: s.back) { Image(systemName: "arrow.left").padding(8) }; Text(title).font(ourFont(25, display: true)); Spacer(); Button(s.locale == "zh" ? "EN" : "中", action: s.language) }.padding(); ScrollView { VStack(alignment: .leading, spacing: 16) { content }.padding(20).frame(maxWidth: .infinity, alignment: .leading) } }.background(paper) }
}
@MainActor struct Action: View { let title: String; var disabled = false; let action: () -> Void; init(_ title: String, disabled: Bool = false, action: @escaping () -> Void) { self.title = title; self.disabled = disabled; self.action = action }; var body: some View { Button(action: action) { Text(title).fontWeight(.semibold).frame(maxWidth: .infinity).padding(15).background(ink).foregroundStyle(paper).clipShape(Capsule()) }.disabled(disabled).opacity(disabled ? 0.5 : 1) } }
@MainActor struct Input: View { let label: String; @Binding var value: String; var body: some View { TextField(label, text: $value, axis: .vertical).textFieldStyle(.roundedBorder).padding(.vertical, 2) } }
@MainActor struct Photo: View {
    @EnvironmentObject var s: WorldStore
    let url: String
    var height: CGFloat = 180
    var cornerRadius: CGFloat = OWVisual.radii_card
    @State private var image: UIImage?
    @State private var failed = false
    var body: some View {
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFill() }
            else { Rectangle().fill(OWVisual.raised).overlay { if failed { Image(systemName: "photo").foregroundStyle(OWVisual.inkMuted).accessibilityLabel(s.t("照片暂不可用", "Photo unavailable")) } else { ProgressView() } } }
        }.frame(maxWidth: .infinity).frame(height: height).clipped().clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        .task(id: url) {
            image = nil; failed = false
            guard !url.isEmpty, let location = nativeMediaURL(url, base: s.api.base) else { failed = true; return }
            var request = URLRequest(url: location)
            if let base = URL(string: s.api.base), sameMediaOrigin(location, base: base) { request.setValue("Bearer \(s.api.session.get("access"))", forHTTPHeaderField: "Authorization") }
            do {
                let (data, response) = try await URLSession.shared.data(for: request)
                guard !Task.isCancelled else { return }
                guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode), let decoded = UIImage(data: data) else { failed = true; return }
                image = decoded
            } catch { if !Task.isCancelled { failed = true } }
        }
    }
}

@MainActor struct ExploreView: View {
    @EnvironmentObject var s: WorldStore
    @FocusState private var searchFocused: Bool
    var body: some View {
        ZStack(alignment: .top) {
            GlobeView(store: s).background(night).ignoresSafeArea(edges: .top)
            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    Button { s.search(); searchFocused = false } label: { Image(systemName: "magnifyingglass").frame(width: 44, height: 44) }.accessibilityLabel(s.t("搜索", "Search"))
                    TextField("", text: Binding(get: { s.query }, set: { s.updateSearch($0) }), prompt: Text(s.t("搜索国家、城市或景点", "Search countries, cities or places")).foregroundColor(moonMuted))
                        .focused($searchFocused).submitLabel(.search).autocorrectionDisabled().textInputAutocapitalization(.never)
                        .accessibilityLabel(s.t("搜索国家、城市或景点", "Search countries, cities or places"))
                        .onSubmit { s.search(); searchFocused = false }
                    if !s.query.isEmpty { Button { s.updateSearch("") } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(moonMuted).frame(width: 44, height: 44) }.accessibilityLabel(s.t("清除搜索", "Clear search")) }
                }.padding(.horizontal, 15).padding(.vertical, 5).background(nightSurface.opacity(0.88)).clipShape(Capsule()).overlay(Capsule().stroke(moon.opacity(searchFocused ? 0.42 : 0.16), lineWidth: 1))
                if !s.query.isEmpty && (s.searching || s.searchCompleted) {
                    VStack(spacing: 0) {
                        if s.searching { ProgressView().padding(12) }
                        if s.searchCompleted && s.results.isEmpty { Text(s.t("没有找到，试试其他名称", "No matches. Try another name.")).padding(20).frame(maxWidth: .infinity, alignment: .leading) }
                        if !s.results.isEmpty {
                            ScrollView {
                                VStack(spacing: 0) {
                                    ForEach(Array(s.results.enumerated()), id: \.offset) { _, place in
                                        Button { searchFocused = false; s.select(place) } label: {
                                            HStack {
                                                VStack(alignment: .leading, spacing: 3) {
                                                    Text(place.localized("name", s.locale)).font(ourFont(16))
                                                    Text(place.str("kind") == "country" ? s.t("国家", "Country") : place.str("kind") == "city" ? s.t("城市", "City") : s.t("景点", "Place")).font(ourFont(12)).foregroundStyle(moonMuted)
                                                }
                                                Spacer(); Image(systemName: "chevron.right").font(.footnote)
                                            }.padding(.horizontal, 18).frame(height: 62).contentShape(Rectangle())
                                        }.buttonStyle(.plain)
                                    }
                                }
                            }.frame(height: min(CGFloat(s.results.count) * 62, 310))
                        }
                    }.background(nightSurface.opacity(0.97)).clipShape(RoundedRectangle(cornerRadius: 22))
                }
            }.padding(.horizontal, 20).padding(.top, 12).foregroundStyle(moon).tint(moon).opacity(s.tab == 0 && ["", "country", "city"].contains(s.route) ? 1 : 0).allowsHitTesting(s.tab == 0 && ["", "country", "city"].contains(s.route))
        }
        .task(id: s.query) { guard !s.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }; try? await Task.sleep(nanoseconds: 300_000_000); if !Task.isCancelled { s.search() } }
    }
}

@MainActor struct GlobeView: UIViewRepresentable {
    @ObservedObject var store: WorldStore
    func makeCoordinator() -> Coordinator { Coordinator(store) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration(); configuration.userContentController.add(context.coordinator, name: "globe")
        let view = WKWebView(frame: .zero, configuration: configuration); view.isOpaque = false; view.backgroundColor = UIColor(red: 5/255, green: 8/255, blue: 13/255, alpha: 1); view.scrollView.isScrollEnabled = false; view.navigationDelegate = context.coordinator; context.coordinator.web = view
        if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Resources/globe") ?? Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "globe") { view.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent()) } else { view.loadHTMLString("<body style='background:#05080d;color:#f1f3f5;font-family:serif;padding:40px'>Globe resources are not bundled. Run the shared globe build.</body>", baseURL: nil) }
        return view
    }
    func updateUIView(_ uiView: WKWebView, context: Context) { context.coordinator.markers(); context.coordinator.activity(); if let command = store.globeCommand, let raw = try? JSONSerialization.data(withJSONObject: command, options: .sortedKeys), let text = String(data: raw, encoding: .utf8), text != context.coordinator.lastNativeCommand { context.coordinator.lastNativeCommand = text; context.coordinator.send(command) } }
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) { coordinator.send(["bridgeVersion": 1, "event": "setActive", "data": ["active": false]]); uiView.configuration.userContentController.removeScriptMessageHandler(forName: "globe"); uiView.stopLoading() }
    @MainActor final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let store: WorldStore; weak var web: WKWebView?; var lastCommand = ""; var lastMarkers = ""; var lastNativeCommand = ""; var lastActive: Bool?
        init(_ store: WorldStore) { self.store = store }
        func send(_ value: JSON) { guard let data = try? JSONSerialization.data(withJSONObject: value), let text = String(data: data, encoding: .utf8), text != lastCommand else { return }; lastCommand = text; web?.evaluateJavaScript("window.OurworldGlobe&&window.OurworldGlobe.receive(\(text));") }
        func activity() { let active = store.tab == 0 && ["", "city", "country"].contains(store.route); if lastActive != active { lastActive = active; send(["bridgeVersion": 1, "event": "setActive", "data": ["active": active]]) } }
        func markers() { let value: JSON = ["bridgeVersion": 1, "event": "setMarkers", "data": ["places": store.places, "favoriteIds": Array(store.favorites)]]; guard let raw = try? JSONSerialization.data(withJSONObject: value), let text = String(data: raw, encoding: .utf8), text != lastMarkers else { return }; lastMarkers = text; send(value) }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) { guard message.frameInfo.isMainFrame else { return }; let event: JSON; if let value = message.body as? JSON { event = value } else if let text = message.body as? String, let value = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? JSON { event = value } else { return }; guard event.int("bridgeVersion") == 1 else { return }; if event.str("event") == "rendererReady" { lastMarkers = ""; lastCommand = ""; lastActive = nil; markers(); activity(); if let camera = store.savedCamera { send(["bridgeVersion": 1, "event": "restoreCamera", "data": camera]) } }; if event.str("event") == "cameraChanged" { store.savedCamera = event.obj("data") }; if event.str("event") == "placeSelected" { let value = event.obj("data"); let id = value.str("placeId", value.str("id", value.obj("place").str("id"))); if let place = store.places.first(where: { $0.str("id") == id }) { store.select(place) } else if !value.obj("place").str("id").isEmpty { store.select(value.obj("place")) } else if !value.str("geoName").isEmpty { store.showUnlistedCountry(value) } } }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) { let url = navigationAction.request.url; decisionHandler(url?.isFileURL == true || url?.absoluteString == "about:blank" ? .allow : .cancel) }
    }
}

@MainActor struct CountryView: View {
    @EnvironmentObject var s: WorldStore
    var body: some View {
        Page(s.country?.localized("name", s.locale) ?? "") {
            if let country = s.country {
                Photo(url: country.str("image"), height: 220)
                Text(country.localized("description", s.locale)).lineSpacing(6)
                Text(s.t("探索城市", "Explore cities")).font(ourFont(24, display: true))
                if s.countryCities.isEmpty { Text(s.t("更多城市正在准备中", "More cities are on the way")) }
                ForEach(Array(s.countryCities.enumerated()), id: \.offset) { _, place in
                    Button { s.select(place) } label: {
                        VStack(alignment: .leading, spacing: 12) {
                            Photo(url: place.str("image"), height: 140)
                            Text(place.localized("name", s.locale)).font(ourFont(22, display: true))
                            Text(place.localized("description", s.locale)).lineLimit(2)
                        }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(.white).clipShape(RoundedRectangle(cornerRadius: 22))
                    }.buttonStyle(.plain)
                }
            }
        }
    }
}

@MainActor struct CityView: View { @EnvironmentObject var s: WorldStore; @Environment(\.dismiss) var dismiss; var body: some View { ScrollView { VStack(alignment: .leading, spacing: 20) { if let city = s.city { HStack { Text(city.localized("name", s.locale)).font(ourFont(32, display: true)); Spacer(); Button(s.locale == "zh" ? "EN" : "中", action: s.language) }; Photo(url: city.str("image"), height: 220); Text(city.localized("description", s.locale)); Action(s.t("找当地人", "Meet a local")) { dismiss(); s.startPeople() }; Action(s.favorites.contains(city.str("id")) ? s.t("取消收藏", "Remove saved city") : s.t("收藏城市", "Save city"), action: s.favorite); Button(s.t("城市故事", "City stories")) { dismiss(); s.loadPosts() } } }.padding(24) }.background(paper) } }

@MainActor struct PeopleView: View { var body: some View { TravelPeopleView() } }
@MainActor struct MultiCityView: View {
    @EnvironmentObject var s: WorldStore
    @Environment(\.dismiss) var dismiss
    @State private var selected: Set<String> = []
    @State private var coverage = "any"
    var body: some View {
        NavigationStack {
            Form {
                Picker(s.t("服务范围", "Coverage"), selection: $coverage) {
                    Text(s.t("分别找人", "Find separately")).tag("any")
                    Text(s.t("一人覆盖全部", "One person, all cities")).tag("all")
                }.pickerStyle(.segmented)
                ForEach(Array(s.places.filter { $0.str("kind") == "city" }.enumerated()), id: \.offset) { _, place in
                    Button {
                        if selected.contains(place.str("id")) { selected.remove(place.str("id")) } else { selected.insert(place.str("id")) }
                    } label: {
                        HStack { Text(place.localized("name", s.locale)); Spacer(); Image(systemName: selected.contains(place.str("id")) ? "checkmark.circle.fill" : "circle") }
                    }
                }
            }.navigationTitle(s.t("选择城市", "Choose cities"))
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button(s.t("取消", "Cancel")) { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button(s.t("开始", "Start")) { s.feedCities = selected; s.coverage = coverage; s.restartPeople(); dismiss() }.disabled(selected.isEmpty) }
                }
        }.onAppear { selected = s.feedCities; coverage = s.coverage }
    }
}

@MainActor struct ConversationsView: View { var body: some View { TravelConversationsView() } }
@MainActor struct ChatView: View { var body: some View { TravelChatView() } }

@MainActor struct TripView: View {
    @EnvironmentObject var s: WorldStore
    let trip: JSON
    @State private var bodyText = ""
    @State private var rating = 5
    @State private var editing = false
    @State private var end = Date()
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(trip.str("title")).font(ourFont(18, display: true))
            Text(displayDate(trip.str("endAt"), locale: s.locale)).font(.caption)
            Text(trip.str("status") + (trip.flag("frozen") ? " · " + s.t("争议冻结", "Frozen") : ""))
            if trip.str("status") == "proposed", trip.str("creatorId") != s.user?.str("id") {
                Action(s.t("接受行程", "Accept trip")) { s.tripAction(trip, "accept") }
            }
            if trip.str("status") == "active", !trip.flag("frozen") {
                Action(s.t("确认行程结束", "Confirm trip ended")) { s.tripAction(trip, "confirm-end") }
            }
            if trip.str("status") == "reviewable", !trip.flag("frozen") {
                Stepper("★ \(rating)", value: $rating, in: 1...5)
                Input(label: s.t("线下行程评价", "Trip review"), value: $bodyText)
                Action(s.t("提交评价", "Submit review")) {
                    s.run { _ = try await s.api.call("/trips/\(trip.str("id"))/reviews", method: "POST", body: ["rating": rating, "body": bodyText]); s.notice = s.t("评价已提交", "Review submitted") }
                }
            }
            if !trip.flag("frozen"), trip.str("status") != "cancelled" {
                Button(s.t("调整结束时间", "Change end time")) { end = parseISODate(trip.str("endAt")) ?? Date(); editing.toggle() }
                if editing {
                    Text(s.t("修改后需要对方重新确认", "The other person must accept the revised trip.")).font(.caption)
                    DatePicker(s.t("结束时间", "End time"), selection: $end, displayedComponents: [.date, .hourAndMinute])
                    Action(s.t("发送修改", "Send revision")) { s.editTrip(trip, end: end); editing = false }
                }
            }
            if ["proposed", "active"].contains(trip.str("status")) {
                Button(s.t("取消行程", "Cancel trip")) { s.tripAction(trip, "cancel") }
            }
        }.padding(18).background(ink.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 22))
    }
}

@MainActor func blockTitle(_ type: String, _ s: WorldStore) -> String { switch type { case "intro": return s.t("关于我", "About"); case "gallery": return s.t("照片", "Gallery"); case "experiences": return s.t("旅行经历", "Experiences"); case "skills": return s.t("特长与兴趣", "Skills"); case "cities": return s.t("服务城市", "Cities"); case "packages": return s.t("服务套餐", "Services"); case "posts": return s.t("我的动态", "Stories"); case "reviews": return s.t("服务评价", "Reviews"); default: return s.t("社交链接", "Social") } }
func layoutRows(_ blocks: [JSON]) -> [[JSON]] { var rows: [[JSON]] = []; var half: JSON?; for block in blocks { if block.int("span") == 2 { if let half { rows.append([half]) }; half = nil; rows.append([block]) } else if let other = half { rows.append([other, block]); half = nil } else { half = block } }; if let half { rows.append([half]) }; return rows }

@MainActor struct ProfileRenderer: View { @EnvironmentObject var s: WorldStore; let resource: JSON; var custom: JSON?; var publicView = false; var body: some View { let layout = custom ?? resource.obj("layout"); let rows = layoutRows(layout.rows("blocks").filter { !publicView || visibleProfileBlock(resource, $0) }); VStack(spacing: 12) { ForEach(Array(rows.enumerated()), id: \.offset) { _, row in HStack(alignment: .top, spacing: 12) { ForEach(Array(row.enumerated()), id: \.offset) { _, block in ProfileBlockView(block: block, resource: resource, layout: layout, publicView: publicView).frame(maxWidth: .infinity) }; if row.count == 1 && row[0].int("span") == 1 { Color.clear.frame(maxWidth: .infinity) } } } } } }
@MainActor struct ProfileBlockView: View { @EnvironmentObject var s: WorldStore; let block: JSON; let resource: JSON; let layout: JSON; var publicView = false; var body: some View { let user = resource.obj("user"); VStack(alignment: .leading, spacing: 10) { Text(block.str("title", blockTitle(block.str("type"), s))).font(ourFont(18, display: true)).foregroundStyle(Color(hex: layout.str("accent", "ce795f"))); switch block.str("type") {
    case "intro": Text(block.str("content", user.str("bio")))
    case "gallery": ForEach(block.strings("refs"), id: \.self) { Photo(url: $0) }
    case "experiences": Text(block.str("content", s.t("添加旅行经历", "Add your travel story")))
    case "skills": Text(user.strings("tags").joined(separator: " · "))
    case "cities": Text(referencedResources(resource.rows("places").filter { user.strings("cityIds").contains($0.str("id")) }, refs: block.strings("refs")).map { $0.localized("name", s.locale) }.joined(separator: " · "))
    case "packages": ForEach(Array(referencedResources(resource.rows("packages"), refs: block.strings("refs")).enumerated()), id: \.offset) { _, item in Text(item.str("title")).font(ourFont(18, display: true)); Text(item.str("description")); Text(item.str("price") + " " + item.str("currency") + " / " + item.str("unit")) }
    case "posts": ForEach(Array(referencedResources(resource.rows("posts"), refs: block.strings("refs")).enumerated()), id: \.offset) { _, item in Text(item.str("title")).font(ourFont(18, display: true)); Text(item.str("body")) }
    case "reviews": ForEach(Array(referencedResources(resource.rows("reviews"), refs: block.strings("refs")).enumerated()), id: \.offset) { _, item in Text("★ \(item.int("rating"))  \(item.str("body"))") }
    case "social": ForEach(Array(user.rows("socialLinks").enumerated()), id: \.offset) { _, item in if let url = URL(string: item.str("url")), ["https", "http"].contains(url.scheme ?? "") { Link(item.str("label"), destination: url) } }
    default: EmptyView()
    } }.frame(maxWidth: .infinity, alignment: .leading).padding(publicView ? 0 : block.str("size") == "expanded" ? 24 : 16).background(publicView && layout.str("theme") == "nocturne" ? Color.clear : OWVisual.bg).clipShape(RoundedRectangle(cornerRadius: 24)) } }

@MainActor struct OwnProfileView: View { @EnvironmentObject var s: WorldStore; var body: some View { if let user = s.user { Page("Profile") { Photo(url: user.str("avatar"), height: 300); Text(user.str("name")).font(ourFont(32, display: true)); Text(user.str("id").hasPrefix("demo-") ? s.t("AI 演示人物", "AI demo profile") : user.str("providerStatus")).font(ourFont(12)).foregroundStyle(OWVisual.inkMuted); HStack { Button(s.t("搭建主页", "Build profile"), action: s.edit); Spacer(); Button(s.t("设置", "Settings")) { s.route = "settings" } }; HStack { Button(s.t("发布服务", "Publish service")) { s.route = "packages" }; Spacer(); Button(s.t("资料认证", "Verification")) { s.route = "verification" } }; ProfileRenderer(resource: s.profile) } } else { AuthView() } } }
@MainActor struct PublicProfileView: View { var body: some View { TravelPublicProfileView() } }

@MainActor struct ProfileEditorView: View {
    @EnvironmentObject var s: WorldStore
    @State private var prompt = ""
    @State private var preview = false
    @State private var dragging: String?
    @State private var showHistory = false
    @State private var photo: PhotosPickerItem?
    let types = ["intro", "gallery", "experiences", "skills", "cities", "packages", "posts", "reviews", "social"]
    var body: some View { Page(s.t("搭建我的主页", "Build my profile")) {
        Text(s.t("拖动组件排序；先预览，再发布。", "Drag to reorder. Preview before publishing."))
        Picker(s.t("主题", "Theme"), selection: Binding(get: { s.layout.str("theme", "nocturne") }, set: { s.updateLayout("theme", $0) })) { Text("Ocean").tag("ocean"); Text("Forest").tag("forest"); Text("Nocturne").tag("nocturne") }.pickerStyle(.segmented)
        Input(label: s.t("强调色 HEX", "Accent HEX"), value: Binding(get: { s.layout.str("accent") }, set: { s.updateLayout("accent", $0) }))
        Input(label: s.t("描述你想要的主页", "Describe your ideal profile"), value: $prompt)
        Action(s.t("让 Agent 排版", "Design with Agent"), disabled: prompt.isEmpty || s.busy) { s.generate(prompt) }
        if let job = s.job { Text(job.str("status") + " " + job.str("error")); if job.str("status") == "ready" { ProfileRenderer(resource: s.profile, custom: job.obj("layout")); Action(s.t("应用预览到草稿", "Apply preview to draft"), action: s.applyJob) }; Button(s.t("取消生成", "Cancel generation"), action: s.cancelJob) }
        HStack { Toggle(s.t("预览", "Preview"), isOn: $preview); PhotosPicker(selection: $photo, matching: .images) { Image(systemName: "photo.badge.plus") }; Button(s.t("撤销", "Undo"), action: s.undoLayout); Button(s.t("历史版本", "History")) { showHistory = true } }
        if preview { ProfileRenderer(resource: s.profile, custom: s.layout) } else { ForEach(Array(s.layout.rows("blocks").enumerated()), id: \.offset) { index, block in editorBlock(index, block).onDrag { dragging = block.str("id"); return NSItemProvider(object: block.str("id") as NSString) }.onDrop(of: [UTType.text], isTargeted: nil) { _ in guard let dragging, let from = s.layout.rows("blocks").firstIndex(where: { $0.str("id") == dragging }) else { return false }; move(from, index); self.dragging = nil; return true } } }
        Menu(s.t("添加组件", "Add component")) { ForEach(types, id: \.self) { type in Button(blockTitle(type, s)) { var blocks = s.layout.rows("blocks"); blocks.append(["id": UUID().uuidString, "type": type, "span": 2, "size": "compact"]); s.updateLayout("blocks", blocks) } } }
        Action(s.t("保存草稿", "Save draft"), disabled: s.busy) { s.save() }; Action(s.t("发布主页", "Publish profile"), disabled: s.busy) { s.save(true) }
    }.sheet(isPresented: $showHistory) { ProfileHistoryView().environmentObject(s) }.onChange(of: photo) { value in guard let value else { return }; s.run { if let raw = try await value.loadTransferable(type: Data.self), let image = UIImage(data: raw), let data = image.jpegData(compressionQuality: 0.85) { let file = try await s.api.upload(data, name: "profile.jpg", mime: "image/jpeg", purpose: "public"); var blocks = s.layout.rows("blocks"); let index = blocks.firstIndex { $0.str("type") == "gallery" } ?? blocks.count; if index == blocks.count { blocks.append(["id": UUID().uuidString, "type": "gallery", "span": 2, "size": "expanded"]) }; blocks[index]["refs"] = blocks[index].strings("refs") + [file.str("url")]; s.updateLayout("blocks", blocks) } } } }
    private func change(_ index: Int, _ key: String, _ value: Any) { var blocks = s.layout.rows("blocks"); guard blocks.indices.contains(index) else { return }; blocks[index][key] = value; s.updateLayout("blocks", blocks) }
    private func move(_ from: Int, _ to: Int) { var blocks = s.layout.rows("blocks"); guard blocks.indices.contains(from), blocks.indices.contains(to) else { return }; let block = blocks.remove(at: from); blocks.insert(block, at: to); s.updateLayout("blocks", blocks) }
    private func editorBlock(_ index: Int, _ block: JSON) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "line.3.horizontal")
                Text(blockTitle(block.str("type"), s)).font(ourFont(18, display: true))
                Spacer()
                Button {
                    var blocks = s.layout.rows("blocks")
                    blocks.remove(at: index)
                    s.updateLayout("blocks", blocks)
                } label: { Image(systemName: "trash") }
            }
            Input(label: s.t("标题", "Title"), value: Binding(get: { block.str("title") }, set: { change(index, "title", $0) }))
            if ["intro", "experiences"].contains(block.str("type")) {
                Input(label: s.t("内容", "Content"), value: Binding(get: { block.str("content") }, set: { change(index, "content", $0) }))
            }
            HStack {
                Button("Up") { move(index, index - 1) }
                Button("Down") { move(index, index + 1) }
                Button(block.int("span") == 2 ? s.t("整宽", "Full") : s.t("半宽", "Half")) { change(index, "span", block.int("span") == 2 ? 1 : 2) }
                Button(s.t("尺寸", "Size")) { change(index, "size", block.str("size") == "compact" ? "expanded" : "compact") }
            }
        }.padding(18).background(.white).clipShape(RoundedRectangle(cornerRadius: 20))
    }
}

@MainActor struct ProfileHistoryView: View {
    @EnvironmentObject var s: WorldStore
    @Environment(\.dismiss) var dismiss
    @State private var items: [JSON] = []
    var body: some View {
        NavigationStack {
            List {
                if items.isEmpty { Text(s.t("暂无历史版本", "No published history yet")) }
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    Button(s.t("恢复版本 ", "Restore revision ") + String(item.int("revision"))) {
                        s.run { try await s.restoreRevision(item.int("revision")); dismiss() }
                    }
                }
            }.navigationTitle(s.t("主页历史", "Profile history")).toolbar { ToolbarItem(placement: .cancellationAction) { Button(s.t("关闭", "Close")) { dismiss() } } }
        }.task { s.run { items = try await s.api.call("/profile/history").rows() } }
    }
}

@MainActor struct AuthView: View { @EnvironmentObject var s: WorldStore; @State private var email = ""; @State private var password = ""; @State private var name = ""; @State private var token = ""; @State private var mode = "login"; var body: some View { Page(s.t("欢迎来到 Ourworld", "Welcome to Ourworld")) {
    if s.tab == 2 && s.user == nil {
        Text(s.t("示例主页", "Example profiles")).font(ourFont(24, display: true))
        Text(s.t("当地向导", "Local guides")).font(ourFont(18, display: true))
        Button(s.t("Claire · 巴黎向导示例", "Claire · Paris guide demo")) { s.openProfile("demo-guide-paris") }
        Button(s.t("Haruka · 东京向导示例", "Haruka · Tokyo guide demo")) { s.openProfile("demo-guide-tokyo") }
        Text(s.t("旅行者", "Travelers")).font(ourFont(18, display: true))
        Button(s.t("林予 · 旅人示例", "Lin · Traveler demo")) { s.openProfile("demo-traveler-lin") }
        Button(s.t("Anna · 旅人示例", "Anna · Traveler demo")) { s.openProfile("demo-traveler-anna") }
        Divider()
    }
    if s.user != nil && s.user?.flag("verified") != true { Text(s.t("打开注册邮箱中的验证链接，完成后继续刚才的操作。", "Open the verification email, then continue your previous action.")); Action(s.t("我已完成验证", "I have verified my email")) { s.run { try await s.refreshVerification() } } }
    TextField("Email", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress).textFieldStyle(.roundedBorder); SecureField(s.t("密码", "Password"), text: $password).textFieldStyle(.roundedBorder); if mode == "register" { Input(label: s.t("姓名", "Name"), value: $name) }; Action(mode == "register" ? s.t("注册", "Register") : mode == "forgot" ? s.t("发送重置邮件", "Send reset email") : s.t("登录", "Sign in"), disabled: s.busy) { s.run { if mode == "register" { _ = try await s.api.call("/auth/register", method: "POST", body: ["email": email, "password": password, "name": name]); s.notice = s.t("请查看验证邮件，本地邮件在 Mailpit 中", "Check verification email in Mailpit"); mode = "login" } else if mode == "forgot" { _ = try await s.api.call("/auth/forgot", method: "POST", body: ["email": email]); s.notice = s.t("重置邮件已发送", "Reset email sent") } else { try await s.signedIn(s.api.call("/auth/login", method: "POST", body: ["email": email, "password": password])) } } }; HStack { Button(s.t("注册 / 登录", "Register / Sign in")) { mode = mode == "register" ? "login" : "register" }; Spacer(); Button(s.t("忘记密码", "Forgot password")) { mode = "forgot" } }; Input(label: s.t("邮件验证或重置 Token", "Email verification or reset token"), value: $token); Button(s.t("验证邮箱", "Verify email")) { s.run { _ = try await s.api.call("/auth/verify", method: "POST", body: ["token": token]); if s.user != nil { try await s.refreshVerification() }; s.notice = s.t("邮箱已验证", "Email verified") } }; Button(s.t("设置新密码", "Set new password")) { s.run { _ = try await s.api.call("/auth/reset", method: "POST", body: ["token": token, "password": password]); s.notice = s.t("密码已重置", "Password reset") } } } } }

@MainActor struct SettingsView: View {
    @EnvironmentObject var s: WorldStore
    @State private var name = ""
    @State private var bio = ""
    @State private var tags = ""
    @State private var cityIds = ""
    @State private var quote = ""
    @State private var avatar: PhotosPickerItem?
    var body: some View {
        Page(s.t("设置与资料", "Settings & details")) {
            Photo(url: s.user?.str("avatar") ?? "", height: 160)
            PhotosPicker(selection: $avatar, matching: .images) { Text(s.t("更换头像", "Change portrait")) }
            Input(label: s.t("姓名", "Name"), value: $name)
            Input(label: s.t("个人简介", "Bio"), value: $bio)
            Input(label: s.t("特长，逗号分隔", "Skills, comma separated"), value: $tags)
            Input(label: s.t("展示报价", "Displayed quote"), value: $quote)
            Text(s.t("选择服务城市", "Choose service cities"))
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())]) {
                ForEach(Array(s.places.filter { $0.str("kind") == "city" }.enumerated()), id: \.offset) { _, place in
                    Button {
                        var ids = Set(cityIds.split(separator: ",").map(String.init))
                        if ids.contains(place.str("id")) { ids.remove(place.str("id")) } else { ids.insert(place.str("id")) }
                        cityIds = ids.sorted().joined(separator: ",")
                    } label: {
                        Text((cityIds.split(separator: ",").map(String.init).contains(place.str("id")) ? "✓ " : "") + place.localized("name", s.locale))
                            .padding(10).frame(maxWidth: .infinity).background(.white).clipShape(Capsule())
                    }
                }
            }
            Action(s.t("保存资料", "Save details")) {
                s.run {
                    s.user = try await s.api.call("/me", method: "PATCH", body: ["name": name, "bio": bio, "tags": tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }, "cityIds": cityIds.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }, "quote": quote])
                    s.notice = s.t("已保存", "Saved")
                }
            }
            Action(s.t("切换中英文", "Switch language"), action: s.language)
            GlobeCreditsView()
            Button(s.t("退出登录", "Sign out"), action: s.logout)
        }.onAppear {
            name = s.user?.str("name") ?? ""; bio = s.user?.str("bio") ?? ""
            tags = s.user?.strings("tags").joined(separator: ",") ?? ""
            cityIds = s.user?.strings("cityIds").joined(separator: ",") ?? ""
            quote = s.user?.str("quote") ?? ""
        }.onChange(of: avatar) { value in
            guard let value else { return }
            s.run {
                if let raw = try await value.loadTransferable(type: Data.self), let image = UIImage(data: raw), let data = image.jpegData(compressionQuality: 0.85) {
                    let file = try await s.api.upload(data, name: "portrait.jpg", mime: "image/jpeg", purpose: "public")
                    s.user = try await s.api.call("/me", method: "PATCH", body: ["avatar": file.str("url")])
                }
            }
        }
    }
}

@MainActor struct GlobeCreditsView: View {
    @EnvironmentObject var s: WorldStore
    var body: some View {
        DisclosureGroup(s.t("地球影像来源", "Earth imagery credits")) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Earth surface: NASA Earth Observatory / Reto Stöckli. Boundaries: Natural Earth, via world-atlas. NASA does not endorse this app.")
                Text(s.t("地表基于2004年7月历史影像统一调色；无云层，不随昼夜变化。", "Recolored July 2004 surface imagery. No clouds or day/night changes."))
                if let url = nativeMediaURL("/api/v1/photo-credits", base: s.api.base) { Link(s.t("摄影素材与来源", "Photography credits"), destination: url) }
                Link(s.t("日间影像 · NASA", "Day imagery · NASA"), destination: URL(string: "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/")!)
            }.font(ourFont(14)).padding(.top, 12).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

@MainActor struct PackagesView: View {
    @EnvironmentObject var s: WorldStore
    @State private var title = ""
    @State private var description = ""
    @State private var price = ""
    @State private var currency = "USD"
    @State private var unit = "day"
    @State private var imageURL = ""
    @State private var photo: PhotosPickerItem?
    @State private var editing: String?
    @State private var items: [JSON] = []
    var body: some View {
        Page(s.t("我的服务套餐", "My services")) {
            Input(label: s.t("名称", "Title"), value: $title)
            Input(label: s.t("服务内容", "Description"), value: $description)
            Input(label: s.t("报价", "Price"), value: $price)
            Input(label: s.t("币种", "Currency"), value: $currency)
            Picker(s.t("计价单位", "Unit"), selection: $unit) {
                Text(s.t("天", "Day")).tag("day"); Text(s.t("小时", "Hour")).tag("hour"); Text(s.t("整次", "Trip")).tag("trip")
            }.pickerStyle(.segmented)
            Photo(url: imageURL)
            PhotosPicker(selection: $photo, matching: .images) { Text(s.t("添加套餐图片", "Add service photo")) }
            Action(s.t("保存草稿", "Save draft")) { submit("draft") }
            Action(s.t("发布服务", "Publish service")) { submit("published") }
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: 12) {
                    Text(item.str("title") + " · " + item.str("status"))
                    HStack {
                        Button(s.t("编辑", "Edit")) {
                            editing = item.str("id"); title = item.str("title"); description = item.str("description")
                            price = item.str("price"); currency = item.str("currency"); unit = item.str("unit", "day"); imageURL = item.str("image")
                        }
                        Button(s.t("发布", "Publish")) { s.run { _ = try await s.api.call("/packages/\(item.str("id"))", method: "PATCH", body: ["status": "published"]); try await refresh() } }
                        Button(s.t("下架", "Archive")) { s.run { _ = try await s.api.call("/packages/\(item.str("id"))", method: "DELETE"); try await refresh() } }
                    }
                }.padding(16).background(.white).clipShape(RoundedRectangle(cornerRadius: 18))
            }
        }.task { try? await refresh() }.onChange(of: photo) { value in
            guard let value else { return }
            s.run {
                if let raw = try await value.loadTransferable(type: Data.self), let image = UIImage(data: raw), let data = image.jpegData(compressionQuality: 0.85) {
                    imageURL = try await s.api.upload(data, name: "service.jpg", mime: "image/jpeg", purpose: "public").str("url")
                }
            }
        }
    }
    private func refresh() async throws { items = try await s.api.call("/packages?userId=\(s.user?.str("id") ?? "")").rows() }
    private func submit(_ status: String) {
        s.run {
            _ = try await s.api.call(editing.map { "/packages/" + $0 } ?? "/packages", method: editing == nil ? "POST" : "PATCH", body: ["title": title, "description": description, "price": price, "currency": currency, "unit": unit, "cityIds": s.user?.strings("cityIds") ?? [], "image": imageURL, "status": status])
            try await refresh(); title = ""; description = ""; editing = nil; imageURL = ""
        }
    }
}

@MainActor struct VerificationView: View { @EnvironmentObject var s: WorldStore; @State private var kind = "experience"; @State private var description = ""; @State private var files: [String] = []; @State private var status: JSON = [:]; @State private var importing = false; var body: some View { Page(s.t("资料认证", "Verification")) { Text(status.str("status") + " " + status.str("reason")); Picker(s.t("材料类型", "Type"), selection: $kind) { Text(s.t("旅行经历", "Experience")).tag("experience"); Text(s.t("专业资质", "Professional")).tag("professional") }.pickerStyle(.segmented); Input(label: s.t("经历或资质说明", "Experience or credentials"), value: $description); Button(s.t("上传审核材料", "Upload documents")) { importing = true }; Text("\(files.count) " + s.t("份材料", "documents")); Action(s.t("提交审核", "Submit for review")) { s.run { status = try await s.api.call("/verification", method: "POST", body: ["kind": kind, "name": s.user?.str("name") ?? "", "description": description, "fileIds": files]) } } }.task { status = (try? await s.api.call("/verification")) ?? [:] }.fileImporter(isPresented: $importing, allowedContentTypes: [.image, .pdf]) { result in guard case .success(let url) = result else { return }; let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }; guard let data = try? Data(contentsOf: url) else { return }; let mime = url.pathExtension.lowercased() == "pdf" ? "application/pdf" : (UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "image/jpeg"); s.run { let file = try await s.api.upload(data, name: url.lastPathComponent, mime: mime, purpose: "verification"); files.append(file.str("id")) } } } }

@MainActor struct StoriesView: View {
    @EnvironmentObject var s: WorldStore
    @State private var title = ""
    @State private var bodyText = ""
    @State private var images: [String] = []
    @State private var photo: PhotosPickerItem?
    @State private var selected: JSON?
    @State private var comments: [JSON] = []
    @State private var comment = ""
    var body: some View {
        Page(s.t("城市故事", "City stories")) {
            Input(label: s.t("标题", "Title"), value: $title)
            Input(label: s.t("分享你的故事", "Share your story"), value: $bodyText)
            ForEach(images, id: \.self) { Photo(url: $0) }
            PhotosPicker(selection: $photo, matching: .images) { Text(s.t("添加照片", "Add photo")) }
            Action(s.t("发布故事", "Publish story")) {
                guard s.requireLogin() else { return }
                s.run {
                    _ = try await s.api.call("/posts", method: "POST", body: ["title": title, "body": bodyText, "cityId": s.city?.str("id") ?? "", "images": images])
                    title = ""; bodyText = ""; images = []; try await refresh()
                }
            }
            ForEach(Array(s.posts.enumerated()), id: \.offset) { _, post in story(post) }
            if let selected {
                Text(s.t("评论", "Comments")).font(ourFont(20, display: true))
                ForEach(Array(comments.enumerated()), id: \.offset) { _, item in Text(item.str("body")) }
                Input(label: s.t("写评论", "Write a comment"), value: $comment)
                Action(s.t("发送评论", "Send comment")) {
                    guard s.requireLogin() else { return }
                    s.run {
                        _ = try await s.api.call("/posts/\(selected.str("id"))/comments", method: "POST", body: ["body": comment])
                        comment = ""; comments = try await s.api.call("/posts/\(selected.str("id"))/comments").rows()
                    }
                }
            }
        }.onChange(of: photo) { value in
            guard let value, s.requireLogin() else { return }
            s.run {
                if let raw = try await value.loadTransferable(type: Data.self), let image = UIImage(data: raw), let data = image.jpegData(compressionQuality: 0.85) {
                    images.append(try await s.api.upload(data, name: "story.jpg", mime: "image/jpeg", purpose: "public").str("url"))
                }
            }
        }
    }
    private func story(_ post: JSON) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(post.obj("author").str("name")) { s.openProfile(post.str("userId")) }
            Text(post.str("title")).font(ourFont(21, display: true))
            Text(post.str("body"))
            ForEach(post.strings("images"), id: \.self) { Photo(url: $0) }
            HStack {
                Button("♡ \(post.int("likes"))") {
                    guard s.requireLogin() else { return }
                    s.run { _ = try await s.api.call("/posts/\(post.str("id"))/like", method: post.flag("liked") ? "DELETE" : "PUT"); try await refresh() }
                }
                Button(s.t("评论", "Comments")) { selected = post; s.run { comments = try await s.api.call("/posts/\(post.str("id"))/comments").rows() } }
                Button(s.t("举报", "Report")) { s.report("post", id: post.str("id")) }
            }
        }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(.white).clipShape(RoundedRectangle(cornerRadius: 22))
    }
    private func refresh() async throws { s.posts = try await s.api.call("/posts?cityId=\(s.city?.str("id") ?? "")").rows() }
}
