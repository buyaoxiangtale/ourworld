# 开发指南

## 工具链

仓库使用 uv 管理 Python 3.12、工具依赖和 `ourworld` 命令。`uv.lock`、`package-lock.json` 和 Gradle wrapper 都应保留；依赖更新应通过对应解析器生成锁文件。

```sh
uv sync --locked
uv run ourworld doctor
uv run ourworld setup
```

`setup` 执行 `npm ci` 并仅在 `.env` 不存在时复制模板、生成随机签名密钥。`.env` 不应提交到仓库。

## 完整容器环境

```sh
uv run ourworld start
uv run ourworld logs
uv run ourworld stop
```

`start` 分别构建 API、网页和自动部署镜像，然后启动两个 API 实例、worker、Nginx、PostgreSQL、Redis、SeaweedFS 和 Mailpit。`stop` 保留数据卷。

数据库端口为本机 5432；Redis 为本机 56379；S3 为本机 8333；Mailpit 为本机 8025。网页默认端口由 `WEB_PORT` 控制，默认 8188。完整配置见根目录 `compose.yaml` 与 `.env.example`。

## 本地进程开发

先启动基础服务，再执行迁移与种子初始化。以下命令在仓库根目录运行：

```sh
uv run docker compose up -d postgres redis storage mailpit
uv run --env-file .env npm run migrate -w @ourworld/api
uv run --env-file .env npm run seed -w @ourworld/api
uv run --env-file .env ourworld dev api
```

另开终端运行 worker 与网页：

```sh
uv run --env-file .env ourworld dev worker
uv run ourworld dev web
```

API 默认 3000，Vite 默认 5173，Vite 默认将 `/api` 和 `/media` 转发到 `http://127.0.0.1:8188`。直接连接本地 API 进程时，用 `API_PROXY_TARGET=http://127.0.0.1:3000` 启动 Vite。只有容器入口 Nginx 会提供完整的同源部署和生产构建。

## 共享资源

```sh
uv run ourworld prepare
uv run ourworld build
```

资源准备依次生成视觉令牌和 OpenAPI，构建共享契约与地球，再复制离线地球到三个客户端。交互小球的材质从 `packages/globe/src/planet-icons.ts` 维护。造型变化时，先按 [地球包说明](../packages/globe/README.md) 更新四套旋转图集和 Web 首帧，再准备共享资源。正常构建使用已入库的原始素材。

素材更新是显式操作：

```sh
uv run ourworld media photos
uv run ourworld media fonts
uv run ourworld media portraits --manifest /path/to/source-records.json
```

照片来源和许可随素材保存。人像处理需要明确提供源记录，不依赖某个旧测试目录。

## 本地前端预览

```sh
uv run ourworld watch
```

Vite 在 5173 热更新，共享 Web 入口 8188 从 Docker 发布卷提供网页。

## 前后端发布

在运行 Ourworld Compose 项目的主机上，从仓库根目录执行：

```sh
./scripts/deploy/backend.sh yubs
```

省略分支名时使用当前检出分支。脚本从该分支同一个 Git 提交构建两个镜像，停止旧的前端监听容器，再执行数据库迁移。两个 API 实例与 worker 使用新版镜像、且经网关验证 API 就绪后，脚本才原子切换前端目录。迁移失败时，原版本继续服务。API 就绪或前端切换失败时，脚本保留原前端并尝试恢复旧后端，已经完成的数据库迁移会保留。此入口适用于已有数据库和网关的共享环境，首次初始化使用上面的完整容器流程。

## 部署后验证与清理

- 发布后检查 `/api/v1/ready`，并确认 `/frontend-version.json` 的 `revision` 与 API 和 worker 镜像的 Git 提交一致。部署地点搜索变更后，可用 `/api/v1/places?q=lon&limit=1` 检查伦敦优先排序。
- 容器、镜像和数据卷需在同一部署主机和 Compose 项目下清点。清理旧镜像时，按镜像 ID 核对运行中及已停止的容器引用，并保留需要用于回滚的版本。不要通过全局 prune 清理同机项目。
- 当前 PostgreSQL 服务使用 `postgres-data` 卷，文件存储和 Redis 也各有持久卷。只有确认用途、消费者和备份的旧库或旧卷才适合删除。停服务命令保留这些卷。仓库的 `apps/api/migrations/` 是新库初始化和旧库升级所需的迁移链。
