# 地球离线影像与署名

> 2026-11-03 当前渲染：依据用户提供的手机版 Apple 地图夜间视频，使用黑色背景、深蓝海洋和统一调色的陆地。仅加载 `earth-day.jpg`，并从已打包的 world-atlas 50m 国家轮廓生成本地遮罩。没有云层球壳、夜灯贴图、定向太阳光或昼夜混合；轻微球面边缘明暗仅由观察角度决定，与时间及经度无关。其余三张历史纹理及下列来源记录保留，但不参与当前渲染。三端使用同一 renderer。


核验及下载日期：2026-11-02。四张纹理均从 NASA 官方域名下载，可随 Web、Android 与 iOS 静态包离线使用；未使用 Apple 地图瓦片、第三方图床或生成式地表图。它们是不同年代的合成资料，不表示实时地表、灯光、云层或天气。

文件位于 `packages/globe/public/textures/`，署名页位于 `packages/globe/public/credits.html`。构建应完整复制 public 内容，原生 WebView 保持相对路径 `textures/…`。详细来源、源文件与成品 SHA256、处理工具版本已随资源保存在 [asset-manifest.json](../packages/globe/public/textures/asset-manifest.json)。

| 本地文件 | 内容与年代 | 打包尺寸 | 字节数 |
| --- | --- | --- | ---: |
| `earth-day.jpg` | Blue Marble Next Generation，2004 年 7 月月合成，含地形阴影 | 4096 × 2048 RGB JPEG | 931,253 |
| `earth-night.jpg` | Black Marble，2016 年夜间灯光合成 | 3600 × 1800 RGB JPEG | 779,638 |
| `earth-bump.png` | GEBCO_08 陆地高程的 NASA 可视化灰度图 | 2048 × 1024 RGB PNG，灰度内容 | 522,717 |
| `earth-clouds.png` | Blue Marble Clouds，2002 年发布的历史云层合成 | 2048 × 1024 RGBA PNG | 2,220,148 |

纹理总计 **4,453,756 字节（4.25 MiB）**，低于 8 MB 目标；manifest 与署名页另占少量文本空间。压缩包体积不同于解码后的 GPU 内存，移动端仍应按渲染器能力控制纹理尺寸、mipmap 与生命周期。

**官方来源和原作者**

1. 日间影像：[NASA Blue Marble Next Generation / Base + Topography](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/)。署名 **NASA Earth Observatory / Reto Stöckli**。原图为 5400 × 2700；[July 2004 原 JPEG](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography/july/world.topo.200407.3x5400x2700.jpg)。该系列按月处理卫星观测，不是单次拍摄；[NASA 系列说明](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/)介绍了 MODIS 与合成方法。

2. 夜灯影像：[NASA Earth at Night / Flat Maps](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/)。署名 **NASA Earth Observatory / Joshua Stevens；Suomi NPP VIIRS 数据来自 Miguel Román，NASA Goddard Space Flight Center**。使用 3600 × 1800 的 [BlackMarble_2016_01deg.jpg](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg)，原 JPEG 逐字节保留。[NASA SVS 对该 2016 数据与作者的说明](https://svs.gsfc.nasa.gov/30878)可交叉核对。

3. 地形：[NASA Blue Marble Next Generation / Topography and Bathymetry Maps](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/topography-bathymetry-maps/)。署名 **Jesse Allen，NASA Earth Observatory；使用 British Oceanographic Data Centre 提供的 GEBCO 数据**，并保留 **GEBCO Compilation Group / GEBCO_08** 来源。使用页面所列 5400 × 2700 的 [gebco_08_rev_elev_5400x2700.jpg](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/topography/gebco_08_rev_elev_5400x2700.jpg)。这是可视化预览的再编码版本，适用于轻微 bump，不是可读出精确海拔的原始高程网格，也不用于导航。

4. 云层：**NASA Goddard Space Flight Center / Reto Stöckli，Blue Marble Clouds（2002 年发布）**。[NASA 官方原 JPEG](https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg)为 2048 × 1024。旧记录 `https://visibleearth.nasa.gov/images/57747/blue-marble-clouds` 在本次核验时已重定向至 NASA Earth Observatory 首页，原始图文件仍直接可下载；因此保留记录 ID、源文件 hash 与 [NASA SVS 的 Blue Marble Clouds 数据集作者说明](https://svs.gsfc.nasa.gov/2872/)，避免把重定向首页误称为完整资料页。云图与日间图年代不同。

**复用条款和展示署名**

[NASA Earth FAQ](https://science.nasa.gov/earth/faq/)说明其原创资料通常可再发布、再使用（包括商业用途），另行标注版权的第三方资料除外，并要求致谢 NASA。[NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)进一步说明署名、第三方权利以及不得暗示 NASA 背书等条件。本次所选官方原图页面未发现额外的第三方图片版权标记；地形的 GEBCO 数据另按其官方条款记录，不把整个纹理集合笼统标为 MIT。

[GEBCO Grid 及衍生信息产品使用条款](https://www.gebco.net/data-products/gridded-bathymetry/terms-of-use)将数据置于公共领域，允许复制、改编与商业使用；要求承认来源，不暗示 GEBCO/IHO/IOC 背书，不歪曲数据来源，并声明不用于航行或海上安全。本项目只将其作为地球外观的高程明暗输入。

原作者及机构名称保留在 manifest 和离线署名页。产品可从 Profile / Settings 的“地球影像来源”打开本地 `credits.html`；该页保留完整信用行、年代、官方链接和条款入口，无远程 JS、字体或运行时网络依赖。简短信用行可使用：**Earth imagery: NASA Earth Observatory. Relief: GEBCO_08, via NASA Earth Observatory.** 不使用 NASA 标志，也不暗示 NASA 或 GEBCO 支持本应用。

**处理和渲染约定**

四张图均保留 2:1 等距经纬展开，左至右约为西经 180° 至东经 180°，上至下为北极至南极；没有镜像、裁剪、绘制或添加虚构地表。处理使用 sharp 0.35.5 / libvips 8.18.7。

- 日间图：Lanczos3 缩至 4096 × 2048，以 JPEG quality 90、mozjpeg、4:4:4 色度编码。
- 夜灯：保留 NASA 源 JPEG 字节，无重采样或调色；颜色图中含暗色地表底图，若只需发光灯点，应由渲染器适当提取亮度，不把全图当成等强度照明。
- 地形：转灰度、Lanczos3 缩至 2048 × 1024，再以 PNG compression level 9 编码。海洋为低值，高地为较高值，正 bumpScale 可用于轻微起伏；作为数据纹理读取，不按 sRGB 颜色图处理。
- 云层：原 JPEG 灰度亮度直接成为 alpha，RGB 全部为白色，保留 2048 × 1024 并压为 RGBA PNG。用于透明球壳的 `map` 或 shader 的 `.a` 通道；**不能直接用作 Three.js 的 `alphaMap`**，后者读取绿色通道，而这里绿色恒为白色。源亮度与透明度一一对应，无生成式云层或人为重画。

日间和夜灯按 sRGB 颜色资料处理；云层采用透明混合，未覆盖的地表保持可见。开发者应延续现有球体 UV 约定，并检查城市标记与纹理经纬位置一致。

**成品 SHA256**

```text
460b479ba9d714c94563d0e553293f6b52322bf25a71e3ca9b6d00c196c4ebce  earth-day.jpg
d87de751a264e4f8ff69c68de5dab9606daee87a6f15ae743c93200743bd7ec1  earth-night.jpg
579cce501068380ef719eed093b3c77ea772c927d9ad43b22797654027aadc8f  earth-bump.png
ae8bdb4cdbf6712cc75dca67c02ae38c96ded660e605b074b65312c2fe17b4d0  earth-clouds.png
```

源文件 SHA256 和源分辨率见 `asset-manifest.json`。离线核验已逐张重新解码并比对 hash、尺寸、字节数、2:1 比例；云图额外核验 RGBA 四通道、RGB 全白、alpha 覆盖 0…255 且同时存在完全透明和完全不透明像素。日间、夜灯、地形已人工预览核对，无 HTML 错误页或预渲染球体混入纹理。
