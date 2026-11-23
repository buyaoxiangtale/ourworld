# 测试指南

所有命令从仓库根目录运行，报告输出到忽略的 `artifacts/`。

## 默认检查

```sh
uv run ourworld setup
uv run ourworld check
```

检查包含四个 TypeScript 工作区的类型、API 单元与集成用例、视觉令牌、主页资源引用、前端发布工具，以及 Python 命令入口和清理边界。API 集成用例需要测试环境中的 PostgreSQL、Redis、文件存储和邮件服务。Python 格式和静态检查由锁定的 Ruff 执行。

## 浏览器回归

先启动网页，再安装 Chromium。默认目标为 `http://127.0.0.1:8188`，可用 `OURWORLD_WEB_URL` 覆盖。

```sh
uv run ourworld browsers
uv run ourworld test web auth-session
uv run ourworld test web profile-owner
uv run ourworld test web profile-items
uv run ourworld test web profile-hobbies
uv run ourworld test web profile-package-cities
uv run ourworld test web profile-sheet-position
uv run ourworld test web slide-exit
uv run ourworld test web globe
uv run ourworld test web globe-country-dialog
uv run ourworld test web country-cities
uv run ourworld test web globe-first-open
uv run ourworld test web globe-recovery
uv run ourworld test web globe-boundaries
```

`profile-*` 和 `slide-exit` 使用接口夹具；`globe-country-dialog` 使用两次触摸的桥接夹具，验证国家信息不会被后续兼容点击误关，并检查正常点击与键盘关闭。`country-cities` 验证国家弹窗到城市卡片的导航、触摸横滑、鼠标拖动、方向键切换、返回位置保留，以及空数据、单城市和失败重试。`globe-recovery` 使用真实 WebGL 与接口夹具，模拟上下文丢失、返回页面、静止画面缩放和恢复超时。`globe` 使用真实地点 API；`globe-boundaries` 使用本地网页构建预览和真实地点 API。`frontend-updates`、`globe-boundaries` 和 `all` 会先自动构建当前源码，保证清理过产物后仍可执行。`people-cards`、`experience-ui`、`swipe-physics`、`nav-layout`、`email-links`、`frontend-updates` 保留独立回归入口。

`uv run ourworld test web all` 顺序运行全部网页脚本，其中含真实服务脚本，应使用开发或测试环境。

`globe-first-open` 延迟地球和图集响应，检查底栏静态图、搜索、图集延后加载、超时后继续下载，以及手动重试。

## 集成与恢复

```sh
uv run ourworld test integration api
uv run ourworld test integration catalog
uv run ourworld test integration frontend-watch
uv run ourworld test integration recovery
```

API 验收会使用种子账户创建测试数据；恢复验收默认只生成计划，追加 `--execute` 后才实际中断并恢复本地服务；监听器验收会短暂写入专用探针和错误源码，验证失败构建保留上一版本。应在允许这些操作的测试环境执行。测试读取 `.env`，不会在输出中列出密钥。

## 原生与压测

Android / iOS 编译和设备验收见各应用 README。浏览器检查不代表原生模拟器或真机验收。

k6 脚本位于 `tests/load/mixed.js`，监控工具为 `scripts/load/monitor.mjs`。各端当前验收范围见 [验收清单](validation.md)。历史并发结果见 [早期验收与压测](../archive/local-validation-2026-11.md)。
