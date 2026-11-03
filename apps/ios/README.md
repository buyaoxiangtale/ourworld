# Ourworld iOS

The current design shares a deep-sea globe with offline country borders, generated `VisualTokens.swift`, Manrope/Noto typography, floating cards, velocity-aware swipes, full-screen profiles and light chat surfaces. Windows syntax validation is recorded in `artifacts/deep-sea/ios-syntax.json`; it is not an Xcode build or simulator result. See `docs/DEEP_SEA_UI.md` for the implementation and remaining Mac/device checks.

Native SwiftUI app targeting iOS 16+. Only the globe uses WKWebView. Authentication, random people, gestures, messaging, contact/trip cards, Profile renderer/editor, model jobs, services, verification and stories are native views. Keychain stores tokens and Core Data stores cached resources.

The night globe home has one native rounded search box and three navigation icons. Search calls `/places?q=` after a short typing pause or keyboard submission, with tappable results opening native place details. Country sheets include images, introductions and city entries; unknown countries have a preparation state. Guide and traveler examples are accessible from the unauthenticated Profile screen.

On a Mac with a compatible Xcode and XcodeGen:

```sh
xcodegen generate
xcodebuild -list -project Ourworld.xcodeproj
xcrun simctl list devices available
xcodebuild -project Ourworld.xcodeproj -scheme Ourworld -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_UDID' API_BASE_URL=http://192.168.1.10:8188/api/v1 CODE_SIGNING_ALLOWED=NO build
```

The minimum deployment version is independent of installed simulator runtimes. Choose an actually available simulator UDID. For an iPhone installation set your Apple signing team. For Release supply an HTTPS `API_BASE_URL`. Only Info-Debug.plist permits local HTTP.

Root builds the shared globe and copies its standalone files to `Resources/globe/`. XcodeGen copies Resources as a folder. Native sends `window.OurworldGlobe.receive(envelope)`; globe sends `window.webkit.messageHandlers.globe.postMessage(envelope)`. All envelopes use bridgeVersion 1; the renderer receives no authentication tokens.

Replace the LAN address above with the Docker server address reachable from the Mac/iPhone. `127.0.0.1` only applies when the backend is on the Mac itself.

Required verification: actual Xcode build; simulator registration/globe/swipe/chat; paired cross-platform sync; Profile drag/drop, Agent preview/publish and conflict; service verification/upload; trip review rules; network reconnection. Windows file generation is not proof of iOS compilation. App Store publishing, payment processing and push credentials are outside this local build.

Secondary multiple-city selection supports `any`/`all`. Trip cards can revise end time, and acceptance sends `expectedEndAt` to reject stale confirmations. Profile offers local undo and a published-revision picker. Native photos support authenticated relative media URLs. Fonts are registered from bundled Resources/fonts using CoreText.

`syntax-validation.json` records syntax and plist parsing only. XcodeGen resource configuration follows its official ProjectSpec: Resources is a folder entry under target sources with `buildPhase: resources`.
