# Ourworld Android

Kotlin / Jetpack Compose 原生应用，主地球和底栏微缩地球使用 WebView，其他页面使用原生 Compose。会话使用 Android Keystore，缓存使用 Room。

## 环境

- JDK 17、Android SDK platform 35 / build-tools 35.0.0。
- Gradle 8.11.1 由已入库的 wrapper 固定；AGP、Kotlin 和应用依赖由 Gradle 配置管理。
- 仓库工具使用 uv，JavaScript 构建工具需要 Node.js 24+。

在仓库根目录准备依赖和共享资源：

```sh
uv sync --locked
uv run ourworld setup
uv run ourworld prepare
uv run --directory apps/android sh gradlew --no-daemon assembleDebug -PapiBase=http://10.0.2.2:8188/api/v1
```

Windows 使用 `uv run --directory apps/android .\gradlew.bat assembleDebug`。真机的 API 地址应改为电脑的局域网地址；Release 使用 HTTPS。

APK 输出：`app/build/outputs/apk/debug/app-debug.apk`。调试包应该使用当前源码重新构建，并在目标设备验证。

## 资源和签名

`app/src/main/assets/globe` 由 `uv run ourworld prepare` 生成。源地图纹理与脚本位于 `packages/globe`。字体和原始素材署名继续随应用打包。

debug 密钥位于 Gradle 用户目录的 `ourworld-debug.keystore`。既有 Docker 构建可复用 `ourworld-gradle-cache` 卷以保留签名。清理工具不删除密钥或该卷。

可选构建容器：`uv run docker build -f infra/docker/android.Dockerfile -t ourworld-android-builder:local .`。

## 验证

```sh
uv run --directory apps/android sh gradlew --no-daemon testDebugUnitTest
```

编译、JVM 测试、模拟器和真机分别验收。设备上应检查登录、地球选择、人物卡滑动、消息收发、照片与主页编辑、服务城市、审核上传及断网恢复。共享 WebGL 修复会随生成的地球资源进入原生应用。
