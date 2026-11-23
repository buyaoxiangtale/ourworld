# Ourworld · 我的世界

通过地球发现城市，认识当地人，并分享照片、个人故事与旅行服务。

仓库包含 React 网页及管理后台、TypeScript API、Android Compose、iOS SwiftUI，以及三端共用的离线地球和数据契约。底栏提供地球、社区、聊天和我的四个入口，使用可自转的哑光陶瓷图标。

## 环境与依赖

- [uv](https://docs.astral.sh/uv/getting-started/installation/)：统一项目工具入口，管理 Python 版本、虚拟环境和工具依赖。
- Node.js 24+：运行 TypeScript 工具链；JavaScript 依赖由 npm workspaces 和 `package-lock.json` 锁定。
- Docker Engine / Docker Desktop 与 Compose v2：运行数据库、缓存、存储、邮件和应用服务。
- Python 3.12：由 uv 按 `.python-version` 自动准备。

uv 管理的是 Python 依赖。项目通过 `uv run ourworld …` 调用各语言的工具链；Android 依赖仍由 Gradle 管理，iOS 构建仍使用 Xcode。相关边界见 [uv 官方依赖说明](https://docs.astral.sh/uv/concepts/projects/dependencies/)。

```sh
uv sync --locked
uv run ourworld doctor
uv run ourworld start
```

`start` 初始化缺失的 `.env`、构建容器并启动服务，保留现有配置和持久化数据。首次启动需要下载镜像。

| 服务 | 地址 |
| --- | --- |
| 手机网页 | http://localhost:8188 |
| 管理后台 | http://localhost:8188/admin |
| 开发邮件收件箱 | http://localhost:8025 |
| 健康检查 | http://localhost:8188/api/v1/health |
| OpenAPI | http://localhost:8188/api/v1/openapi.json |

开发账号为 `traveler@ourworld.test`、`local@ourworld.test`、`admin@ourworld.test`；密码取自本地 `.env` 的 `DEMO_PASSWORD`。手机访问时，将 `PUBLIC_BASE_URL` 配置为电脑的局域网地址，并给原生应用设置相同的 API 地址。

## 目录

```text
apps/
  api/                  TypeScript API、worker、数据库迁移与种子素材
  web/src/
    features/profile/   个人主页、照片、故事、爱好与独立编辑页面
  android/              Kotlin / Compose 工程
  ios/                  SwiftUI / XcodeGen 工程
packages/
  contracts/            三端契约、设计令牌、字体来源
  globe/                离线地球源码、地图纹理与署名
scripts/
  dev/                  本地配置、容器启动、前端自动部署
  generate/             设计令牌、OpenAPI、地球资源生成
  assets/               显式更新照片、字体和人像的工具
  load/                 压测监控
tools/ourworld_tools/  uv 提供的 ourworld 命令
tests/
  unit/                 仓库、前端逻辑和构建工具检查
  tools/                Python 工具测试
  e2e/web/              浏览器回归
  integration/          真实 API、目录、恢复与自动部署验收
  load/                 k6 压测
infra/                  Nginx 与原生构建容器配置
docs/                   当前文档及历史归档
```

应用内部的 API 测试保留在 `apps/api/test`，便于随工作区独立运行。构建资源、截图和测试报告的存放规则见 [目录与产物约定](docs/architecture/repository.md)。

## 日常开发

```sh
# 安装锁定的 npm 依赖；已有 .env 会保留
uv run ourworld setup

# 网页开发；自动准备离线地球等静态资源
uv run ourworld dev web

# API 与队列 worker，分别在独立终端运行
uv run --env-file .env ourworld dev api
uv run --env-file .env ourworld dev worker
```

开发 API 前需启动 PostgreSQL、Redis、存储和邮件服务。具体步骤、端口及数据库迁移见 [开发指南](docs/development.md)。

Docker 网页由前端监听器构建和发布。保存前端、设计令牌或地球源码后会触发构建，失败时保留上一版。打开的页面会自动刷新，正在编辑的表单会延迟刷新。API 和 worker 更新走容器构建流程。

```sh
uv run ourworld watch  # 启动或更新监听服务
uv run ourworld logs   # 查看自动发布日志
```

## 构建与测试

```sh
uv run ourworld prepare                 # 只生成共享资源
uv run ourworld build                   # 构建 API、网页及三端地球资源
uv run ourworld check                   # 类型、单元测试及 Python 检查
uv run ourworld browsers                # 首次安装浏览器测试依赖
uv run ourworld test web profile-hobbies
uv run ourworld test web globe-recovery
uv run ourworld test integration api
```

浏览器默认访问 `http://127.0.0.1:8188`，可通过 `OURWORLD_WEB_URL` 更改。不同测试的依赖、数据影响和完整命令见 [测试指南](docs/testing/README.md)。测试环境运行的集成用例会创建测试数据。

Android 构建需要 JDK 17 和 Android SDK 35；iOS 构建需要 macOS、Xcode 和 XcodeGen。详见 [Android](apps/android/README.md) 与 [iOS](apps/ios/README.md)。

## 生成文件与清理

`packages/globe` 是地球资源的源码来源。构建会将生成结果复制到网页与原生资源目录，这些副本不纳入版本控制。OpenAPI 的审阅版本位于 `docs/api/openapi.json`，网页副本在构建时生成。设计令牌由 `packages/contracts/assets/visual.json` 生成，检查会验证三端一致性。

```sh
uv run ourworld clean --dry-run
uv run ourworld clean
```

清理范围为构建输出、生成副本和 Python 字节码缓存；数据库卷、`.env`、依赖目录、原始素材、报告和签名密钥会保留。清理后运行 `uv run ourworld build` 重新生成资源。Docker 应用镜像和数据库属于部署环境，由部署主机单独盘点，详见 [开发指南](docs/development.md)。

## 文档入口

- [文档索引](docs/README.md)
- [产品需求](docs/product/requirements.md)
- [系统架构](docs/architecture/overview.md)
- [API 契约](docs/api/contract.md)
- [地球影像与署名](docs/assets/earth.md)
- [历史设计与验收记录](docs/archive/README.md)

项目提供联系方式交换和线下服务沟通；当前未实现支付、钱包或资金托管。
