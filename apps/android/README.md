# Ourworld Android

The current design uses a deep-sea globe with offline vector country borders, floating photographic cards, velocity-aware interruptible swipes, full-screen profiles and light chat surfaces. Generated `VisualTokens.kt` shares visual and gesture settings with web/iOS. Current packages are `releases/ourworld-deep-sea-phone-debug.apk` and `ourworld-deep-sea-emulator-debug.apk`; implementation, 19 JVM tests, signatures and outstanding device checks are documented in `docs/DEEP_SEA_UI.md` at the repository root.

Native Kotlin/Compose application. Only the packaged globe uses WebView; all cards, messaging, authentication, Profile editing, services, verification and stories are native.

The night home screen has a globe, one native rounded search box and three navigation icons. Search calls `/places?q=` after a short typing pause or keyboard submission; selecting a result focuses the globe and opens native place details. Country details include a picture, introduction and cities; unknown countries show an honest preparation state. The unauthenticated Profile screen offers guide and traveler demo profiles.

Requirements: JDK 17, Android SDK platform 35/build-tools 35.0.0. The checked-in Gradle wrapper pins Gradle 8.11.1. AGP 8.9.1 and Kotlin 2.1.20 are pinned in the project.

From this directory:

```powershell
.\gradlew.bat assembleDebug -PapiBase=http://192.168.1.10:8188/api/v1
```

Linux/Docker: `sh gradlew --no-daemon assembleDebug -PapiBase=http://192.168.1.10:8188/api/v1`.

APK: `app/build/outputs/apk/debug/app-debug.apk`. Default emulator API is `http://10.0.2.2:8188/api/v1`. A physical device must use the Docker host's LAN address. Release configuration rejects HTTP API addresses.

The debug signing key is kept in Gradle user home (`ourworld-debug.keystore`). This workspace's original Docker volume is `ourworld-gradle-cache`: mount it at `/root/.gradle` to retain the certificate. A fresh volume creates a different key. The current packages were verified against the original certificate. Release publishing requires your own signing configuration.

The root globe build must copy its standalone output into `app/src/main/assets/globe/`. Bridge is version 1: native sends `window.OurworldGlobe.receive(envelope)`; globe sends `window.AndroidGlobe.postMessage(JSON.stringify(envelope))`. Local resources load using WebViewAssetLoader. No API token is exposed to the renderer.

Tests to run on a device: registration and verification; globe selection; 25% person swipe and return; repeat connect; paired chat, offline retry and read sync; Profile ordering/theme/Agent preview/publish; document verification; service publish/archive; city stories and reports. Local sessions use Android Keystore; resource/message snapshots use Room. Payment is not implemented.

The people screen's secondary multiple-city chooser supports `any` and `all`, while the initial flow remains single-city random. Trip cards can revise end time using a native date/time picker; acceptance includes `expectedEndAt` and reloads cards on stale-date errors. Profile includes local undo and published revision selection.

Actual build/package/signature checks are recorded in `build-validation.log` and `apk-validation.json`. Android emulator and physical-device UI testing remain separate from compilation.

The wrapper JAR was downloaded from the Gradle v8.11.1 official GitHub source. SHA256: `2db75c40782f5e8ba1fc278a5574bab070adccb2d21ca5a6e5ed840888448046`.
