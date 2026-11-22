# Ourworld Web

React 19 + TypeScript + Vite。网页和管理后台共用同源 API；地球通过 `/globe/index.html` 加载 `packages/globe` 生成的离线资源。

## 开发

在仓库根目录运行：

```sh
uv sync --locked
uv run ourworld setup
uv run ourworld dev web
```

Vite 默认端口为 5173。真实 API 与容器网页运行方式见 [开发指南](../../docs/development.md)。

## 源码组织

- `src/App.tsx`：导航、登录状态、语言和公共上下文。
- `src/Explore.tsx`：地球桥接、地点搜索和当地人卡片。
- `src/Chat.tsx`：会话与消息。
- `src/features/profile/`：个人主页、照片轮播、简介与照片故事、爱好分类、城市和语言选择器。
- `src/SlidePresence.tsx`、`src/useDialogFocus.ts`：弹层退出生命周期和焦点管理。
- `src/visual-tokens.css`：从共享视觉配置生成的令牌。

主页使用双列卡片，同类爱好合并展示，保留新增爱好与新增故事入口。个人简介、故事和爱好通过独立页面编辑；滑入页面关闭时向下退出，并尊重减少动态效果设置。

## 构建和自动部署

```sh
uv run ourworld build
uv run ourworld watch
uv run ourworld logs
```

前端监听器位于 `scripts/dev/frontend-watch.mjs`，在独立工作目录构建，以版本目录和原子链接发布。构建失败时保留当前版本；旧页面需要的哈希资源会暂时保留。编辑表单和聊天输入期间，页面自动刷新会延迟执行。

`public/globe/` 和 `public/openapi.json` 是生成输出。更新地球应修改 `packages/globe`；更新 API 文档应修改路由、契约或 `scripts/generate/generate-openapi.mjs`。

## 测试

```sh
uv run ourworld browsers
uv run ourworld test web profile-owner
uv run ourworld test web profile-hobbies
uv run ourworld test web slide-exit
uv run ourworld test web globe-recovery
```

浏览器脚本集中在 `tests/e2e/web/`，纯逻辑检查位于 `tests/unit/`。完整分类见 [测试指南](../../docs/testing/README.md)。

## 登录与退出

网页在同源浏览器存储中保存有效会话，刷新和重新打开页面会恢复登录，访问令牌过期后自动续期。临时网络或服务错误保留本机登录；服务端明确撤销或过期的会话会清除。原有标签页会话会自动迁移。

个人主页管理区、设置和管理后台均提供退出登录。点击退出先显示确认弹窗；取消或关闭弹窗保留登录，确认后立即清理本机状态并同步其他标签页，服务器注销不可用时也可退出当前设备。回归入口：`uv run ourworld test web auth-session`。
