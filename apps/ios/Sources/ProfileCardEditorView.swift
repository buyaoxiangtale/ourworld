import SwiftUI
import PhotosUI
import UIKit

@MainActor struct ProfileCardEditorView: View {
    @EnvironmentObject var s: WorldStore
    let section: String
    @State private var photos: [String] = []
    @State private var prompts: [JSON] = []
    @State private var photo: PhotosPickerItem?
    @State private var loaded = false
    private var valid: Bool { section == "gallery" || prompts.allSatisfy { !$0.str("question").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.str("question").count <= 120 && !$0.str("answer").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.str("answer").count <= 500 } }
    var body: some View {
        Page(section == "gallery" ? s.t("我的照片", "My photos") : s.t("我的旅行问答", "My travel prompts")) {
            if section == "gallery" {
                ForEach(Array(photos.enumerated()), id: \.offset) { i, url in
                    Photo(url: url, height: 180)
                    HStack {
                        Button { photos.swapAt(i, i-1) } label: { Image(systemName: "arrow.up") }.disabled(i == 0 || s.busy).accessibilityLabel(s.t("前移照片", "Move photo earlier"))
                        Button { photos.swapAt(i, i+1) } label: { Image(systemName: "arrow.down") }.disabled(i == photos.count-1 || s.busy).accessibilityLabel(s.t("后移照片", "Move photo later"))
                        Spacer()
                        Button { photos.remove(at: i) } label: { Image(systemName: "trash") }.disabled(s.busy).accessibilityLabel(s.t("删除照片", "Remove photo"))
                    }.frame(minHeight: 44)
                }
                PhotosPicker(selection: $photo, matching: .images) { Label(s.t("添加照片", "Add photos"), systemImage: "photo.badge.plus").frame(minHeight: 44) }.disabled(s.busy)
            } else {
                ForEach(prompts.indices, id: \.self) { i in
                    VStack(alignment: .leading, spacing: 12) {
                        Input(label: s.t("问题", "Question"), value: Binding(get: { prompts.indices.contains(i) ? prompts[i].str("question") : "" }, set: { if prompts.indices.contains(i) { prompts[i]["question"] = $0 } }))
                        Input(label: s.t("我的回答", "My answer"), value: Binding(get: { prompts.indices.contains(i) ? prompts[i].str("answer") : "" }, set: { if prompts.indices.contains(i) { prompts[i]["answer"] = $0 } }))
                        Button(s.t("删除问答", "Remove prompt")) { prompts.remove(at: i) }.disabled(s.busy)
                    }.padding(16).background(OWVisual.surface).clipShape(RoundedRectangle(cornerRadius: 16))
                }
                Button { prompts.append(["question": "", "answer": ""]) } label: { Label(s.t("添加旅行问答", "Add travel prompt"), systemImage: "plus").frame(minHeight: 44) }.disabled(prompts.count >= 5 || s.busy)
            }
            Action(s.t("保存并更新主页", "Save and update profile"), disabled: !loaded || !valid || s.busy) { save() }
        }.onAppear {
            guard !loaded else { return }
            let blocks = s.layout.rows("blocks").filter { $0.str("type") == section }
            photos = blocks.flatMap { $0.strings("refs") }.reduce(into: []) { result, url in if !result.contains(url) { result.append(url) } }
            prompts = blocks.flatMap { $0.rows("prompts") }
            if prompts.isEmpty { prompts = [["question": "", "answer": ""]] }
            loaded = true
        }.onChange(of: photo) { value in
            guard let value else { return }
            s.run {
                guard let raw = try await value.loadTransferable(type: Data.self), let image = UIImage(data: raw), let data = image.jpegData(compressionQuality: 0.85) else { throw APIError(message: s.t("无法读取照片", "Could not read photo")) }
                let file = try await s.api.upload(data, name: "profile.jpg", mime: "image/jpeg", purpose: "public")
                photos.append(file.str("url")); photo = nil
            }
        }
    }
    private func save() {
        s.run {
            let original = s.layout.rows("blocks")
            let at = original.firstIndex { $0.str("type") == section }
            var blocks = original.filter { $0.str("type") != section }
            if section == "gallery" ? !photos.isEmpty : !prompts.isEmpty {
                var block = original.first { $0.str("type") == section } ?? ["id": UUID().uuidString, "type": section, "span": 2, "size": "compact"]
                if section == "gallery" { block["refs"] = photos } else { block["prompts"] = prompts.map { ["question": $0.str("question").trimmingCharacters(in: .whitespacesAndNewlines), "answer": $0.str("answer").trimmingCharacters(in: .whitespacesAndNewlines)] } }
                blocks.insert(block, at: min(at ?? blocks.count, blocks.count))
            }
            if blocks.isEmpty { blocks = [["id": UUID().uuidString, "type": "intro", "span": 2, "size": "compact"]] }
            s.layout["blocks"] = blocks
            try await s.saveDraft()
            _ = try await s.api.call("/profile/publish", method: "POST", body: ["revision": s.draft.int("revision")])
            if let user = s.user { s.profile = try await s.api.call("/users/\(user.str("id"))") }
            s.route = ""; s.notice = s.t("主页已更新", "Profile updated")
        }
    }
}
