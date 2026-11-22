> 历史记录：本文保留当时的设计与验收结论。当前命令、目录和构建状态以仓库 README 为准。

# 地球与开屏升级需求（Globe & Splash Upgrade）

> 2026-11-06 依据用户最初始的 6 段视频、参考 HTML（我的世界.html，globe.gl 2.30 实现）与现状代码整理。
> 与 `PROFILE_UPGRADE.md`（个人主页升级）并行，共同构成本轮全部需求。
> 视频逐帧转写摘要见文末。

## 一、需求总览

| # | 需求 | 来源 |
|---|---|---|
| G1 | 地球替换为参考视频同款**照片级蔚蓝星球**（NASA 蓝色大理石 + 地形凹凸 + 云层观感 + 大气光晕），替换现在的扁平纯色地球 | 用户口述 + g1/g2/g3 笔记本参考画面 |
| G2 | 地球背后要有**星空背景**与**纵深感**；地图与星光配色均采用参考 HTML 的配色 | 用户口述 + g1/g2（参考画面星空） |
| G3 | **球体变小**：初始整球可见、四周留边（参考约占视口 55–60%），替换现在溢出屏幕的取景 | 用户口述「球可以小一点离边框再小一点」+ g1 现状（球溢出边缘）vs 参考（留边） |
| G4 | **上手即自动滚动**，不能死停；删除右侧暂停/播放圆键 | 用户口述 + g1（▶ 键可见、6 秒两帧完全相同=停转） |
| G5 | 用户可自由**放大缩小/拖动**；选中国家时相机推进（参考：点击 China 后放大 + 城市明信片卡扇） | 用户口述 + g3 cell6 |
| G6 | **开屏（启动画面）星光背景** + 与星光匹配的色系（三端统一） | 用户第一轮需求 |
| G7 | 三端（web/Android/iOS）共用同一 globe 渲染包与配色 token | 项目现状（sync-globe / sync-design 管线） |

## 二、现状 vs 参考（视频实证）

| 维度 | 现状（g1/g2 手机端） | 参考（g1/g2/g3 笔记本端） |
|---|---|---|
| 地表 | 扁平纯色：深海军蓝海洋 + 浅蓝灰陆地色块，选中围白色，斜向晨昏线 | 照片级：深蓝海洋 + 青色洋流旋涡 + 绿褐色大陆 + 白色云系 |
| 大气 | 仅亮侧微弱亮边 | 明亮白色/青色宽大气光晕 |
| 背景 | 纯黑，无星 | 黑色宇宙 + 白色星点群 |
| 取景 | 放大态，球溢出右/下边缘 | 整球居中略偏左，约占视口宽 55–60%，四周留黑边 |
| 旋转 | 死停（▶ 键显示播放态；24s 与 30s 两帧相同） | 缓慢自转（g3 cell4→cell5 地表纹理位移） |
| 缩放 | — | 可放大至整屏（g3 cell6，China 面板 + 城市卡扇） |
| UI | 右侧半透明圆键 ▶（暂停态） | 右下小圆键 + 奶油色搜索胶囊 + 左侧信息栏 + 底部圆形导航 |

参考 HTML 实现要点（已逐行核对）：`globe.gl@2.30` + `earth-blue-marble.jpg` + `earth-topology.png`（bump）+ `night-sky.png`（背景球）+ `showAtmosphere(true)`；国家版块 `rgba(0,100,200,.30)` / 选中 `rgba(100,150,230,.45)`——与现有 token `focusDeep #0064C8` / `focus #6496E6` 同源，配色无需改动即可对齐。

## 三、实施要求

### G1 照片级地球（packages/globe）
1. 弃用 `createEarthAppearance` 平色着色器，改照片纹理渲染：`globeImageUrl` 用现有离线 `textures/earth-day.jpg`（NASA Blue Marble NG，已含地形阴影，208KB）。
2. 重新引入 **地形凹凸贴图**（bump）：按 EARTH_ASSETS 管线下载 GEBCO 灰度高程（历史版本源记录在 git），sharp 重采样 2048×1024、baseline JPEG/PNG，更新 `asset-manifest.json` SHA256 与 `credits.html` 署名。
3. **云层观感**：优先评估 `earth-day.jpg` 直出效果；不足则重新引入 Blue Marble Clouds 2002 纹理（历史源记录在 git）作为第二球壳或烘入日图，保持离线打包。
4. 大气光晕：开启 globe.gl 自带 `showAtmosphere(true)` 蓝色辉光，替换自建 rim 网格。
5. 国家版块/选中描边沿用现有 focus token（与参考配色一致）。

### G2 星空背景与纵深感
1. globe 画布背景使用离线星空纹理（参考 `night-sky.png` 同源类资产；需按 EARTH_ASSETS 规范下载、记录来源与署名）或程序化 canvas 星空（性能敏感时）。
2. 星点配色走新星光 token（见 G6），与开屏一致。
3. 纵深感：整球取景 + 大气辉光 + 星空视差即可满足，不加多余粒子。

### G3 球体取景
- 初始取景系数 `.88` 收至约 `.60–.65`（`Math.min(width,height)` 口径），保证整球四周留边；参照视频约 55–60% 视口宽。

### G4 自动滚动
1. 删除 `packages/globe/index.html` 的 `#spin-toggle` 按钮及 `main.ts` 中对应事件/图标切换逻辑。
2. `autoRotate` 默认 true（尊重 `prefers-reduced-motion`）；转速对齐参考（`autoRotateSpeed ≈ 1`，缓慢）。
3. 交互暂停与自动恢复：拖动/缩放时暂停，`controls` `end` 后约 2.5s 恢复；查看国家详情（focusPlace）期间暂停，关闭详情/回到地球恢复；页面隐藏或非活动 tab 停渲染（沿用现有生命周期）。

### G5 交互与聚焦
1. 保留滚轮/双指缩放与拖动（`minDistance 120 / maxDistance 800` 与参考一致）。
2. 选中国家：相机推进到国家上空（现有 focusPlace 逻辑保留），视觉对齐参考的「放大 + 面板」感受。

### G6 开屏星光与色系（三端）
1. 新增星光 token（`packages/contracts/assets/visual.json` → sync-design 三端生成）：`nebula`（深空底 ≈#0A1122）、`starSoft`（多数星点 ≈#D7E1F0）、`starBright`（亮星 ≈#F5F9FF）；光晕复用 `focus`。
2. web：`apps/web/index.html` 预挂载深空渐变 + 内联 CSS 星点层（激活现有闲置 `.starfield`/`twinkle`，改用星光 token），JS 挂载后淡出。
3. globe boot 遮罩（`packages/globe/index.html #boot`）同款星空化，加载期即呈现星光。
4. Android：新建 `res/values/themes.xml` + `launch_background` layer-list（深空底 + 星点），Manifest 启动主题替换系统浅色，消除白屏。
5. iOS：`UILaunchScreen` 设 `UIColorName`（新建 Assets.xcassets 深空色板）。
6. 开屏与地球页背景连续：同一 `--ow-bg` 夜空底 + 星空，视觉上从开屏滚入地球。

### G7 同步与守护
- 全部新颜色必须走 visual.json → `node scripts/generate/sync-design.mjs`（`color-tokens.mjs` 禁止裸 hex）。
- globe 包构建后 `scripts/generate/sync-globe.mjs` 同步三端。
- 更新 `docs/assets/earth.md`（渲染方式、新纹理来源/SHA/署名）、`docs/archive/deep-sea-ui.md`（大气描述）、`docs/testing/validation.md`。

## 四、验证
1. `node scripts/generate/sync-design.mjs && npm run build`。
2. `color-tokens.mjs` / `deep-sea-ui.mjs` / `globe-boundaries.mjs` 回归（如断言引用 spin-toggle 或平色渲染需同步更新）。
3. 浏览器验证（`npm run dev -w @ourworld/web` → 5173）：开屏星点闪烁 → 地球加载即自转（间隔截图对比位移）、无暂停键、整球留边、大气光晕、星空背景、点国家版块高亮 + 推进。
4. Android/iOS 构建并确认启动屏为深空星光（静态），WebViews 内地球一致。

## 五、视频证据（逐帧转写摘要）

| 视频 | 内容 | 关键画面 |
|---|---|---|
| g1 (53.4s) | 现状 App（城市列表→中国页→**地球页**）→ 参考页 | 手机端扁平地球放大溢出边缘、选中中国=纯白、橙点、无星空、**▶ 暂停键可见且 24s/30s 两帧相同（死停）**；笔记本参考=照片地球+云+大气辉光+星空+整球留边（55–60%）+ 卡扇 |
| g2 (7.4s) | 参考页 vs 现状地球同框对比 | 参考整球+密集星点+宽辉光；现状扁地球+纯黑背景+▶ 键 |
| g3 (44.7s) | 参考页（慢速自转→点 China 放大→面板+明信片卡扇）；手机端西安卡/浅色平铺地图/城市故事 | 参考 cell4→cell5 地表位移=缓慢自转；cell6 放大整屏 + China 面板 |
| g4 (56.5s) | 现状 App：城市列表→上海详情→**找人卡 Theo Rossi**→登录弹窗 | 找人卡照片**约 12 秒才加载**（灰渐变占位）；登录弹窗「欢迎来到 Ourworld/世界很大，总有人在等你」 |
| g5 (34.4s) | 现状找人 deck（上海） | Theo Rivera→Mia Taylor 滑动、绿标「聊一聊」/红标「路过」、toast「✓ 已加入对话，建议认识下一位」、卡后扁平青蓝地图剪影 |
| g6 (37.0s) | 现状找人 deck 续 | Ava Laurent 与 **Leo Sato 显示同一张照片**、姓名与照片性别不匹配（演示数据错配）；空白卡占位→照片晚加载 |

## 六、顺带发现（归属 profile/体验，已并入 PROFILE_UPGRADE.md 补充节）
- 人物卡照片加载过慢（约 12s）：需占位骨架 + 尺寸/预加载优化。
- 演示数据错配：同名照片复用、姓名-照片性别不一致，需修 seed。
