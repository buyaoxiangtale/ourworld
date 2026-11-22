import SwiftUI
import UIKit
import PhotosUI

@MainActor final class DeckMotion: NSObject, ObservableObject {
    @Published var x: CGFloat = 0
    @Published var y: CGFloat = 0
    private var link: CADisplayLink?
    private var velocity: CGFloat = 0
    private var last: CFTimeInterval = 0
    private var start: CFTimeInterval = 0
    private var initial: CGFloat = 0
    private var target: CGFloat = 0
    private var duration: Double = 0
    func stop() { link?.invalidate(); link = nil }
    func reset() { stop(); x = 0; y = 0 }
    func spring(_ speed: CGFloat = 0) { stop(); velocity = speed; duration = 0; begin() }
    func fly(to: CGFloat, duration: Double) { stop(); initial = x; target = to; self.duration = duration; begin() }
    private func begin() { last = CACurrentMediaTime(); start = last; let display = CADisplayLink(target: self, selector: #selector(step)); display.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120); display.add(to: .main, forMode: .common); link = display }
    @objc private func step() {
        let now = CACurrentMediaTime(), dt = min(now - last, 0.025); last = now
        if duration > 0 { let p = min(1, (now - start) / duration); x = initial + (target - initial) * CGFloat(1 - pow(1 - p, 3)); if p == 1 { stop() } }
        else { velocity += (-400 * x - 32.8 * velocity) * dt; x += velocity * dt; y *= 0.8; if abs(x) < 0.3 && abs(velocity) < 3 { reset() } }
    }
}

func travelSwipeDirection(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ velocity: CGFloat) -> Int {
    guard width > 0, abs(x) > abs(y) * 1.2 else { return 0 }
    let fast = abs(velocity) >= OWVisual.motion_flingVelocity
    if fast && velocity * x < 0 { return 0 }
    return abs(x) >= width * OWVisual.motion_distancePercent / 100 || (fast && abs(x) >= width * OWVisual.motion_flingPercent / 100) ? (x > 0 ? 1 : -1) : 0
}

@MainActor struct TravelPeopleView: View {
    @EnvironmentObject var s: WorldStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var motion = DeckMotion()
    @State private var horizontal: Bool?
    @State private var origin: CGFloat = 0
    @State private var samples: [(Date, CGFloat)] = []
    @State private var crossed = false
    @State private var locked = false
    @State private var range = false
    @State private var operation: Task<Void, Never>?
    var body: some View {
        GeometryReader { geometry in
            let width = max(1, geometry.size.width - 32)
            let progress = min(1, abs(motion.x) / (width * 0.25))
            VStack(spacing: 0) {
                HStack {
                    Button { s.route = "city" } label: { Image(systemName: "arrow.left").frame(width: 48, height: 48) }.accessibilityLabel(s.t("返回", "Back"))
                    VStack(alignment: .leading, spacing: 3) { Text(s.feedCities.count > 1 ? "\(s.feedCities.count) " + s.t("个城市", "cities") : s.city?.localized("name", s.locale) ?? "").font(ourFont(22)).fontWeight(.semibold).lineLimit(1); Text(s.t("认识当地人", "Meet the locals")).font(ourFont(12)).foregroundStyle(moonMuted) }
                    Spacer(minLength: 0)
                    Button { range = true } label: { Image(systemName: "slider.horizontal.3").frame(width: 48, height: 48) }.accessibilityLabel(s.t("相遇范围", "Places")).disabled(locked)
                }.foregroundStyle(moon).padding(.horizontal, 8).frame(minHeight: 56)
                if s.people.indices.contains(s.personIndex) {
                    let person = s.people[s.personIndex]
                    GeometryReader { card in
                        ZStack {
                            ForEach(Array((0...2).reversed()), id: \.self) { depth in
                                if s.people.indices.contains(s.personIndex + depth) {
                                    let p = s.people[s.personIndex + depth]
                                    personCard(p, height: card.size.height, front: depth == 0)
                                        .scaleEffect(depth == 0 ? 1 : 1 - CGFloat(depth) * 0.04 + progress * 0.04)
                                        .offset(x: depth == 0 ? motion.x : 0, y: depth == 0 ? motion.y * 0.15 : (CGFloat(depth) - progress) * 10)
                                        .rotationEffect(.degrees(depth == 0 && !reduceMotion ? Double(max(-12, min(12, motion.x / width * 12))) : 0), anchor: .bottom)
                                        .allowsHitTesting(depth == 0 && !locked)
                                        .zIndex(Double(3 - depth))
                                        .gesture(drag(person, width: width), including: depth == 0 ? .all : .none)
                                }
                            }
                        }
                    }.padding(.horizontal, 16).padding(.vertical, 8)
                    if !s.peopleError.isEmpty { HStack { Text(s.peopleError).font(ourFont(14)); Button(s.t("重试", "Retry")) { choose(1, person: person, width: width) } }.foregroundStyle(moon).padding(12).background(nightSurface).clipShape(RoundedRectangle(cornerRadius: 12)).padding(.horizontal, 16) }
                    HStack(spacing: 32) {
                        Button { choose(-1, person: person, width: width) } label: { Image(systemName: "xmark").font(.system(size: 26)).frame(width: 56, height: 56).background(OWVisual.nope, in: Circle()).foregroundStyle(OWVisual.bg) }.accessibilityLabel(s.t("略过", "Pass"))
                        Button { choose(1, person: person, width: width) } label: { Group { if locked && !s.connectingPerson.isEmpty { EarthLoading(size: 20) } else { Image(systemName: "bubble.left").font(.system(size: 26)) } }.frame(width: 60, height: 60).background(OWVisual.like, in: Circle()).foregroundStyle(OWVisual.bg) }.accessibilityLabel(s.t("加入对话", "Add to chats"))
                    }.buttonStyle(.plain).disabled(locked).frame(height: 80)
                } else {
                    Spacer()
                    VStack(alignment: .leading, spacing: 16) { if s.peopleLoading { EarthLoading() } else { Text(s.peopleError.isEmpty ? s.t("这一轮，先到这里", "You've explored this round") : s.t("暂时无法载入人物", "Couldn't load people")).font(ourFont(22)); Text(s.peopleError.isEmpty ? s.t("重新开始，或探索另一座城市。", "Start again or discover another city.") : s.peopleError).font(ourFont(14)); Button(s.t("重新载入", "Try again")) { if s.peopleError.isEmpty { s.restartPeople() } else { Task { await s.loadPeople() } } }.padding(12).background(moon).foregroundStyle(night).clipShape(Capsule()) } }.padding(24).frame(maxWidth: .infinity, alignment: .leading).background(nightSurface).clipShape(RoundedRectangle(cornerRadius: 24)).foregroundStyle(moon).padding(16)
                    Spacer()
                }
            }.background(Color.black.opacity(0.14))
            .onChange(of: s.personIndex) { _ in motion.reset(); horizontal = nil }
            .onChange(of: s.resumeConnectId) { id in if s.people.indices.contains(s.personIndex), s.people[s.personIndex].str("id") == id { s.resumeConnectId = ""; choose(1, person: s.people[s.personIndex], width: width) } }
            .onAppear { if s.people.indices.contains(s.personIndex), !s.resumeConnectId.isEmpty { s.resumeConnectId = ""; choose(1, person: s.people[s.personIndex], width: width) } }
        }.sheet(isPresented: $range) { MultiCityView().environmentObject(s).preferredColorScheme(.dark).presentationDetents([.medium, .large]) }
        .onDisappear { operation?.cancel(); motion.stop() }
    }
    private func personCard(_ person: JSON, height: CGFloat, front: Bool) -> some View {
        Photo(url: person.str("avatar"), height: height, cornerRadius: 24)
            .overlay { LinearGradient(colors: [.clear, .clear, .black.opacity(0.8)], startPoint: .top, endPoint: .bottom).clipShape(RoundedRectangle(cornerRadius: 24)) }
            .overlay(alignment: .bottomLeading) { if front { VStack(alignment: .leading, spacing: 8) { Text(person.str("name")).font(ourFont(32)).fontWeight(.semibold).lineLimit(2); Text(person.str("id").hasPrefix("demo-") || person.str("id").hasPrefix("load-") ? s.t("AI 演示人物", "AI demo profile") : person.str("accountType") == "agency" ? person.str("providerStatus") == "approved" ? s.t("认证旅行社", "Certified agency") : s.t("旅行社认证审核中", "Agency certification pending") : person.str("providerStatus") == "approved" ? s.t("个人导游", "Personal guide") : s.t("认识当地人", "Meet a local")).font(ourFont(12)); if person.has("rating") || person.has("priceRange") { Text([person.has("rating") ? "\u{2605} \(travelNumber(person.dbl("rating")))" : "", person.has("priceRange") ? travelPriceRange(person.obj("priceRange"), s.locale) : ""].filter { !$0.isEmpty }.joined(separator: " · ")).font(ourFont(14)).fontWeight(.semibold) }; if !person.strings("tags").isEmpty { Text(person.strings("tags").prefix(2).joined(separator: " · ")).font(ourFont(14)) } }.foregroundStyle(.white).padding(.leading, 20).padding(.trailing, 68).padding(.bottom, 24) } }
            .overlay(alignment: .bottomTrailing) { if front { Button { s.openProfile(person.str("id")) } label: { Image(systemName: "info.circle").font(.system(size: 24)).foregroundStyle(.white).frame(width: 48, height: 48) }.buttonStyle(.plain).accessibilityLabel(s.t("查看主页", "View profile")).padding(.trailing, 12).padding(.bottom, 16) } }
            .overlay(alignment: motion.x > 0 ? .topLeading : .topTrailing) { if front && abs(motion.x) > 8 { Text(motion.x > 0 ? s.t("聊一聊", "LET'S TALK") : s.t("略过", "PASS")).font(ourFont(22)).fontWeight(.semibold).foregroundStyle(motion.x > 0 ? OWVisual.like : OWVisual.nope).padding(12).background(.white).clipShape(RoundedRectangle(cornerRadius: 12)).opacity(min(1, abs(motion.x) / 80)).padding(20) } }
    }
    private func drag(_ person: JSON, width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 10).onChanged { value in
            guard !locked else { return }
            if horizontal == nil { motion.stop(); origin = motion.x; horizontal = abs(value.translation.width) > abs(value.translation.height) * 1.2; samples = []; crossed = false }
            guard horizontal == true else { return }
            motion.x = origin + value.translation.width; motion.y = max(-32, min(32, value.translation.height))
            samples = samples.filter { value.time.timeIntervalSince($0.0) < 0.12 }; samples.append((value.time, value.location.x))
            if !crossed && abs(motion.x) >= width * 0.25 { crossed = true; UISelectionFeedbackGenerator().selectionChanged() }
        }.onEnded { value in
            let speed = samples.first.map { (value.location.x - $0.1) / max(0.001, value.time.timeIntervalSince($0.0)) } ?? 0
            let direction = horizontal == true ? travelSwipeDirection(motion.x, value.translation.height, width, speed) : 0
            horizontal = nil
            if direction == 0 { motion.spring(speed) } else { choose(direction, person: person, width: width, speed: speed) }
        }
    }
    private func choose(_ direction: Int, person: JSON, width: CGFloat, speed: CGFloat = 0) {
        guard !locked else { return }
        if direction > 0 && !s.ensureConnectAuth(person) { motion.reset(); return }
        locked = true; motion.stop(); let generation = s.feedGeneration
        let duration = reduceMotion ? 0.06 : max(0.18, min(0.28, abs(CGFloat(direction) * width * 1.45 - motion.x) / max(abs(speed), width * 4)))
        motion.fly(to: CGFloat(direction) * width * 1.45, duration: duration)
        operation = Task { let request = Task { direction < 0 ? true : await s.connectForSwipe(person) }; try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000)); guard !Task.isCancelled else { request.cancel(); return }; let success = await request.value; guard !Task.isCancelled, generation == s.feedGeneration else { return }; if success { s.advancePerson(person.str("id"), generation: generation); motion.reset() } else { motion.spring() }; locked = false }
    }
}

func travelPriceRange(_ range: JSON, _ locale: String) -> String {
    let units: [String: (String, String)] = ["hour": ("小时", "hour"), "half-day": ("半日", "half-day"), "day": ("天", "day"), "experience": ("次", "experience")]
    let unit = units[range.str("unit")] ?? ("天", "day")
    let unitText = locale == "zh" ? unit.0 : unit.1
    let value = travelNumber(range.dbl("min")) + "\u{2013}" + travelNumber(range.dbl("max"))
    return "\(range.str("currency")) \(value) / \(unitText)"
}

/// Collapses whole numbers so ratings and prices never render a trailing ".0".
func travelNumber(_ value: Double) -> String { value.isFinite && value == value.rounded() ? String(Int(value)) : String(value) }

@MainActor func visibleProfileBlock(_ resource: JSON, _ block: JSON) -> Bool {
    let user = resource.obj("user"), type = block.str("type")
    switch type { case "intro": return !block.str("content", user.str("bio")).isEmpty; case "prompts": return !block.rows("prompts").isEmpty; case "experiences": return !block.str("content").isEmpty; case "gallery": return !block.strings("refs").isEmpty; case "skills": return !user.strings("tags").isEmpty; case "cities": return !user.strings("cityIds").isEmpty; case "social": return !user.rows("socialLinks").isEmpty; default: return !referencedResources(resource.rows(type), refs: block.strings("refs")).isEmpty }
}

/// Photos for the profile strip: gallery refs first, falling back to story images like the web gallery block.
func profilePhotoURLs(_ resource: JSON) -> [String] {
    let refs = resource.obj("layout").rows("blocks").filter { $0.str("type") == "gallery" }.flatMap { $0.strings("refs") }
    return refs.isEmpty ? resource.rows("posts").flatMap { $0.strings("images") } : refs
}

/// Travel Q&A entries collected from prompts blocks of the published layout.
func profilePromptEntries(_ resource: JSON) -> [JSON] {
    resource.obj("layout").rows("blocks").filter { $0.str("type") == "prompts" }.flatMap { $0.rows("prompts") }
}

/// Layout copy without the block types the Michael-style header/chips/photo/prompt/interest sections already render.
func remainingProfileLayout(_ layout: JSON) -> JSON {
    var value = layout
    value["blocks"] = value.rows("blocks").filter { !["gallery", "skills", "cities", "prompts"].contains($0.str("type")) }
    return value
}

@MainActor struct TravelPublicProfileView: View {
    @EnvironmentObject var s: WorldStore
    @State private var bannerDismissed = false
    var body: some View {
        let user = s.profile.obj("user")
        let owner = false // This is the visitor preview; owner editing has a separate view.
        let remaining = remainingProfileLayout(s.profile.obj("layout"))
        VStack(spacing: 0) {
            HStack { if s.route == "public" { Button(action: s.back) { Image(systemName: "arrow.left").frame(width: 48, height: 48) } }; Text(owner ? s.t("我的主页", "My profile") : s.t("个人主页", "Profile")).font(ourFont(20)).fontWeight(.semibold); Spacer(); if !owner { Menu { Button(s.t("举报用户", "Report person")) { s.report("user", id: user.str("id")) } } label: { Image(systemName: "ellipsis").frame(width: 48, height: 48) } } }.padding(.horizontal, 8)
            ScrollView { VStack(alignment: .leading, spacing: 20) {
                Photo(url: user.str("avatar"), height: 340)
                VStack(alignment: .leading, spacing: 8) {
                    Text(user.str("name")).font(ourFont(32)).fontWeight(.semibold)
                    headerBadges(user)
                    if user.has("rating") || user.has("experienceYears") || !user.strings("languages").isEmpty { Text([user.has("rating") ? "\u{2605} \(travelNumber(user.dbl("rating")))" : "", user.has("experienceYears") ? s.t("\(user.int("experienceYears")) 年经验", "\(user.int("experienceYears")) yrs") : "", user.strings("languages").prefix(3).joined(separator: " / ")].filter { !$0.isEmpty }.joined(separator: " · ")).font(ourFont(14)).foregroundStyle(OWVisual.inkMuted) }
                    if user.has("priceRange") { Text(travelPriceRange(user.obj("priceRange"), s.locale)).font(ourFont(16)).fontWeight(.semibold).foregroundStyle(OWVisual.accent) }
                }
                if owner, !bannerDismissed, completeness(user) < 100 { completenessBanner(user) }
                infoChips(user, owner: owner)
                photoSection(owner: owner)
                promptSection(owner: owner)
                interestSection(user, owner: owner)
                if !s.profile.obj("layout").rows("blocks").contains(where: { $0.str("type") == "intro" }) { Text(user.str("bio")) }
                ProfileRenderer(resource: s.profile, custom: remaining, publicView: true)
                if owner { ownerTools() }
            }.padding(.horizontal, 16).padding(.bottom, 24) }
            if user.str("id") != s.user?.str("id") { Button { s.connect(user) } label: { Label(s.t("加入对话", "Add to chats"), systemImage: "bubble.left").fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 52).background(coral).foregroundStyle(OWVisual.accentInk).clipShape(Capsule()) }.disabled(!s.connectingPerson.isEmpty).padding(16) }
        }.starlight().foregroundStyle(ink)
    }
    private func headerBadges(_ user: JSON) -> some View {
        HStack(spacing: 8) {
            if user.str("id").hasPrefix("demo-") || user.str("id").hasPrefix("load-") { profileBadge(s.t("AI 演示人物", "AI demo profile"), system: "sparkles", color: OWVisual.inkMuted) }
            if user.str("accountType") == "agency" { profileBadge(user.str("providerStatus") == "approved" ? s.t("认证旅行社", "Certified agency") : s.t("旅行社认证审核中", "Agency certification pending"), system: "trophy", color: OWVisual.focus) }
            else if user.str("providerStatus") == "approved" { profileBadge(s.t("个人导游", "Personal guide"), system: "checkmark.seal", color: OWVisual.accent) }
        }
    }
    private func profileBadge(_ text: String, system: String, color: Color) -> some View {
        Label(text, systemImage: system).font(ourFont(12)).fontWeight(.medium).foregroundStyle(color).padding(.horizontal, 10).padding(.vertical, 5).background(color.opacity(0.15), in: Capsule())
    }
    private func completeness(_ user: JSON) -> Int {
        var missing = 0
        if !user.has("priceRange") { missing += 30 }
        if profilePhotoURLs(s.profile).count < 3 { missing += 30 }
        if profilePromptEntries(s.profile).isEmpty { missing += 25 }
        if user.str("bio").isEmpty { missing += 15 }
        return 100 - missing
    }
    private func completenessBanner(_ user: JSON) -> some View {
        let pills = [(s.t("未填报价", "No price range"), !user.has("priceRange")), (s.t("照片少于 3 张", "Under 3 photos"), profilePhotoURLs(s.profile).count < 3), (s.t("无旅行问答", "No travel Q&A"), profilePromptEntries(s.profile).isEmpty), (s.t("未填简介", "No bio yet"), user.str("bio").isEmpty)].filter { $0.1 }
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) { Text(s.t("完善你的主页", "Complete your profile")).font(ourFont(16)).fontWeight(.semibold); Spacer(); Text("\(completeness(user))%").font(ourFont(16)).fontWeight(.semibold).foregroundStyle(OWVisual.accent); Button { bannerDismissed = true } label: { Image(systemName: "xmark").font(ourFont(12)).foregroundStyle(OWVisual.inkMuted).frame(width: 32, height: 32).contentShape(Rectangle()) }.accessibilityLabel(s.t("关闭", "Dismiss")) }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 138), alignment: .leading)], alignment: .leading, spacing: 8) {
                ForEach(Array(pills.enumerated()), id: \.offset) { _, pill in HStack(spacing: 6) { Circle().fill(OWVisual.nope).frame(width: 6, height: 6); Text(pill.0).font(ourFont(12)).foregroundStyle(OWVisual.inkMuted) }.padding(.horizontal, 10).padding(.vertical, 6).background(OWVisual.surface, in: Capsule()) }
            }
        }.padding(14).background(OWVisual.raised).clipShape(RoundedRectangle(cornerRadius: OWVisual.radii_field))
    }
    private struct ProfileChip { let value: String?; let placeholder: String; let redDot: Bool }
    private func infoChips(_ user: JSON, owner: Bool) -> some View {
        let cities = s.profile.rows("places").filter { user.strings("cityIds").contains($0.str("id")) }.map { $0.localized("name", s.locale) }
        let languages = Array(user.strings("languages").prefix(4))
        let specialties = Array(user.strings("tags").prefix(3))
        var chips: [ProfileChip] = []
        if cities.isEmpty { chips.append(ProfileChip(value: nil, placeholder: s.t("服务城市", "Service cities"), redDot: false)) } else { chips += cities.map { ProfileChip(value: $0, placeholder: "", redDot: false) } }
        if user.has("experienceYears") { chips.append(ProfileChip(value: s.t("\(user.int("experienceYears")) 年经验", "\(user.int("experienceYears")) yrs experience"), placeholder: "", redDot: false)) } else { chips.append(ProfileChip(value: nil, placeholder: s.t("从业年限", "Years of experience"), redDot: false)) }
        if languages.isEmpty { chips.append(ProfileChip(value: nil, placeholder: s.t("语言", "Languages"), redDot: false)) } else { chips += languages.map { ProfileChip(value: $0, placeholder: "", redDot: false) } }
        if user.has("priceRange") { chips.append(ProfileChip(value: travelPriceRange(user.obj("priceRange"), s.locale), placeholder: "", redDot: false)) } else { chips.append(ProfileChip(value: nil, placeholder: s.t("报价区间", "Price range"), redDot: true)) }
        if specialties.isEmpty { chips.append(ProfileChip(value: nil, placeholder: s.t("专长", "Specialties"), redDot: false)) } else { chips += specialties.map { ProfileChip(value: $0, placeholder: "", redDot: false) } }
        let education = profileEducationText(user, s.locale)
        if !education.isEmpty { chips.append(ProfileChip(value: education, placeholder: "", redDot: false)) }
        let visible = chips.filter { $0.value != nil || owner }
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), alignment: .leading)], alignment: .leading, spacing: 8) {
            ForEach(Array(visible.enumerated()), id: \.offset) { _, chip in
                if let value = chip.value { profileValueChip(value) } else { emptyProfileChip(chip.placeholder, redDot: chip.redDot) { s.route = "settings" } }
            }
        }
    }
    private func profileValueChip(_ text: String) -> some View {
        Text(text).font(ourFont(12)).foregroundStyle(OWVisual.inkMuted).lineLimit(1).padding(.horizontal, 12).padding(.vertical, 7).background(OWVisual.raised, in: Capsule())
    }
    private func emptyProfileChip(_ label: String, redDot: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) { HStack(spacing: 5) { if redDot { Circle().fill(OWVisual.nope).frame(width: 6, height: 6) }; Image(systemName: "plus").font(ourFont(11)).fontWeight(.semibold); Text(label) }.font(ourFont(12)).foregroundStyle(OWVisual.accent).padding(.horizontal, 12).padding(.vertical, 7).overlay(Capsule().strokeBorder(OWVisual.accent, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))) }.buttonStyle(.plain)
    }
    private func photoSection(owner: Bool) -> some View {
        let photos = profilePhotoURLs(s.profile)
        return Group { if owner || !photos.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack { Text(s.t("我的照片", "My photos")).font(ourFont(18, display: true)); Spacer(); if owner { Button { s.editProfileCard("gallery") } label: { Text(s.t("编辑", "Edit")).font(ourFont(12)).fontWeight(.semibold).foregroundStyle(OWVisual.ink).padding(.horizontal, 14).padding(.vertical, 7).background(OWVisual.accentInk, in: Capsule()) }.buttonStyle(.plain).accessibilityLabel(s.t("编辑照片", "Edit photos")) } }
                if photos.isEmpty {
                    if owner { Button { s.editProfileCard("gallery") } label: { HStack(spacing: 8) { Image(systemName: "plus").font(.system(size: 18)); Text(s.t("添加照片", "Add photos")).font(ourFont(14)) }.foregroundStyle(OWVisual.accent).frame(maxWidth: .infinity, minHeight: 120).overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(OWVisual.accent, style: StrokeStyle(lineWidth: 1, dash: [6, 5]))) }.buttonStyle(.plain) }
                } else {
                    ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 10) { ForEach(Array(photos.enumerated()), id: \.offset) { _, url in Photo(url: url, height: 150, cornerRadius: 16).frame(width: 120) } } }
                }
                if owner { Text(s.t("Pro tip · 照片多样一些：街头、作品、日常。", "Pro tip · Mix it up: streets, craft, everyday.")).font(ourFont(12)).foregroundStyle(OWVisual.inkFaint) }
            }
        } }
    }
    private func promptSection(owner: Bool) -> some View {
        let prompts = profilePromptEntries(s.profile)
        return Group {
            if !prompts.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text(s.t("旅行问答", "Travel prompts")).font(ourFont(18, display: true))
                    ForEach(Array(prompts.enumerated()), id: \.offset) { _, prompt in
                        VStack(alignment: .leading, spacing: 6) { Text(prompt.str("question")).font(ourFont(15)).fontWeight(.semibold); Text(prompt.str("answer")).font(ourFont(14)).foregroundStyle(OWVisual.inkMuted) }.frame(maxWidth: .infinity, alignment: .leading).padding(14).background(OWVisual.raised).clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                }
            } else if owner {
                VStack(alignment: .leading, spacing: 12) {
                    Text(s.t("旅行问答", "Travel prompts")).font(ourFont(18, display: true))
                    Button { s.editProfileCard("prompts") } label: { Text(s.t("回答一两个小问题，让旅行者更了解你。", "Answer a prompt or two so travellers get to know you.")).font(ourFont(14)).foregroundStyle(OWVisual.inkFaint).frame(maxWidth: .infinity, alignment: .leading).padding(14).background(OWVisual.raised).clipShape(RoundedRectangle(cornerRadius: 16)) }.buttonStyle(.plain)
                }
            }
        }
    }
    private func interestSection(_ user: JSON, owner: Bool) -> some View {
        let tags = user.strings("tags")
        return Group { if owner || !tags.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text(s.t("兴趣", "Interests")).font(ourFont(18, display: true))
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(Array(tags.enumerated()), id: \.offset) { _, tag in Text(tag).font(ourFont(14)).fontWeight(.medium).frame(maxWidth: .infinity, minHeight: 56).background(OWVisual.raised).clipShape(RoundedRectangle(cornerRadius: 16)) }
                    if owner { Button { s.route = "settings" } label: { HStack(spacing: 6) { Image(systemName: "plus").font(.system(size: 14, weight: .semibold)); Text(s.t("添加", "Add")).font(ourFont(14)) }.foregroundStyle(OWVisual.accent).frame(maxWidth: .infinity, minHeight: 56).overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(OWVisual.accent, style: StrokeStyle(lineWidth: 1, dash: [6, 5]))) }.buttonStyle(.plain).accessibilityLabel(s.t("添加兴趣", "Add interest")) }
                }
            }
        } }
    }
    private func ownerTools() -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 128), alignment: .leading)], alignment: .leading, spacing: 8) {
            ownerTool(s.t("编辑个人资料", "Edit personal details"), system: "pencil") { s.route = "settings" }
            ownerTool(s.t("设置", "Settings"), system: "gearshape") { s.route = "settings" }
            ownerTool(s.t("发布服务", "Publish service"), system: "square.and.arrow.up") { s.route = "packages" }
            ownerTool(s.t("资料认证", "Verification"), system: "checkmark.seal") { s.route = "verification" }
        }
    }
    private func ownerTool(_ title: String, system: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Label(title, systemImage: system).font(ourFont(12)).foregroundStyle(OWVisual.inkMuted).frame(maxWidth: .infinity).padding(.horizontal, 10).padding(.vertical, 8).background(OWVisual.surface, in: Capsule()) }.buttonStyle(.plain)
    }
}

func travelMessageSummary(_ value: String, _ locale: String) -> String {
    var text = value
    for (kind, zh, en) in [("image", "图片", "Photo"), ("contact", "联系方式", "Contact"), ("place", "地点", "Place"), ("package", "服务", "Experience"), ("trip", "行程", "Trip")] { if text.hasPrefix("[\(kind)]") { text = (locale == "zh" ? zh : en) + (kind == "image" ? "" : " · " + String(text.dropFirst(kind.count + 2)).trimmingCharacters(in: .whitespaces)); break } }
    return text
}

@MainActor struct TravelConversationsView: View {
    @EnvironmentObject var s: WorldStore
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(s.t("对话", "Conversations")).font(ourFont(26)).fontWeight(.semibold).padding(20)
            if !s.online { Text(s.t("正在重连，消息会自动同步", "Reconnecting. Messages will sync.")).font(ourFont(14)).foregroundStyle(OWVisual.inkMuted).padding(.horizontal, 20) }
            ScrollView { LazyVStack(spacing: 0) {
                if s.conversations.isEmpty { VStack(alignment: .leading, spacing: 16) { Text(s.t("从一座城市，认识一个人", "Meet someone through a city")).font(ourFont(22)); Text(s.t("在地球上选一座城市，右滑的人会留在这里。", "Choose a city on the globe. People you connect with will appear here.")).foregroundStyle(OWVisual.inkMuted); Action(s.t("探索地球", "Explore the globe")) { s.tab = 0; s.route = "" } }.padding(24) }
                ForEach(s.conversations.sorted { $0.str("updatedAt") > $1.str("updatedAt") }, id: \.travelID) { c in Button { s.openConversation(c) } label: {
                    HStack(spacing: 14) { Photo(url: c.obj("peer").str("avatar"), height: 54).frame(width: 54).clipShape(Circle()); VStack(alignment: .leading, spacing: 6) { Text(c.obj("peer").str("name")).font(ourFont(16)).fontWeight(c.int("unread") > 0 ? .semibold : .medium); Text(travelMessageSummary(c.str("lastMessage", s.t("说一句你好", "Say hello")), s.locale)).font(ourFont(14)).foregroundStyle(OWVisual.inkMuted).lineLimit(1) }.frame(maxWidth: .infinity, alignment: .leading); VStack(alignment: .trailing, spacing: 8) { Text(travelTime(c.str("updatedAt"))).font(ourFont(12)).foregroundStyle(OWVisual.inkMuted); if c.int("unread") > 0 { Text("\(c.int("unread"))").font(ourFont(12)).foregroundStyle(OWVisual.accentInk).padding(6).background(coral, in: Circle()) } } }.padding(.horizontal, 20).padding(.vertical, 14).contentShape(Rectangle())
                }.buttonStyle(.plain) }
            } }
        }.starlight().foregroundStyle(ink)
    }
}

extension Dictionary where Key == String, Value == Any { var travelID: String { str("id") } }
func travelTime(_ value: String) -> String { guard let date = parseISODate(value) else { return "" }; let f = DateFormatter(); f.dateFormat = "HH:mm"; return f.string(from: date) }

@MainActor struct TravelChatView: View {
    @EnvironmentObject var s: WorldStore
    @State private var text = ""
    @State private var panel = ""
    @State private var photo: PhotosPickerItem?
    @State private var contactLabel = "WhatsApp"
    @State private var contactValue = ""
    @State private var tripTitle = ""
    @State private var tripEnd = Date().addingTimeInterval(86400)
    @State private var packages: [JSON] = []
    @State private var panelError = ""
    @State private var nearBottom = true
    var body: some View {
        let peer = s.conversation?.obj("peer") ?? [:]
        let city = s.places.first { $0.str("id") == s.conversation?.str("cityId") }
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button { s.route = "" } label: { Image(systemName: "arrow.left").frame(width: 48, height: 48) }.accessibilityLabel(s.t("返回", "Back"))
                Button { s.openProfile(peer.str("id")) } label: { HStack(spacing: 10) { Photo(url: peer.str("avatar"), height: 40).frame(width: 40).clipShape(Circle()); VStack(alignment: .leading, spacing: 3) { Text(peer.str("name")).font(ourFont(16)).fontWeight(.semibold).lineLimit(1); if let city { Text(s.t("在\(city.localized("name", s.locale))认识", "Connected in \(city.localized("name", s.locale))")).font(ourFont(12)).foregroundStyle(OWVisual.inkMuted) } } }.frame(maxWidth: .infinity, alignment: .leading) }.buttonStyle(.plain)
                Menu { Button(s.t("查看主页", "View profile")) { s.openProfile(peer.str("id")) }; Button(s.t("举报用户", "Report person")) { s.report("user", id: peer.str("id")) }; Button(s.t("拉黑用户", "Block person"), role: .destructive) { panel = "block" } } label: { Image(systemName: "ellipsis").frame(width: 48, height: 48) }.accessibilityLabel(s.t("更多", "More"))
            }.padding(.horizontal, 8).frame(minHeight: 64)
            ScrollViewReader { proxy in
                ScrollView { LazyVStack(alignment: .leading, spacing: 8) {
                    if s.hasOlderMessages { Button(s.t("更早的消息", "Earlier messages"), action: s.history).disabled(s.historyLoading).frame(minHeight: 48) }
                    if s.messagesLoading && s.threadMessages.isEmpty { EarthLoading() }
                    if !s.messagesLoading && s.threadMessages.isEmpty { introduction(peer) }
                    ForEach(s.threadMessages, id: \.travelID) { message in bubble(message).id(message.str("id")) }
                    Color.clear.frame(height: 1).id("bottom").onAppear { nearBottom = true }.onDisappear { nearBottom = false }
                }.padding(16) }.scrollDismissesKeyboard(.interactively)
                .onChange(of: s.threadMessages.last?.str("id") ?? "") { _ in if nearBottom || s.threadMessages.last?.str("senderId") == s.user?.str("id") { withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("bottom", anchor: .bottom) } } }
                .overlay(alignment: .bottom) { if !nearBottom && !s.threadMessages.isEmpty { Button(s.t("最新消息", "Latest messages")) { withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }.padding(12).background(ink).foregroundStyle(OWVisual.bg).clipShape(Capsule()) } }
            }
            if !s.messageError.isEmpty { Button(s.t("消息载入失败，点击重试", "Couldn't load messages. Tap to retry.")) { Task { try? await s.loadMessages(); s.messageError = "" } }.font(ourFont(14)) }
            HStack(alignment: .bottom, spacing: 6) {
                Button { panel = "attachments" } label: { Image(systemName: "plus").font(.system(size: 24)).frame(width: 48, height: 48) }.accessibilityLabel(s.t("添加附件", "Add attachment"))
                TextField(s.t("写一条消息…", "Write a message…"), text: $text, axis: .vertical).lineLimit(1...4).foregroundStyle(OWVisual.ink).padding(.horizontal, 16).padding(.vertical, 13).background(OWVisual.surface).clipShape(RoundedRectangle(cornerRadius: 24)).overlay(RoundedRectangle(cornerRadius: 24).stroke(OWVisual.line, lineWidth: 1))
                Button { let body = text.trimmingCharacters(in: .whitespacesAndNewlines); if !body.isEmpty { s.send(body); text = "" } } label: { Image(systemName: "paperplane.fill").frame(width: 48, height: 48).background(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? OWVisual.raised : coral, in: Circle()).foregroundStyle(text.isEmpty ? OWVisual.inkMuted : OWVisual.accentInk) }.disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityLabel(s.t("发送", "Send"))
            }.padding(.horizontal, 8).padding(.vertical, 10)
        }.starlight().foregroundStyle(ink)
        .sheet(isPresented: Binding(get: { !panel.isEmpty && panel != "block" }, set: { if !$0 { panel = "" } })) { attachmentPanel.preferredColorScheme(.dark).presentationDetents([.medium, .large]) }
        .confirmationDialog(s.t("拉黑此用户？", "Block this person?"), isPresented: Binding(get: { panel == "block" }, set: { if !$0 { panel = "" } }), titleVisibility: .visible) { Button(s.t("拉黑", "Block"), role: .destructive) { s.block(peer.str("id")); panel = "" } }
        .onChange(of: photo) { value in guard let value else { return }; panel = ""; s.run { if let raw = try await value.loadTransferable(type: Data.self), let image = UIImage(data: raw), let data = image.jpegData(compressionQuality: 0.85) { let file = try await s.api.upload(data, name: "photo.jpg", mime: "image/jpeg", purpose: "chat"); s.send(file.str("url"), type: "image", data: ["fileId": file.str("id"), "url": file.str("url")]) } } }
    }
    private func introduction(_ peer: JSON) -> some View {
        VStack(spacing: 16) { Photo(url: peer.str("avatar"), height: 80).frame(width: 80).clipShape(Circle()); Text(s.t("和 \(peer.str("name")) 聊聊这座城市", "Discover the city with \(peer.str("name"))")).font(ourFont(22)).fontWeight(.semibold); Text(peer.str("bio")).font(ourFont(14)).foregroundStyle(OWVisual.inkMuted).lineLimit(3); ForEach([s.t("有什么值得散步的街区？", "Which neighbourhood is great for a walk?"), s.t("第一次来，你推荐从哪里开始？", "Where would you recommend starting on a first visit?")], id: \.self) { prompt in Button { text = prompt } label: { Text(prompt).font(ourFont(14)).foregroundStyle(OWVisual.bg).frame(maxWidth: .infinity, minHeight: 48, alignment: .leading).padding(.horizontal, 16).background(.white).clipShape(RoundedRectangle(cornerRadius: 16)) } } }.multilineTextAlignment(.center).padding(.vertical, 32).frame(maxWidth: .infinity)
    }
    private func bubble(_ message: JSON) -> some View {
        let mine = message.str("senderId") == s.user?.str("id")
        let color = mine ? OWVisual.accentInk : OWVisual.ink
        return HStack { if mine { Spacer(minLength: 40) }; VStack(alignment: .leading, spacing: 6) {
            switch message.str("type") {
            case "image": Photo(url: message.obj("data").str("url", message.str("body")), height: 220).frame(maxWidth: 240)
            case "contact": Text(message.obj("data").str("label", s.t("联系方式", "Contact"))).fontWeight(.semibold); Text(message.obj("data").str("value", message.str("body")))
            case "trip": Button { panel = "trips" } label: { Label(message.str("body"), systemImage: "calendar").foregroundStyle(color) }
            case "place", "package": Text(message.str("type") == "place" ? s.t("分享地点", "Shared place") : s.t("服务体验", "Experience")).font(ourFont(12)); Text(message.str("body"))
            default: Text(message.str("body")).textSelection(.enabled)
            }
            HStack(spacing: 6) { Text(travelTime(message.str("createdAt"))).font(ourFont(12)).opacity(0.8); if mine { if message.str("delivery") == "failed" { Button(s.t("重试", "Retry")) { s.retryMessage(message) }.font(ourFont(12)).foregroundStyle(color) } else if message.str("delivery") == "sending" { Text(s.t("发送中", "Sending")).font(ourFont(12)) } else { Image(systemName: message.int("sequence") <= s.peerReadSequence ? "checkmark.circle.fill" : "checkmark").font(.caption).accessibilityLabel(message.int("sequence") <= s.peerReadSequence ? s.t("已读", "Read") : s.t("已发送", "Sent")) } } }
        }.padding(12).foregroundStyle(color).background(mine ? ink : OWVisual.surface).clipShape(RoundedRectangle(cornerRadius: 20)).contextMenu { if message.str("delivery").isEmpty { Button(s.t("举报消息", "Report message")) { s.report("message", id: message.str("id")) } } }; if !mine { Spacer(minLength: 40) } }
    }
    private var attachmentPanel: some View {
        ScrollView { VStack(alignment: .leading, spacing: 16) {
            Text(s.t("分享旅途中的事", "Share something from your journey")).font(ourFont(22)).fontWeight(.semibold)
            switch panel {
            case "attachments": PhotosPicker(selection: $photo, matching: .images) { Label(s.t("图片", "Photo"), systemImage: "photo").frame(maxWidth: .infinity, minHeight: 48, alignment: .leading) }; ForEach([("contact", s.t("联系方式", "Contact details")), ("places", s.t("地点", "Place")), ("packages", s.t("我的服务", "My experiences")), ("trips", s.t("行程与评价", "Trips & reviews"))], id: \.0) { item in Button(item.1) { panel = item.0 }.frame(minHeight: 48) }
            case "contact": Input(label: s.t("类型", "Type"), value: $contactLabel); Input(label: s.t("账号或号码", "Handle or number"), value: $contactValue); Action(s.t("发送到当前对话", "Send to this chat"), disabled: contactValue.isEmpty) { s.send(contactValue, type: "contact", data: ["label": contactLabel, "value": contactValue]); contactValue = ""; panel = "" }
            case "places": ForEach(s.places.filter { $0.str("kind") != "country" }, id: \.travelID) { place in Button(place.localized("name", s.locale)) { s.send(place.localized("name", s.locale), type: "place", data: ["placeId": place.str("id")]); panel = "" }.frame(minHeight: 48) }
            case "packages": if !panelError.isEmpty { Text(panelError) }; if packages.isEmpty { Text(s.t("你还没有已发布的服务。", "You have no published experiences.")) }; ForEach(packages, id: \.travelID) { item in Button(item.str("title")) { s.send(item.str("title"), type: "package", data: ["packageId": item.str("id")]); panel = "" }.frame(minHeight: 48) }
            case "trips": ForEach(s.trips, id: \.travelID) { TripView(trip: $0) }; Input(label: s.t("行程名称", "Trip title"), value: $tripTitle); DatePicker(s.t("结束时间", "End time"), selection: $tripEnd); Action(s.t("发送行程邀请", "Send trip invitation"), disabled: tripTitle.isEmpty) { s.createTrip(tripTitle, end: ISO8601DateFormatter().string(from: tripEnd)); tripTitle = "" }
            default: EmptyView()
            }
        }.padding(20).frame(maxWidth: .infinity, alignment: .leading) }.starlight().foregroundStyle(ink).tint(ink).task(id: panel) { if panel == "packages" { do { packages = try await s.api.call("/packages?userId=\(s.user?.str("id") ?? "")").rows().filter { $0.str("status") == "published" } } catch { panelError = error.localizedDescription } } }
    }
}
