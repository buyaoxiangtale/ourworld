# Ourworld iOS

SwiftUI 应用，目标 iOS 16+；仅离线地球使用 WKWebView。Keychain 保存会话，Core Data 保存缓存。

## 构建

需要 macOS、兼容的 Xcode 和 XcodeGen，以及根目录说明中的 uv / Node.js 工具链。

在仓库根目录运行：

```sh
uv sync --locked
uv run ourworld setup
uv run ourworld prepare
uv run --directory apps/ios xcodegen generate
uv run --directory apps/ios xcodebuild -list -project Ourworld.xcodeproj
uv run xcrun simctl list devices available
```

选择实际存在的模拟器，然后构建：

```sh
uv run --directory apps/ios xcodebuild -project Ourworld.xcodeproj -scheme Ourworld -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_UDID' API_BASE_URL=http://127.0.0.1:8188/api/v1 CODE_SIGNING_ALLOWED=NO build
```

后端在另一台电脑时，将 API 地址改为其局域网地址。真机安装需要配置 Apple 签名团队；Release 使用 HTTPS。只有 Debug 的 plist 允许本地 HTTP。

## 共享资源

`Resources/globe` 由 `uv run ourworld prepare` 生成，源文件位于 `packages/globe`。XcodeGen 按 `project.yml` 的目录资源配置复制地球；字体和来源许可保留在资源目录中。

原生通过 bridge v1 调用共享地球，地图不接收 API 身份令牌。Swift 源码和共享设计令牌继续由各自构建检查。

## 验收范围

Linux 上的 TypeScript、资源和网页检查不代表完成 Xcode、模拟器或真机验收。原生验收应覆盖登录、地球、人物卡、聊天、照片和主页编辑、服务城市、发布与冲突重试。历史语法与设计记录见[归档](../../docs/archive/README.md)。
