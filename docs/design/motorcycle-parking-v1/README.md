# 停车地图｜摩托车按钮设计记录

> 日期：2026-09-07  
> 生成方式：Codex 内置 ImageGen。  
> 状态：用户已选择 A 美式巡航方向；V3 浅蜜黄色圆角方形成品按钮图已完成。当前交付为按钮资产，页面接入属于停车地图功能开发。

当前成品：[A 款 V3 · 浅蜜黄色圆角按钮](revisions/a-cruiser-v3-honey-button.png)，已另存到[项目按钮资产](../../../public/icons/map-controls/motorcycle-parking-button-honey-v3.png)。本次使用 Codex 内置 ImageGen 编辑，详见[V3 修订说明及完整提示词](a-v3-honey-button-prompt.md)。页面另提供 1×／2×／3× 的 44px 显示衍生图，运行时不重复叠加底板。

停车地图的 375px 静态布局预览见[这里](parking-v1-layout-preview.png)；它只用于审查排版，不替代真实账号、地图 Key 或真机验收。

按用户最新要求，V3 采用完整蜜黄底板，替代之前的独立透明摩托车方案。整枚按钮以约 44px 显示，容器不再重复添加按钮底板；无文字、无棋盘格。

历史修订：[A 款 V2 · 深石墨灰／亮银镀铬](revisions/a-cruiser-v2-chrome.png)，详见[V2 说明及提示词](a-v2-chrome-prompt.md)。下表保留最初两款选款稿。

| 候选 | 造型方向 | 当前选款图 |
| --- | --- | --- |
| A | 深色美式巡航：低座、长车身、水滴油箱、V 型发动机 | [a-cruiser-candidate.png](candidates/a-cruiser-candidate.png) |
| B | 深色复古街车：紧凑车身、圆灯、棕色长座垫 | [b-retro-candidate.png](candidates/b-retro-candidate.png) |

初始候选要求（V3 已更新按钮背景方案）：侧面朝右、深色车身、轻软陶质感、清晰轮廓、无品牌标识或文字；当时为 44px 暖白按钮内的约 28px 独立图形。

初始候选检查：两款均为 1254×1254 RGB PNG，棋盘格已画入像素；ImageGen 的一次去背景修正仍未输出 alpha。这些历史文件仅供回溯，不用于当前接入。原始文件保存在 `candidates/a-cruiser-source.png`、`candidates/b-retro-source.png`，二次生成保存在表中的候选路径。V3 已通过完整蜜黄按钮背景取代棋盘格，后续应用接入按 V3 完整按钮规格处理。

下列生成提示词按实际调用原文保存。

## A · 深色巡航

```text
Use case: stylized-concept.
Asset type: high quality mobile map button motorcycle icon for the Foodprint app; a design candidate that must also work at 28 CSS pixels.
Primary request: create exactly ONE isolated motorcycle icon, full vehicle in a strict orthographic SIDE PROFILE facing RIGHT. Both wheels fully visible and aligned on one horizontal baseline. NO perspective view, NO rider.
Style/medium: refined soft-clay 3D illustration with a lightly handcrafted ceramic finish, restrained soft highlights, rounded but precise edges, a strong simple silhouette and large readable forms. Sophisticated adult motorcycle character, not a children's toy. Match a warm cream and deep teal food discovery app with gently sculpted navigation icons.
Composition: square 1024 x 1024 canvas, motorcycle optically centered, fully uncropped, occupy about 88% of canvas width and 56% of canvas height, equal left/right margins. Wheels must be solid bold readable forms. Simplify engine, wheel hubs and structural details to remain recognizable at 28px; no dense spoke mesh, no thin decorative filigree.
Background: genuinely TRANSPARENT RGBA alpha outside the motorcycle, including gaps between parts; preserve clean antialiased edges. Do NOT draw a checkerboard, a white rectangle, a circle, a badge, a button, a map, or a scene. No floor, ground, cast shadow, contact shadow, smoke, scenery, road or accessories.
Lighting: soft frontal studio lighting with subtle highlights on the object only.
Color palette: predominantly near-black charcoal and very dark desaturated teal (#183332, #243332), warm dark-gray tires, subtle brushed warm silver engine accents, restrained cream headlight, a tiny muted orange indicator if useful. No bright green or blue body. No text, letters, numbers, watermark, or manufacturer logo. Deliver the motorcycle image only.
Design A — dark classic American cruiser, Harley-Davidson-inspired proportions without any logo: low and long muscular silhouette, low scooped single saddle, large teardrop petrol tank, chunky rear tire, slightly larger front wheel, modestly raked front fork, broad gently raised handlebars, compact sculpted V-twin engine, two strong low exhaust pipes, close hugging front and rear fenders. Motorcycle is grounded, calm, substantial, an elegant retro cruiser rather than an extreme chopper. Tank and fenders are very dark ink-teal almost black; tiny warm gray/chrome engine highlights, deep dark-brown saddle. Favor bold iconic shapes over mechanical realism.
```

## B · 深色复古

```text
Use case: stylized-concept.
Asset type: high quality mobile map button motorcycle icon for the Foodprint app; a design candidate that must also work at 28 CSS pixels.
Primary request: create exactly ONE isolated motorcycle icon, full vehicle in a strict orthographic SIDE PROFILE facing RIGHT. Both wheels fully visible and aligned on one horizontal baseline. NO perspective view, NO rider.
Style/medium: refined soft-clay 3D illustration with a lightly handcrafted ceramic finish, restrained soft highlights, rounded but precise edges, a strong simple silhouette and large readable forms. Sophisticated adult motorcycle character, not a children's toy. Match a warm cream and deep teal food discovery app with gently sculpted navigation icons.
Composition: square 1024 x 1024 canvas, motorcycle optically centered, fully uncropped, occupy about 88% of canvas width and 56% of canvas height, equal left/right margins. Wheels must be solid bold readable forms. Simplify engine, wheel hubs and structural details to remain recognizable at 28px; no dense spoke mesh, no thin decorative filigree.
Background: genuinely TRANSPARENT RGBA alpha outside the motorcycle, including gaps between parts; preserve clean antialiased edges. Do NOT draw a checkerboard, a white rectangle, a circle, a badge, a button, a map, or a scene. No floor, ground, cast shadow, contact shadow, smoke, scenery, road or accessories.
Lighting: soft frontal studio lighting with subtle highlights on the object only.
Color palette: predominantly near-black charcoal and very dark desaturated teal (#183332, #243332), warm dark-gray tires, subtle brushed warm silver engine accents, restrained cream headlight, a tiny muted orange indicator if useful. No bright green or blue body. No text, letters, numbers, watermark, or manufacturer logo. Deliver the motorcycle image only.
Design B — dark vintage standard roadster / retro motorcycle: shorter and more compact wheelbase, upright fork and round cream headlamp, rounded near-black petrol tank with a subtle deep-teal undertone, simple level one-piece dark cognac-brown saddle, two similar-sized stout tires, slightly taller clean negative space beneath the tank, compact warm-silver parallel-twin engine block and one simple low exhaust pipe, short neat curved fenders, naturally upright gently swept handlebar. More nimble and clean-lined than a cruiser, timeless classic heritage styling. No racing fairing, no cafe-racer seat hump, no aggressive sports-bike panels. Favor a strong clear side-profile silhouette and larger unified shapes that remain legible at 28px.
```
