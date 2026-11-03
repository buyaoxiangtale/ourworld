# OURWORLD · 我的世界

以地球发现城市，在城市中随机认识当地人。Android 与 iOS 为原生界面，另提供 Docker 手机网页体验端和管理后台。

首页为深色地图地球（无云层、无昼夜分界），保留简洁搜索框和三个导航图标。点击国家查看介绍与实景照片，再进入城市；未登录时可从 Profile 查看带 AI 演示标识的当地人与游客示例主页。地球影像随资源本地打包，设置中提供来源说明。

当前改版采用墨黑深海地球、离线矢量国界、地图前景的大幅人物卡及距离 / 速度共同判定的滑动；主页和聊天使用浅色内容面。三端代码、最新 Android 安装包、截图、测试与设备验收边界见 [深海改版记录](docs/DEEP_SEA_UI.md)。历史视觉与摄影说明保留在 `docs/MATURE_VISUAL.md`。

## 本地启动

需要 Node.js 24 与 Docker Desktop（Linux containers）。

```powershell
node scripts/start.mjs
```

- 手机网页：[http://localhost:8188](http://localhost:8188)
- 管理后台：[http://localhost:8188/admin](http://localhost:8188/admin)
- 本地邮件收件箱：[http://localhost:8025](http://localhost:8025)
- 健康检查：[http://localhost:8188/api/v1/health](http://localhost:8188/api/v1/health)

启动脚本保留已有 `.env`，分别构建前后端，再启动两个 API 实例及基础服务；首次运行需要下载镜像。开发源码检查另需 `npm ci`。

开发种子账号：`traveler@ourworld.test`、`local@ourworld.test`、`admin@ourworld.test`。本地示例密码 `Ourworld2026!`，以 `.env` 的 `DEMO_PASSWORD` 为准。此配置用于本地开发，未配置公开部署。

手机访问时将 `.env` 的 `PUBLIC_BASE_URL` 改为电脑的局域网地址，例如 `http://192.168.1.20:8188`，并在原生调试构建中配置相同 API 地址。数据库、Redis、文件存储和邮件端口只绑定本机；Redis 使用 56379，网页使用 8188，避免影响已有服务。

## 开发、资源及测试

```powershell
npm run build
npm run typecheck
npm test
node --env-file=.env tests/integration.mjs
```

本地直接运行 API/worker 前先启动基础服务：

```powershell
docker compose up -d postgres redis storage mailpit
node --env-file=.env apps/api/dist/migrate.js
node --env-file=.env apps/api/dist/seed.js
node --env-file=.env apps/api/dist/main.js
```

另开终端运行 `node --env-file=.env apps/api/dist/worker.js`。前端开发运行 `npm run dev:web`。`npm run build` 会构建并复制共用地球资源到网页、Android 和 iOS。

## 真实主页排版 Agent

默认已按用户选择配置 DeepSeek Flash：`LLM_BASE_URL=https://api.deepseek.com`、`LLM_MODEL=deepseek-flash`。在 `.env` 填入 `LLM_API_KEY` 后启用真实调用，无需将密钥发到聊天。接口采用 Chat Completions 兼容协议，DeepSeek 使用 `LLM_OUTPUT_MODE=json`。其他支持结构化输出的模型可设置 `LLM_OUTPUT_MODE=json_schema`。更新配置后重建/重启 API 和 worker。

```powershell
docker compose up -d --scale api=2 --force-recreate api worker gateway
```

Agent 只生成布局候选；用户预览、应用到草稿、发布后，公开主页才更新。没有配置模型时会明确提示，不以固定模板冒充模型生成。证件、登录信息和私聊不发送给排版模型。

## 原生工程

- Android：`apps/android`。构建 JDK/SDK 容器：`docker build -f infra/Dockerfile.android -t ourworld-android-builder:local .`。具体构建与安装见该目录说明。
- iOS：`apps/ios`，在 Mac 上用 XcodeGen 生成工程并用 Xcode 构建。工程准备不等于完成模拟器、真机或签名验收。

## 并发验收

```powershell
$env:AUTH_LOGIN_LIMIT='2000'
docker compose up -d --scale api=2 --force-recreate api worker gateway
docker compose --profile loadtest run --rm --no-deps loadtest
Remove-Item Env:AUTH_LOGIN_LIMIT
docker compose up -d --scale api=2 --force-recreate api worker gateway
```

并发脚本会登录 500 个专用种子账号，故仅在测试期间提高登录限流，结束后恢复。基线为 500 个认证 WebSocket 与 100 HTTP 请求/秒持续 15 分钟。原始结果保存在 `artifacts`。测试过程、实测结论和外部依赖见 `docs/VALIDATION.md`。

## 文档

- `docs/PRODUCT_REQUIREMENTS.md`：功能和交互基线。
- `docs/API_CONTRACT.md`：共享 API 与桥接契约。
- `docs/SYSTEM_DESIGN.md`：架构、权限、一致性、扩展及恢复。
- `docs/VALIDATION.md`：实际验证记录。
- `docs/PROFILE_AGENT.md`：排版 Agent 的实际接入状态、密钥配置及使用方式。
- `docs/TASTE_DESIGN_REVIEW.md`：用户级 taste-skill 安装与本轮设计评审。
- `docs/EARTH_ASSETS.md`：NASA/GEBCO 影像来源、年代、处理及署名。

首版允许自由交换联系方式及线下交易；不包含支付、钱包、订单或资金赔付。未来交易仅保留接口边界。
