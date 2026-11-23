# Ourworld Web

React 19 + TypeScript + Vite。网页和管理后台共用同源 API；地球通过 `/globe/index.html` 加载 `packages/globe` 生成的离线资源。

## 开发

在仓库根目录运行：

```sh
uv sync --locked
uv run ourworld setup
uv run ourworld dev web
```

Vite 默认端口为 5173，请求默认代理到 8188。真实 API 与容器网页运行方式见 [开发指南](../../docs/development.md)。

## 源码组织

- `src/App.tsx`：导航、登录状态、语言和公共上下文。
- `src/Explore.tsx`：地球桥接、地点搜索和当地人卡片。
- `src/Stories.tsx`：社区和城市旅行故事。
- `src/Chat.tsx`：会话与消息。
- `src/NavEarth.tsx`、`src/NavPlanet.tsx` 提供底栏图标。首屏显示随网页打包的静态图，主地球开屏完成后再初始化微缩地球并加载旋转帧。
- `src/features/profile/` 包含个人主页、「我的足迹」、照片查看器、简介、爱好、城市和语言选择器。
- `src/SlidePresence.tsx`、`src/useDialogFocus.ts`：弹层退出生命周期和焦点管理。
- `src/visual-tokens.css`：从共享视觉配置生成的令牌。

「我的足迹」可编辑标语和每张照片的说明，也可选择居中的主照片。两侧小图可滚动浏览。爱好卡片横向滚动，同类爱好合并展示。上传爱好图片后，卡片在固定比例容器内等比裁切图片，未上传时显示原有表情符号。个人简介、故事和爱好通过独立页面编辑，弹层尊重减少动态效果设置。

地球加载约两秒后显示等待说明。超过 15 秒可手动重试，当前下载会继续进行。渲染器报告错误时自动重试一次。

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
uv run ourworld test web globe-first-open
uv run ourworld test web globe-recovery
```

浏览器脚本集中在 `tests/e2e/web/`，纯逻辑检查位于 `tests/unit/`。完整分类见 [测试指南](../../docs/testing/README.md)。

## 登录与退出

网页在同源浏览器存储中保存有效会话，刷新和重新打开页面会恢复登录，访问令牌过期后自动续期。临时网络或服务错误保留本机登录；服务端明确撤销或过期的会话会清除。原有标签页会话会自动迁移。

个人主页管理区、设置和管理后台均提供退出登录。点击退出先显示确认弹窗；取消或关闭弹窗保留登录，确认后立即清理本机状态并同步其他标签页，服务器注销不可用时也可退出当前设备。回归入口：`uv run ourworld test web auth-session`。
