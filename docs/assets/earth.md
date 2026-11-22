# 地球离线影像与署名

> 2026-11-06 当前渲染：蔚蓝星球照片渲染。`earth-day.jpg`（云层已烘入）直接作地表纹理，`earth-topology.png`（GEBCO_08 灰度）作凹凸贴图，globe.gl 自带钴蓝大气辉光；高位随相机光保证整球均匀可读。没有独立云层球壳、夜灯贴图、定向太阳光或昼夜混合；轻微球面明暗仅由观察角度决定，与时间及经度无关。星空背景为程序化 canvas，非摄影素材。三端使用同一 renderer。历史上的夜灯与云层纹理从未参与当前渲染，已于 2026-11-04 从打包资源中移除（完整来源记录见 git 历史）；地形贴图于 2026-11-06 依相同已核验源重建，成品与历史版本逐字节一致。

核验及下载日期：2026-11-02；2026-11-04 重新编码并瘦身。纹理从 NASA 官方域名下载，可随 Web、Android 与 iOS 静态包离线使用；未使用 Apple 地图瓦片、第三方图床或生成式地表图。它是合成资料，不表示实时地表。

文件位于 `packages/globe/public/textures/`，署名页位于 `packages/globe/public/credits.html`。构建应完整复制 public 内容，原生 WebView 保持相对路径 `textures/…`。详细来源、源文件与成品 SHA256、处理工具版本已随资源保存在 [asset-manifest.json](../../packages/globe/public/textures/asset-manifest.json)。

| 本地文件 | 内容与年代 | 打包尺寸 | 字节数 |
| --- | --- | --- | ---: |
| `earth-day.jpg` | Blue Marble Next Generation，2004 年 7 月月合成，含地形阴影 | 2048 × 1024 RGB JPEG（baseline） | 213,354 |
| `earth-topology.png` | GEBCO_08 地形/海床灰度，用作凹凸贴图 | 2048 × 1024 灰度内容、RGB 容器 PNG | 522,717 |

纹理总计 **736,071 字节（约 719 KiB）**。压缩包体积不同于解码后的 GPU 内存：2048 × 1024 解码后约 8MB 显存（含 mipmap），移动端解码也快于原先的 4096 × 2048 渐进式 JPEG。

**官方来源和原作者**

1. 日间影像：[NASA Blue Marble Next Generation / Base + Topography](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/)。署名 **NASA Earth Observatory / Reto Stöckli**。原图为 5400 × 2700；[July 2004 原 JPEG](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography/july/world.topo.200407.3x5400x2700.jpg)。该系列按月处理卫星观测，不是单次拍摄；[NASA 系列说明](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/)介绍了 MODIS 与合成方法。

2. 已移除的历史纹理（2026-11-04 之前随包分发、当前渲染从未加载）：Black Marble 2016 夜灯（NASA Earth Observatory / Joshua Stevens，VIIRS 数据来自 Miguel Román）、Blue Marble Clouds 2002（NASA GSFC / Reto Stöckli）。GEBCO_08 地形灰度（Jesse Allen / GEBCO Compilation Group）曾于 2026-11-04 移除、2026-11-06 恢复（见上表）。已移除纹理的核验记录与条款摘录保留在 git 历史与本文件早期版本中。

**复用条款和展示署名**

[NASA Earth FAQ](https://science.nasa.gov/earth/faq/)说明其原创资料通常可再发布、再使用（包括商业用途），另行标注版权的第三方资料除外，并要求致谢 NASA。[NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)进一步说明署名、第三方权利以及不得暗示 NASA 背书等条件。本次所选官方原图页面未发现额外的第三方图片版权标记。

原作者及机构名称保留在 manifest 和离线署名页。产品可从 Profile / Settings 的“地球影像来源”打开本地 `credits.html`；该页保留完整信用行、年代、官方链接和条款入口，无远程 JS、字体或运行时网络依赖。简短信用行可使用：**Earth imagery: NASA Earth Observatory.** 不使用 NASA 标志，也不暗示 NASA 支持本应用。

**处理和渲染约定**

日间图保留 2:1 等距经纬展开，左至右约为西经 180° 至东经 180°，上至下为北极至南极；没有镜像、裁剪、绘制或添加虚构地表。处理使用 sharp 0.35.5 / libvips 8.18.7。

- 日间图：2026-11-04 由此前 4096 × 2048 渐进式版本以 Lanczos3 重采样至 2048 × 1024，JPEG quality 84、baseline（非渐进式）编码，4:2:0 色度。baseline 编码避免移动端对渐进式 JPEG 的慢速解码。

日间图按 sRGB 颜色资料处理。开发者应延续现有球体 UV 约定，并检查城市标记与纹理经纬位置一致。

**成品 SHA256**

```text
a61a1cc907a856f835856b4ee9fd4a5ece2a35807bfd96ef36b23f0d613d5cd0  earth-day.jpg
579cce501068380ef719eed093b3c77ea772c927d9ad43b22797654027aadc8f  earth-topology.png
```

源文件 SHA256 和源分辨率见 `asset-manifest.json`。2026-11-04 已重新解码核对 hash、尺寸、字节数与 2:1 比例；此前对四张纹理的逐张核验记录（含云图 RGBA 通道检查）保留在 git 历史中。
