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

API 默认 3000，Vite 默认 5173，Vite 将 `/api` 转发至本机 3000。只有容器入口 Nginx 会提供完整的同源部署和生产构建。

## 共享资源

```sh
uv run ourworld prepare
uv run ourworld build
```

资源准备依次生成视觉令牌和 OpenAPI，构建共享契约与地球，再复制离线地球到三个客户端。正常构建使用已入库的原始素材，不额外下载图片或字体。

素材更新是显式操作：

```sh
uv run ourworld media photos
uv run ourworld media fonts
uv run ourworld media portraits --manifest /path/to/source-records.json
```

照片来源和许可随素材保存。人像处理需要明确提供源记录，不依赖某个旧测试目录。

## 前端发布

自动部署的输入和产物边界由 `scripts/dev/frontend-watch.mjs` 定义。源代码在只读挂载中，依赖与构建位于独立工作目录，发布资源位于 Docker 卷。

```sh
uv run ourworld watch
uv run docker compose exec frontend-watch cat /srv/frontend/watch-status.json
```

调整 Dockerfile、入口路径或依赖安装逻辑后，重新运行 `watch` 更新监听容器。普通网页源代码修改由常驻监听器处理。
