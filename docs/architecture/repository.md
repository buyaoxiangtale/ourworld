# 目录与产物约定

## 职责

`apps` 是可交付应用，保持 Android、iOS 的原生工程约定；`packages` 保存跨客户端共享源码和源素材。网页业务模块按功能归类，个人主页统一放在 `apps/web/src/features/profile`。

`scripts` 保存构建、开发、部署、素材及压测自动化；`tools/ourworld_tools` 提供 uv 命令入口。执行外部工具时保留其退出码，以仓库根目录为工作目录，不经过拼接的 shell 命令。

`tests/unit` 为仓库和前端逻辑检查，`tests/tools` 为 Python 工具测试，`tests/e2e/web` 为浏览器回归，`tests/integration` 为真实服务验收，`tests/load` 为 k6。API 工作区单元测试位于 `apps/api/test`。

## 源文件和生成文件

| 来源 | 生成输出 | 版本控制 |
| --- | --- | --- |
| `packages/contracts/assets/visual.json` | CSS、Kotlin、Swift 和地球主题令牌 | 保留并验证同步 |
| API 路由与 OpenAPI 生成器 | `docs/api/openapi.json` | 保留接口审阅版本 |
| OpenAPI 生成器 | `apps/web/public/openapi.json` | 忽略，构建时生成 |
| `packages/globe/src`、`packages/globe/public` | `packages/globe/dist` | 忽略 |
| 地球构建输出 | 网页 `public/globe`、Android `assets/globe`、iOS `Resources/globe` | 忽略，准备资源时复制 |
| 应用源码 | `apps/*/dist`、原生 `build` | 忽略 |
| 验收脚本 | `artifacts`、测试报告 | 忽略 |
| uv / npm / 浏览器工具 | `.venv`、`node_modules`、`.playwright-browsers` | 忽略 |

原始地图纹理、照片、字体及其署名是构建输入，应保留。数据库、上传文件、`.env` 和签名密钥不属于构建输出。

## 清理

`uv run ourworld clean --dry-run` 显示清理列表，`uv run ourworld clean` 仅删除允许列表中的可再生成内容。工具不会跟随路径跳出仓库删除外部目录。报告、依赖缓存和持久化数据不在默认清理范围内。

历史设计和验收记录位于 `docs/archive`。其中的旧版命令、截图和安装包信息保留原记录的含义，当前操作方式以根 README 为准。
