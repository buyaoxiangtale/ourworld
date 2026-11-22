import SwiftUI
import PhotosUI
import UIKit

@MainActor struct TravelOwnerProfileView: View {
    @EnvironmentObject var s: WorldStore
    private let columns = [GridItem(.flexible()), GridItem(.flexible())]
    var body: some View {
        let user = s.profile.obj("user")
        let photos = profilePhotoURLs(s.profile)
        let prompts = profilePromptEntries(s.profile)
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                HStack(spacing: 16) {
                    Button { s.openProfile(user.str("id")) } label: { Photo(url: user.str("avatar"), height: 88, cornerRadius: 14).frame(width: 70).rotationEffect(.degrees(-5)) }.buttonStyle(.plain).accessibilityLabel(s.t("预览我的主页", "Preview my profile"))
                    VStack(alignment: .leading, spacing: 4) {
                        Text(s.t("我的主页", "My profile")).font(ourFont(11)).foregroundStyle(OWVisual.inkMuted)
                        HStack(spacing: 7) { Text(user.str("name")).font(ourFont(28)).fontWeight(.semibold); if user.flag("verified") { Image(systemName: "checkmark.seal").foregroundStyle(OWVisual.accent).accessibilityLabel(s.t("邮箱已验证", "Email verified")) } }
                        Button { s.openProfile(user.str("id")) } label: { HStack(spacing: 6) { Text(s.t("预览", "Preview")); Image(systemName: "chevron.right").font(.system(size: 12)) }.font(ourFont(14)).foregroundStyle(OWVisual.inkMuted).frame(minHeight: 44) }.buttonStyle(.plain)
                    }
                }.padding(.top, 38)
                if user.str("accountType") == "agency" { Label(user.str("providerStatus") == "approved" ? s.t("认证旅行社", "Certified agency") : s.t("旅行社认证待完善", "Agency certification incomplete"), systemImage: "trophy").font(ourFont(12)).foregroundStyle(OWVisual.focus) }
                if !user.has("priceRange") || photos.count < 3 || prompts.count < 2 || user.str("bio").isEmpty {
                    Button { s.route = "settings" } label: { HStack(spacing: 8) { Image(systemName: "exclamationmark.circle.fill").foregroundStyle(OWVisual.nope); Text(s.t("请将您的个人资料填写完整", "Complete your personal profile")).font(ourFont(14)).fontWeight(.medium); Spacer(minLength: 0); Image(systemName: "chevron.right").font(.system(size: 12)) }.padding(.horizontal, 14).padding(.vertical, 12).background(OWVisual.surface, in: Capsule()) }.buttonStyle(.plain)
                }
                infoChips(user)
                Button { s.route = "settings" } label: { Label(profileEducationText(user, s.locale).isEmpty ? s.t("学校与学历 +", "School & education +") : profileEducationText(user, s.locale), systemImage: "graduationcap").font(ourFont(12)).padding(.horizontal, 12).padding(.vertical, 10).background(OWVisual.raised, in: Capsule()) }.buttonStyle(.plain)
                VStack(alignment: .leading, spacing: 12) {
                    sectionTitle(s.t("我的照片", "My photos"), hint: photos.count < 3 ? s.t("再添加 \(3 - photos.count) 张照片", "Add \(3 - photos.count) more photos") : "")
                    VStack(spacing: 0) {
                        HStack(spacing: 1) { ForEach(0..<6, id: \.self) { i in
                            Button { s.editProfileCard("gallery") } label: {
                                ZStack {
                                    if i < photos.count { Photo(url: photos[i], height: 84, cornerRadius: 0) } else { OWVisual.raised.overlay { Image(systemName: "plus").font(.system(size: 20)) } }
                                    if i == 5 && photos.count > 6 { Text("+\(photos.count - 6)").font(ourFont(16)).fontWeight(.semibold).padding(4).background(OWVisual.space.opacity(0.75)) }
                                }.frame(maxWidth: .infinity).frame(height: 84).clipped()
                            }.buttonStyle(.plain).accessibilityLabel(s.t("编辑照片 \(i+1)", "Edit photo \(i+1)"))
                        } }.clipShape(RoundedRectangle(cornerRadius: 19))
                        HStack(spacing: 12) { Text(s.t("用照片分享街头、旅途与日常。", "Share your journeys and everyday life.")).font(ourFont(12)).foregroundStyle(OWVisual.inkMuted); Spacer(minLength: 0); Button { s.editProfileCard("gallery") } label: { Text(s.t("编辑", "Edit")).font(ourFont(14)).fontWeight(.semibold).padding(.horizontal, 22).frame(minHeight: 44).background(OWVisual.space, in: Capsule()) }.buttonStyle(.plain) }.padding(.horizontal, 8).padding(.top, 12).padding(.bottom, 5)
                    }.padding(8).background(OWVisual.surface).clipShape(RoundedRectangle(cornerRadius: 26))
                }
                VStack(alignment: .leading, spacing: 14) {
                    sectionTitle(s.t("我的“关于我”", "My prompts"), hint: prompts.count < 2 ? s.t("再添加 \(2 - prompts.count) 条旅行问答", "Add \(2 - prompts.count) more travel prompts") : "")
                    LazyVGrid(columns: columns, spacing: 16) {
                        OwnerProfileCard(title: s.t("关于我", "About me"), copy: user.str("bio").isEmpty ? s.t("写一点关于你的故事", "Share a little of your story") : user.str("bio"), symbol: "quote.opening", filled: !user.str("bio").isEmpty) { s.route = "settings" }
                        ForEach(Array(prompts.enumerated()), id: \.offset) { _, prompt in OwnerProfileCard(title: prompt.str("question"), copy: prompt.str("answer"), symbol: "quote.opening", filled: true) { s.editProfileCard("prompts") } }
                        ForEach(0..<max(0, 2 - prompts.count), id: \.self) { _ in OwnerProfileCard(title: s.t("回答提示", "Answer a prompt"), copy: s.t("写一点关于你的故事", "Share a little of your story"), symbol: "quote.opening") { s.editProfileCard("prompts") } }
                    }
                }
                VStack(alignment: .leading, spacing: 14) {
                    sectionTitle(s.t("我的兴趣", "My interests"), hint: "")
                    LazyVGrid(columns: columns, spacing: 16) {
                        ForEach(Array(user.strings("tags").enumerated()), id: \.offset) { i, tag in OwnerProfileCard(title: tag, copy: s.t("我的兴趣", "Something I love"), symbol: ["safari", "camera", "cup.and.saucer", "music.note", "mountain.2", "heart"][i % 6]) { s.route = "settings" } }
                        OwnerProfileCard(title: s.t("当前爱好", "Current favourites"), copy: s.t("选择兴趣", "Add your interests"), symbol: "heart") { s.route = "settings" }
                    }
                }
                Button { s.route = "settings" } label: { HStack { Spacer(); Text(s.t("更多个人资料管理项", "More profile details")); Spacer(); Image(systemName: "chevron.right") }.font(ourFont(14)).padding(14).background(OWVisual.surface, in: Capsule()) }.buttonStyle(.plain)
                VStack(spacing: 8) {
                    managementLink(s.t("我的服务套餐", "My experiences"), symbol: "square.grid.2x2", route: "packages")
                    managementLink(s.t("身份与服务审核", "Identity & service review"), symbol: "checkmark.shield", route: "verification")
                }
            }.padding(.horizontal, 16).padding(.top, 20).padding(.bottom, 24)
        }.starlight().foregroundStyle(OWVisual.ink)
        .overlay(alignment: .topTrailing) { HStack(spacing: 8) { toolbarButton("pencil", label: s.t("编辑个人资料", "Edit personal details")) { s.route = "settings" }; toolbarButton("gearshape", label: s.t("设置", "Settings")) { s.route = "settings" } }.padding(.top, 12).padding(.trailing, 16) }
    }
    private func sectionTitle(_ title: String, hint: String) -> some View { VStack(alignment: .leading, spacing: 4) { Text(title).font(ourFont(20)).fontWeight(.semibold); if !hint.isEmpty { Text(hint).font(ourFont(13)).foregroundStyle(OWVisual.nope) } }.padding(.horizontal, 10) }
    private func toolbarButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View { Button(action: action) { Image(systemName: symbol).font(.system(size: 21)).frame(width: 44, height: 44).background(OWVisual.bg, in: Circle()).overlay(Circle().stroke(OWVisual.line)) }.buttonStyle(.plain).accessibilityLabel(label) }
    private func managementLink(_ title: String, symbol: String, route: String) -> some View { Button { s.route = route } label: { HStack { Label(title, systemImage: symbol); Spacer(); Image(systemName: "chevron.right") }.font(ourFont(14)).frame(minHeight: 48) }.buttonStyle(.plain) }
    private func infoChips(_ user: JSON) -> some View {
        let cities = s.profile.rows("places").filter { user.strings("cityIds").contains($0.str("id")) }.map { $0.localized("name", s.locale) }.joined(separator: " / ")
        let values = [cities.isEmpty ? s.t("服务城市 +", "Cities +") : cities, user.has("experienceYears") ? s.t("\(user.int("experienceYears")) 年", "\(user.int("experienceYears")) yrs") : s.t("从业年限 +", "Experience +"), user.strings("languages").isEmpty ? s.t("语言 +", "Languages +") : user.strings("languages").joined(separator: " / "), user.has("priceRange") ? travelPriceRange(user.obj("priceRange"), s.locale) : s.t("报价区间 +", "Rates +"), user.strings("tags").isEmpty ? s.t("专长 +", "Skills +") : user.strings("tags").prefix(3).joined(separator: " / ")]
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), alignment: .leading)], alignment: .leading, spacing: 8) { ForEach(Array(values.enumerated()), id: \.offset) { index, value in Button { s.route = index == 0 ? "profile-cities" : "settings" } label: { Text(value).font(ourFont(12)).foregroundStyle(OWVisual.inkMuted).lineLimit(2).padding(.horizontal, 12).frame(minHeight: 40).frame(maxWidth: .infinity).background(OWVisual.raised, in: Capsule()) }.buttonStyle(.plain) } }
    }
}

@MainActor private struct OwnerProfileCard: View {
    let title: String
    let copy: String
    let symbol: String
    var filled = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(alignment: filled ? .leading : .center, spacing: 10) {
                if !filled { Image(systemName: symbol).font(.system(size: 30)).foregroundStyle(OWVisual.inkFaint) }
                Text(title).font(ourFont(filled ? 12 : 17)).fontWeight(filled ? .regular : .semibold).foregroundStyle(filled ? OWVisual.inkMuted : OWVisual.ink)
                Text(copy).font(ourFont(filled ? 15 : 12)).foregroundStyle(filled ? OWVisual.ink : OWVisual.inkMuted)
            }.padding(.horizontal, 16).padding(.vertical, 30).frame(maxWidth: .infinity, minHeight: 192, alignment: filled ? .topLeading : .center).background(OWVisual.surface).clipShape(RoundedRectangle(cornerRadius: 26))
                .overlay(alignment: .topTrailing) { Image(systemName: "plus").font(.system(size: 21)).frame(width: 34, height: 34).background(OWVisual.space, in: Circle()).overlay(Circle().stroke(OWVisual.bg, lineWidth: 3)).offset(x: 2, y: -8) }
        }.buttonStyle(.plain)
    }
}
