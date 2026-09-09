# A 款 V3｜浅蜜黄色圆角方形按钮

> 2026-09-07 · Codex 内置 ImageGen 编辑  
> 用户要求：将 A 款灰色镀铬巡航摩托车制成完整成品按钮，使用圆角／倒角方形、与首页协调的蜜黄色背景。

## 交付

- [完整按钮图](revisions/a-cruiser-v3-honey-button.png)
- [项目按钮资产](../../../public/icons/map-controls/motorcycle-parking-button-honey-v3.png)
- 1254×1254、RGB PNG；完整浅蜜黄底板与暖米白外缘均为实色，无棋盘格。
- 大圆角、柔和倒角、轻微阴影；中心为简化的深石墨灰巡航摩托车、棕色座垫与亮银镀铬。
- 已视觉检查造型、背景、镀铬及完整边缘。旧版独立摩托车与提示词保留，当前以本版完整按钮图为准。
- 首页接入时按整枚按钮约 44px 显示，单独设置无障碍名称；不再添加第二层按钮底板。页面功能和运行尺寸资源的接入验证仍属于停车地图开发。

## 输入图片

1. [A 款 V2：车形、车漆及镀铬参考](revisions/a-cruiser-v2-chrome.png)
2. 现有 `public/nav-icons/map.png`：软陶图标风格参考。
3. [用户首页截图](home-reference.png)：按钮形状、背景和配色参考。

## 实际编辑提示词

```text
Use case: style-transfer.
Asset type: FINISHED self-contained rounded-square mobile UI BUTTON ICON for the Foodprint app, not a standalone vehicle cutout.
Input image roles: Image 1 is the exact selected motorcycle design and color/material reference. Image 2 is an existing Foodprint navigation icon STYLE reference. Image 3 is the Foodprint home screen for button color, friendliness and soft visual treatment; do not reproduce that screen.

Primary request: transform the selected graphite-and-chrome American cruiser into a polished finished icon button with a warm PALE HONEY YELLOW rounded-square backing, matching the cream-colored rounded buttons in the Foodprint home screen. The output must look ready to use as one app button, not like a full-size product illustration.

Button:
- ONE centered front-facing rounded square / soft squircle with generously rounded corners, approximately 22% corner radius.
- Pale honey-cream ceramic surface (#F4E3B8 / #F6E8C6), restrained slightly darker honey edge (#DDC79B), a fine bevel and soft upper-left edge highlight, very subtle short shadow. Warm, light, soft, clean and understated; no saturated yellow, no metallic gold frame.
- The rounded square occupies 94% of the entire square canvas, leaving only a very slim evenly balanced warm ivory margin (#FFFCF5).
- OPAQUE honey-colored fill behind the entire motorcycle and also through every gap between its spokes/frame. The slim outside margin is solid warm ivory. Absolutely NO transparency and NO checkerboard anywhere, including through the wheels and frame.
- No large background scene or presentation board, no second nested square, no extra border rings, no label, letters, P symbol, badges, watermark or text.

Motorcycle:
- Center the right-facing SIDE-PROFILE low-slung American cruiser from Image 1 on the button, vehicle width about 80% of the button and optically centered vertically with balanced breathing room.
- Keep its recognizable low brown solo saddle, teardrop dark graphite-gray tank, chunky wheels, V-twin engine, two bright chrome low exhaust pipes, chrome wheel rims and headlamp trim. Body paint remains the lighter dark graphite of Image 1.
- Convert the vehicle into a compact stylized APP ICON: simplify tiny mechanical details, tread marks, screws and surface texture into fewer larger clear shapes. Give it gently rounded soft-clay geometry matching Image 2. Stronger clear silhouette and bolder separations so it reads at 44–48px button size. It should feel like a crafted pictogram with rich materials, not a photograph or a motorcycle scale model.
- Keep the enhanced polished SILVER CHROME on engine accents, twin exhaust pipes and rim rings, but simplify reflections into attractive clear broad light/dark bands. Black rubber tires, small warm ivory headlight, tiny muted orange indicator.
- No rider, brand logo, extra items, scenery, roadway or floor. No perspective rotation of the vehicle or button.
Composition: square canvas, complete finished honey rounded-square button, clean harmonious edges, intentional icon proportions. Preserve the selected A cruiser identity while making it a real coherent button asset.
```

