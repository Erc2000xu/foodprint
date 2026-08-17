# Foodprint V2.3｜正式地图 Pin 资产规范

> 资产编号：IC-08  
> 版本：v2.3.0  
> 确认日期：2026-08-13  
> 状态：B「餐盘定位圆章」已确认、已制作；待接入真实动态地图并完成多底图 / 真机验收  
> 方向选择记录：[五套方向与选择结论](../README.md)

## 1. 最终视觉决定

V2.3 使用 B「餐盘定位圆章」作为唯一正式 Pin 语言：暖米白餐盘圆章、深青绿轮廓、极短定位尖角，中心用 1 / 2 / 3 层小碗表达 Foodprint 推荐强度。ImageGen 方向图只保留为选择记录，不得直接裁切、缩放或上线。

正式资产使用确定性 SVG 重绘，保证小尺寸清晰、颜色可控、锚点一致，也方便未来在不改地图数据和交互代码的前提下替换视觉。

## 2. 推荐等级映射

| 数据值 | 产品文案 | Pin 内部符号 | 含义 |
| ---: | --- | --- | --- |
| `bowlStrength = 1` | 值得去 | 一层小碗 | 在附近，会放心推荐 |
| `bowlStrength = 2` | 想再去 | 两层小碗 | 吃过还惦记，愿意再来 |
| `bowlStrength = 3` | 会专门去 | 三层小碗 | 值得特意安排一趟 |

- Pin 只展示小碗图形，不在地图上塞完整地点名、评分或朋友人数。
- 地点名称、推荐等级文案、朋友人数和推荐菜进入选中地点卡片或当前范围列表。
- `bowlStrength` 缺失或非法不是新的视觉等级；数据层必须按 V2.3 规格治理。若兼容期必须显示，统一经既有 `toBowlLevel` 规则处理并记录异常，不能临时画“空碗 Pin”。

## 3. 正式资产清单

所有运行资产都位于 `public/icons/map-pins/`，页面不得使用概念稿路径。

| 用途 | 默认 | 选中 / 激活 |
| --- | --- | --- |
| 一级推荐 | `pin-level-1-default.svg` | `pin-level-1-selected.svg` |
| 二级推荐 | `pin-level-2-default.svg` | `pin-level-2-selected.svg` |
| 三级推荐 | `pin-level-3-default.svg` | `pin-level-3-selected.svg` |
| 点位聚合 | `cluster-default.svg` | `cluster-active.svg` |
| 用户当前位置 | `user-location.svg` | 不与推荐 Pin 共用选中态 |

配套工程文件：

- `public/icons/map-pins/manifest.json`：版本、颜色、尺寸、锚点和路径的机器可读清单；
- `src/lib/amap/map-pin-assets.ts`：TypeScript 运行注册表与聚合数字规则；
- `src/lib/amap/map-pin-elements.ts`：供高德 Marker / MarkerCluster / 用户位置 Marker 使用的安全 DOM 工厂；
- `src/app/globals.css`：命中区、选中、按下、焦点与减少动态效果；
- `tests/v2-3-map-pin-assets.test.ts`：资产完整性、尺寸、锚点、数字与无障碍回归。

## 4. 尺寸与锚点

| 状态 | 图形渲染尺寸 | 外层命中区 | 锚点 |
| --- | ---: | ---: | --- |
| 默认单点 | 40 × 45 CSS px | 48 × 54 CSS px | 图形底部中心 |
| 选中单点 | 48 × 54 CSS px | 48 × 54 CSS px | 图形底部中心 |
| 默认聚合 | 44 × 50 CSS px | 48 × 54 CSS px | 图形底部中心 |
| 激活聚合 | 48 × 54 CSS px | 48 × 54 CSS px | 图形底部中心 |
| 用户位置 | 32 × 32 CSS px | 44 × 44 CSS px 以上 | 圆心 |

- 单点 / 聚合 SVG 统一为 `viewBox="0 0 64 72"`。
- 定位尖角的精确源坐标为 `(32, 72)`，归一化锚点为 `(0.5, 1)`。
- 高德 Marker 优先使用 `anchor: "bottom-center"`；如果适配器只能使用 `offset`，调用 `mapPinPixelOffset(width, height)`，不得手写各等级偏移。
- 视觉图形变大时锚点不能跳动；选中地点仍必须指向同一经纬度。
- 24 / 28 / 32px 只用于小尺寸退化检查，不是 V2.3 正式地图默认尺寸。

## 5. 状态规则

### 默认与选中

- 默认：深青外轮廓 + 青绿色内圈 + 暖米白底。
- 选中：从 40 × 45 放大到 48 × 54，同时增加橙红外圈和橙红尖角；不得只靠颜色表达选择。
- 选中 Marker 的 `zIndex` 必须高于默认 Marker 和未激活聚合，避免被覆盖。
- 视觉切换目标为用户点击后 100ms 内出现；只更新 content / class / zIndex，不重建 `AMap.Map`。

### 按下、焦点与减少动态效果

- 按下态用轻微 `scale(.94)`，仅提供即时触觉感，不改变经纬度锚点。
- 键盘焦点使用 3px 橙红 outline，不能仅依赖浏览器默认细线。
- `prefers-reduced-motion: reduce` 时关闭过渡与按下缩放。
- 每个单点必须有可读的 `aria-label`，建议格式：`地点名，推荐等级，N 位朋友吃过`；选中态追加“已选中”。
- 地图之外必须保留同数据的可键盘操作列表；地图画布不能成为获取地点信息的唯一途径。

### 聚合

- 聚合数字是其中 Foodprint 推荐地点数，不是高德公开 POI 数，也不是推荐等级。
- 显示规则：`1–99` 显示整数，`>99` 显示 `100+`；无效输入防御性显示 `1`。
- 数字中心必须对齐圆形餐盘的几何圆心 `(32, 30)`，不能按包含下方定位尖角的整个 `64 × 72` 画布居中。
- 点击可继续放大的聚合时进入激活态并放大；达到最大缩放或完全同坐标时打开聚合成员 / 当前范围列表，不持续无意义放大。
- 聚合文字由 DOM 动态覆盖在无文字 SVG 上，不为 2、9、12、99、100+ 分别制作位图。

### 用户位置

- 使用独立蓝色圆点与半透明波纹，不使用小碗、暖米白餐盘或橙色选中圈。
- 用户位置不是按钮时应作为装饰性覆盖物；定位操作本身由独立的“定位”按钮提供可访问名称。

## 6. 颜色

| 语义 | 色值 | 用途 |
| --- | --- | --- |
| Primary | `#167D76` | 默认内圈 |
| Primary Strong | `#0D5D58` | 外轮廓、小碗、默认尖角、数字 |
| Surface Warm | `#FFF8E8` | Pin 餐盘底色 |
| Accent | `#ED7655` | 选中外圈、选中尖角、焦点 |
| Location Blue | `#2563EB` | 用户当前位置 |

颜色来自现有 Foodprint 品牌令牌。地图样式切换不能擅自改 Pin 语义色；如果底图导致对比度不足，优先加强阴影 / 描边或更换已批准底图，不临时发明新的等级颜色。

## 7. 高德地图接入合同

单点接入示意：

```ts
const content = createMapPinElement({
  level: toMapPinRecommendationLevel(place.bowlStrength),
  selected: place.id === selectedPlaceId,
  accessibleLabel: `${place.name}，${levelLabel}，${place.friendCount} 位朋友吃过`,
});

const marker = new AMap.Marker({
  position: [place.longitude, place.latitude],
  content,
  anchor: "bottom-center",
  zIndex: place.id === selectedPlaceId ? 220 : 120,
});
```

MarkerCluster 接入时：

1. `renderMarker` 使用 `createMapPinElement`；`renderClusterMarker` 使用 `createMapClusterElement`。
2. 业务 ID 必须通过已经 spike 验证的自定义字段、局部整数索引或 `extData` 解析；不得用地点名称或 `lng,lat` 字符串作为唯一键。
3. 使用 DOM API 创建内容，不把地点名称拼进 `innerHTML`，防止私有内容转义错误或注入。
4. 筛选变化调用 cluster 的 `setData`；选择变化只更新对应 Marker 内容、状态和 `zIndex`，不得销毁地图实例。
5. 资产全部从同源 `/icons/map-pins/` 读取，不使用临时外链、base64 大图或 ImageGen 概念图。

## 8. QA 与发布门禁

已完成的资产级检查：

- 1 / 2 / 3 级默认与选中 SVG 全部存在；
- 40 × 45 默认尺寸可区分三种叠碗；
- 选中态同时通过尺寸与轮廓变化表达；
- 24 / 28 / 32 / 40 / 48px 退化板已生成；
- 聚合 default / active、用户位置、焦点、按下、减少动态效果均已有定义；
- 资产路径、锚点、数字格式和 DOM 语义已进入自动化测试。

接入真实地图后仍必须完成：

- 高德远山黛、月光银、草色青、马卡龙四套可用官方底图对比；V2.3 默认仍优先远山黛；
- 320 / 390 / 430px 宽度，以及街区 / 城区 / 全城缩放级别；
- 道路、文字、绿地、水面、密集标签和 1× / 2× / 3× 屏幕；
- 聚合 2、9、12、99、100+；
- 选中 Pin、聚合和底部抽屉四档高度的遮挡 / zIndex；
- iOS Safari、Android Chrome、桌面浏览器和 PWA standalone 真机验收；
- 地图 / 列表地点集合一致与地图失败直接列表的完整 V2.3 门禁。

QA 图：

- `qa/map-pin-size-and-map-preview.png`
- `qa/map-pin-small-size-grid.png`
- `qa/map-pin-complete-state-board.png`
- `qa/render-map-pin-qa.mjs`（可重复生成，依赖项目内 Sharp）

## 9. 变更管理

- `assetVersion` 当前为 `v2.3.0`。修改外形、锚点、尺寸或语义映射时必须同步提升版本并更新 manifest、运行注册表、测试、本文和 `VISUAL_ASSET_REGISTRY.md`。
- 页面只能通过注册表 / DOM 工厂调用正式路径，不在组件中散落 SVG 文件名。
- 未经新的产品决定，不得把 B 方案替换为 A / C / D / E，也不得把概念图细节重新拼入正式 SVG。
- V2.3 真地图接入并完成多底图 / 真机验证后，将 IC-08 从“已制作，待接入 / 验收”更新为“已接入 / 已验收”。
