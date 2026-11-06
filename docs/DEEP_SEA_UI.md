# OURWORLD · 深海探索与人物相遇

2026-11-03 实现记录。此文替代 `MATURE_VISUAL.md` 中的当前交付状态；旧文件保留为设计历史。

## 实现

三端共用 `packages/contracts/assets/visual.json` 的配色、尺寸和手势参数，生成 CSS、Kotlin 与 Swift 常量。Manrope / Noto Sans SC、24dp 人物卡圆角、48dp 主要触摸区域保持一致。珊瑚色集中用于加入对话等主要动作；探索采用深色，主页和聊天采用浅色内容面。

### 地球（2026-11-06 蔚蓝星球更新）

- 球面为照片渲染：本地 `earth-day.jpg`（NASA Blue Marble，云层已烘入）直接作 `globeImageUrl`，叠加 `earth-topology.png`（GEBCO_08 灰度）作凹凸贴图产生纵深；自带 `showAtmosphere(true)` 钴蓝大气辉光（`theme.focus`，高度 .22），随相机的高位光保证整球均匀可读、无太阳方向依赖。纯色着色器与自绘边缘光已移除。
- 国家块：`globe.gl` 多边形图层。默认高度 0.004、填充 `rgba(0,100,200,.30)`、侧壁 `.10`、描边 `.50`；选中国家抬到 0.014，填充 `rgba(100,150,230,.45)`、侧壁 `.25`、描边 `.70`。原矢量国界线层（`borders.ts`）已移除，边界由多边形描边承担。
- 城市标记抬到高度 0.02，始终高于国家块，选中国家时不会被半透明蓝色板块盖住。
- `src/atlas.ts` 在数据层做领土合并：台湾按 ISO 158 并入中国 156，`feature()`、`geoContains()`、陆海遮罩和选中样式自动继承合并后的形状。合并项不得与目标共享 arc，否则 `topojson.mesh` 会把该弧当成海岸线重画。升级 `world-atlas` 后必须重跑 `apps/web/test/globe-boundaries.mjs`。
- 自转默认开启（`autoRotateSpeed .9`，`dampingFactor .08`，`minDistance 120`，`maxDistance 800`），`prefers-reduced-motion` 时关闭。手动暂停按钮已删除：拖动后约 2.5s、恢复视角后约 4s、选中国家/聚焦地点后约 8s 自动恢复，地球不再死停。切到其它 tab 或页面隐藏时停止绘制。星空背景为程序化 canvas（`nebula/starSoft/starBright` token）+ 少量 CSS 闪烁星点，boot 遮罩半透明覆盖其上构成星光开屏。
- 地球页外壳：顶部单颗白色搜索胶囊，右侧深蓝 `#0D2242` 提交块；底部三颗圆形浮动导航（地球态为半透明黑底 + 白色图标，激活态墨蓝实心 + 亮蓝描边光晕——近黑底色上仅靠深蓝填充无法分辨选中）；人物卡的略过/加入按钮改用 `#FF4757` / `#2ED573`，配深色图标保证对比度（白字对这两个色只有 2.4:1 与 1.7:1）。
- 初始球体完整居中，约占短边 62%，四周留出星空呼吸空间。人物卡前景时禁用地球触摸。
- 聚焦和冻结统一处理：快速打开人物卡也先完成城市聚焦，再暂停；国家点击和搜索聚焦均回传最终相机状态。返回探索恢复原视角。

核心文件：`packages/globe/src/atlas.ts`、`earth-material.ts`、`main.ts`。

### 人物与主页

- 地球实例保留在人物流后方，覆盖层轻微压暗。照片铺满卡片，姓名、必要身份、最多两项兴趣和详情入口集中在下部；底下保留两张候选卡。
- 横向跟手、方向锁定、距离与速度共同判定；慢拖阈值 25%，快甩最低 8% 且同向 900dp/s。纵向拖动和释放前反向甩动不提交。
- 可重新抓取的弹簧回弹、180–280ms 退场、下一张连续接位、阈值触觉反馈；减少动态效果时弱化旋转和远距离运动。
- 略过只推进本轮。加入对话并行执行退场和请求，两者成功才推进；失败回到原人物并显示局部重试。锁定操作防重复，过期请求不覆盖新筛选。
- 登录取消保留原卡；验证完成恢复同一人物意图。原生端补充“我已完成验证”刷新入口。
- 原生完整详情页 / 网页全屏详情，照片和身份优先，介绍只显示一次，隐藏公开页空相册的编辑提示，底部固定加入对话。保留主题、发布顺序、草稿、版本和 Agent 能力。

Android：`DiscoveryScreen.kt`、`SwipePhysics.kt`、`ProfileScreen.kt`、`WorldModel.kt`。网页：`Explore.tsx`、`useSwipeDeck.ts`、`swipe-physics.ts`、`Profile.tsx`。iOS：`TravelScreens.swift`、`WorldStore.swift`。

### 聊天

- 会话列表强调头像、姓名、最近消息、时间与未读，将结构化消息摘要转换为可读文字。
- 详情显示人物及真实相识城市；空会话的两个建议只填入输入框。详情隐藏主导航。
- 附件统一收纳图片、联系方式、地点、我的服务、行程与评价；举报和拉黑进入更多菜单，消息通过长按举报。
- 分别维护人流加载、建聊与消息发送。逐条发送中 / 失败 / 重试；重试复用 `clientMessageId`，已读只使用真实回执。保留历史消息和分页，阅读历史时避免被新消息拉到底部。
- 网页补齐弹窗焦点约束、返回焦点、键盘视口；Android 使用 IME 调整和安全区，原生列表保留历史位置。

没有新增业务端点或数据库迁移。API 唯一额外变化是显示层识别未经修改的受控 `load-*` 演示资料，把编号姓名和开发占位介绍转换为展示文案；真实资料及用户修改的演示资料保持原样，AI 标识保留。

## 已完成验证

| 检查 | 结果 / 证据 |
|---|---|
| 完整项目构建 | `artifacts/deep-sea/build.log`；包含共用地球、API、网页和管理端 |
| TypeScript | 全工作区通过，`typecheck.log` |
| API 自动测试 | 36 通过，0 失败，`api-tests-final.log` |
| 网页手势规则 | 10 个距离、速度、方向与取消案例 |
| Android | Compose 编译、两个调试 APK 打包，19 个 JVM 测试通过；`android-*-build.log` |
| 手机网页 | 360×640、390×844、430×932，42 组检查；`ui-report.json`、`ui-run.log` |
| 地球专项 | 德国、印度尼西亚、斐济、跨经线俄罗斯点击；聚焦后冻结、冻结时拒绝触摸、无外部请求；`globe-report.json` |
| 部署 | 本机 8188 健康，网页和地球脚本与构建产物逐字节一致；`deployment-check.json` |
| 打包资源 | 四个资源目标及两个 APK 内的离线地球一致；CRC、API 地址和原调试证书核对见 `release-check.json` |
| iOS | 5 个 Swift 文件语法解析无错误，`ios-syntax.json`；不是 Xcode 编译结果 |

手机网页回归使用隔离接口数据，不向真实会话发送消息。覆盖阈值前回弹、建聊失败恢复、按钮与滑动推进、主页返回、空相册、开场建议不自动发送、发送失败复用 ID 重试、已读回执、附件入口、长姓名、图片失败与无横向溢出。390 宽度额外检查大字、英文、取消登录及登录后恢复；报告中其他宽度的这三项为 `null`，表示未运行。

`mobile-web-interactions.webm` 为 **390 宽度网页自动化录屏**。截图均为网页，不是 Android 真机或 iOS 截图。亚洲及其他半球截图为 `earth-*.png`，选中国家为 `country-selected-*.png`，人物 / 主页 / 聊天 / 附件为对应尺寸的 PNG。

## taste-skill 评审

继续使用已存在的两个用户级安装：`C:/Users/Huawei/.codex/skills/taste-skill` 与 `C:/Users/Huawei/.agents/skills/taste-skill`，本轮没有覆盖全局文件。方向记录在 `.taste-skill/deep-sea/direction.json`，应用屏幕采用 `true-black-flat`，保留已约定的 OURWORLD 配色与字体。

官方 inspector：0 FAIL、1 WARN；源码检查：0 FAIL、4 WARN。地图、人物、主页、会话列表、聊天详情分别通过真实浏览器截图及同一技能的 probe/rules 评审，结果见 `taste-pages.json`，同时保留未经豁免的 `rawFindings`。

限定例外及原因：

- 地球首页按既有要求不添加标题，允许 `no-title`。1440 宽度的 `hero-void` 来自居中手机框外留白，保留手机体验容器；本轮不扩展为桌面工作台。
- 空或短会话、仅有一个会话的列表保留自然留白，允许 `blank-gap`。两种聊天屏幕均有可见真实 h1，另有自动断言；技能首先读到保留在隐藏面板中的 h1，故对这些场景的 `no-title` 误报单独允许。
- 保留面板 / 主页覆盖层导致字号数和多个 h1 警告；截图检查可见层。字体体系没有为通过仪表而删除功能信息。
- `backdrop-filter: none` 被源码规则误判为玻璃效果，实际用于移除旧模糊。三个 eyebrow 警告为既有搜索、地点和服务编辑中的上下文标签。
- 地球纹理、球缘和照片底部提高文字可读性的遮罩按地图 / 内容用途评审；单页营销站的多张照片、标题、滚动叙事要求不适用于单个地图或聊天屏幕。

已查看官方 inspector 六张图片。其首张桌面截图在地球就绪前捕获，因此不能作为最终地图画面；补充的 `earth-ready-1440.png` / `earth-ready-768.png` 等待真实 rendererReady。三种手机尺寸截图同样等待地球与人物照片就绪。

视觉复核记录见 `artifacts/deep-sea/critique.md`。自动规则通过不等同于真机手感或画面评分。

## 安装与复现

- 手机：`apps/android/releases/ourworld-deep-sea-phone-debug.apk`，API 为 `http://192.168.1.102:8188/api/v1`。手机与这台电脑在同一局域网时使用。
- Android 模拟器：`apps/android/releases/ourworld-deep-sea-emulator-debug.apk`，API 为 `http://10.0.2.2:8188/api/v1`。
- 两包沿用旧包证书 `ba4d593e…461fc40`。最终包用原缓存卷中的密钥重新签名，并再次验证；未导出私钥。后续 Docker 构建应挂载原卷 `ourworld-gradle-cache` 到 `/root/.gradle`，避免新建密钥改变签名。
- 本地网页：`http://127.0.0.1:8188`。更新已有 gateway/API 容器，未重新 seed、迁移或清空数据。

```powershell
npm run build
npm run typecheck
$env:REDIS_URL='redis://127.0.0.1:56379'
$env:SMTP_HOST='127.0.0.1'
npm test
node apps/web/test/swipe-physics.mjs
node apps/web/test/globe-boundaries.mjs
node apps/web/test/deep-sea-ui.mjs
python scripts/verify-deep-sea.py
```

浏览器测试需要本地 Playwright 浏览器缓存 `.playwright-browsers`，专项测试的桌面参考读取现有 8188 匿名数据；手机回归自动启动 127.0.0.1:5186 的生产预览，专项测试使用 5187。技能位置可通过 `TASTE_SKILL_HOME` 指定。

Android 可按 `apps/android/README.md` 构建；iOS 按 `apps/ios/README.md` 在 Mac 上生成并构建项目。

## 待设备验收

当前 ADB 未连接设备，Windows 不提供 Xcode。以下项目没有标记为通过：

- Android 安装后正常亮度下的深海可读性、慢拖 / 快甩 / 回弹重抓、触觉、键盘、大字体及系统减少动态效果。
- 真机预热后连续 30 次操作，记录机型、刷新率和逐帧耗时；60Hz 下 95% 帧不超 16.67ms 的目标尚未测量。
- Android 原生滑动录屏、原生双账号收发、断网重连和历史阅读；网页隔离回归不替代这些结果。
- iOS Xcode 编译、模拟器和真机检查、跨端双账号流程。当前没有 iOS 安装包。

连接设备后可先执行 `adb shell dumpsys gfxinfo app.ourworld reset`，完成操作，再保存 `adb shell dumpsys gfxinfo app.ourworld framestats`，并使用 `adb shell screenrecord` 采集原生录像。签名 / 打包 / 网页软件渲染结果均不能证明真机帧率。
