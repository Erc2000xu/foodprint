# Foodprint V2.4.1｜定位按钮正式资产包

> 资产编号：UI-02 / Locate control<br>
> 日期：2026-08-18<br>
> 状态：**ImageGen 正式母稿、真实透明 PNG、1×/2×/3× 程序文件、SVG 回退与 QA 均已完成；待 V2.4.1 编码接入和真机验收**

## 1. 最终结论

定位按钮采用“深青定位环 + 暖米白内盘 + 橙红中心点”的软陶方向。最终交付不是带棋盘格的截图，也不是只有对话里才能看到的临时图片，而是一套已保存在仓库、可直接由 Codex 接入的正式资产：

| 文件 | 用途 | 能否直接上线 |
| --- | --- | --- |
| `public/icons/map-controls/locate-current-master.png` | 1024 × 1024、RGBA 透明生产母稿 | 不由页面直接加载；用于重新导出 |
| `public/icons/map-controls/locate-current-ui.png` | 256 × 256、RGBA 通用程序版 | 可用，但定位按钮优先使用下方 srcset |
| `public/icons/map-controls/locate-current-26.png` | 26 × 26、1× | 是 |
| `public/icons/map-controls/locate-current-52.png` | 52 × 52、2× | 是 |
| `public/icons/map-controls/locate-current-78.png` | 78 × 78、3× | 是 |
| `public/icons/map-controls/locate-current.svg` | 48 × 48 确定性矢量回退 | 是；用于 PNG 加载失败或无材质版本 |
| `public/icons/map-controls/locate-current.manifest.json` | 尺寸、路径、校验值和接入合同 | 是 |

设计源和 QA 文件：

- `imagegen-chroma-master-v2.png`：内置 ImageGen 生成的纯色抠图母稿，仍是 RGB，仅作为处理源，不得上线；
- `imagegen-direction-location-control.png`：第一版方向稿，棋盘格被画入像素，仅保留为失败记录，不得上线；
- `process-location-control.mjs`：可重复执行的抠图、去紫边、裁边、居中、导出和自动审计脚本；
- `qa-location-control.png`：透明棋盘、深色背景、44px 按钮和原生 1×/2×/3× 尺寸检查板。

## 2. 透明度与图像质量结论

正式 PNG 已通过自动检查：

- 文件是 8-bit RGBA 四通道，不是 RGB 假透明；
- 四个角 alpha 都为 `0`，图标主体为不透明；
- alpha 大于 16 的可见像素中，抠图紫色残留为 `0`；
- 26 / 52 / 78 / 256 / 1024 五种尺寸均保持透明通道；
- 图形可见边界中心与画布中心偏差为 0–0.5px，低于 1px 合同；
- 已在白色、地图浅色与深青背景上进行视觉检查，没有棋盘格、白色方底或紫边；
- 26px 原生尺寸下中心点和四向定位刻度仍可辨认。

第一版图片没有正确透明；这次没有把这一点含糊处理。正式流程改为“ImageGen 纯色母稿 → 确定性连通域抠图 → 边缘去色 → RGBA 导出 → 自动审计”，因此透明结果不再依赖生成工具是否正确输出 alpha。

## 3. Codex 接入合同

推荐直接使用：

```tsx
<img
  src="/icons/map-controls/locate-current-26.png"
  srcSet="/icons/map-controls/locate-current-26.png 1x, /icons/map-controls/locate-current-52.png 2x, /icons/map-controls/locate-current-78.png 3x"
  width={26}
  height={26}
  alt=""
  aria-hidden="true"
  draggable={false}
/>
```

按钮本身必须另外提供随状态变化的 `aria-label`。几何规则：

- 命中区至少 44 × 44px，视觉圆形保持 44px；
- 容器使用 `display: grid; place-items: center; padding: 0`；
- 图片固定按 26 × 26 CSS px 渲染并设置 `display: block`；
- 外层暖白圆形表面、边框、阴影、焦点环和状态反馈由 CSS 提供，PNG 不包含按钮底；
- 不使用字体字符、emoji、行高或 `translate` 假装居中；
- 默认、定位中、已按距离排序、不可用状态由按钮容器和可访问文案表达，不重复制作四张图；
- 该图标只表示“获取当前位置 / 重新居中并按距离排序”，不得替换蓝色用户位置 Marker，也不得复用为地点 Pin。

## 4. 最终 ImageGen 提示词

生成方式：Codex 内置 `imagegen`。参考图为现有 `public/nav-icons/map.png`、`public/nav-icons/discover.png` 和第一版方向图。正式提示词完整记录如下：

```text
Use case: stylized-concept
Asset type: final production master for a mobile map “locate me” UI icon
Input images: Images 1 and 2 are Foodprint style references; Image 3 is the approved shape direction, not an edit target
Primary request: render one polished current-location target icon, matching Image 3’s circular locator shape, but with cleaner edges and stronger legibility at 24–28 px
Scene/backdrop: a perfectly uniform, flat, pure chroma-magenta background color #FF00FF covering the entire square canvas
Subject: compact circular locator target with four short cardinal ticks, warm cream inner disc, one coral-orange center dot, and deep Foodprint teal outline
Style/medium: soft clay / lightly hand-painted 3D UI icon, restrained depth, crisp functional silhouette, consistent with the Foodprint navigation icons
Composition/framing: exactly centered, front-facing, symmetrical, equal padding on every side; icon occupies about 62% of the square canvas
Lighting/mood: soft frontal studio light contained entirely inside the icon; no cast shadow on the background
Color palette: deep teal #0D5D58 and #167D76, warm cream #FFF8E8, coral #ED7655
Constraints: background must remain one absolutely flat #FF00FF color with no texture, gradient, checkerboard, vignette, noise, reflection, or shadow; icon only; no enclosing white button; no text; no letters; no watermark; no blue; no map-pin shape; no compass arrow; no extra decoration; clean separable silhouette for chroma-key extraction
```

## 5. 复现与验收

在项目根目录执行：

```bash
node docs/design/v2-4-1-location-control/process-location-control.mjs
```

脚本会重新生成五张透明 PNG 和 QA 检查板，并在任一文件不是 RGBA、尺寸错误、四角不透明或残留可见紫色时直接失败。编码接入后还必须完成：

- 24 / 26 / 28px 下识别性检查；
- 1× / 2× / 3× 真机屏幕检查；
- 图形、暖白按钮与 44px 命中区三重居中，中心误差不超过 1 CSS px；
- 与蓝色用户位置 Marker、Foodprint 地点 Pin 和“去试试”导航图标的区分检查；
- PNG 请求无 404；模拟 PNG 加载失败时 SVG 回退仍可用。
