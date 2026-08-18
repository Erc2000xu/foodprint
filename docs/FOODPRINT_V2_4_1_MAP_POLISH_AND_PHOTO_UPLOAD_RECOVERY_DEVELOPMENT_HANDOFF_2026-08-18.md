# Foodprint V2.4.1｜地图控件可用性与手机照片上传可靠性开发交接

> 日期：2026-08-18<br>
> 状态：**需求与技术审计完成，待项目负责人批准后编码**<br>
> 基线：V2.4 仓库实现 `5a19fa4`；本轮只新增开发文档、ImageGen 定位图标正式透明 PNG 套件与 SVG 回退，尚未修改应用功能代码<br>
> 上一版本：[V2.4 地图优先体验开发交接](./FOODPRINT_V2_4_MAP_FIRST_EXPERIENCE_DEVELOPMENT_HANDOFF_2026-08-16.md)<br>
> 定位图标：[UI-02 定位按钮正式资产包](./design/v2-4-1-location-control/README.md)
> 反馈证据：2026-08-18 真机验收截图与使用反馈；原截图位于本机临时目录，包含地图与位置上下文，不进入仓库

## 0. 本交接的用途

V2.4 的地图优先方向整体成立，但真机验收又暴露出四个会直接影响使用的问题：

1. 地图右下角定位按钮仍使用字体字符 `⌖`，视觉粗糙且图形没有可靠的光学居中；
2. 定位成功提示压在当前范围面板与底部导航之间，遮挡正文；
3. 地图快捷筛选展开后被裁成很窄的一条，选项无法正常阅读和操作；
4. “记一顿”选择常规 3–6MB 手机照片时会失败，用户只能保存没有照片的新地点。

本文将上述反馈转成一个独立 V2.4.1 修复版本，给后续 Codex 编码提供明确的根因、实现边界、文件工作面、状态合同、验收标准和发布顺序。本文不把截图中的临时视觉、地图内容或地理位置当成新的产品数据，也不要求重新设计整个发现页。

## 1. 版本结论与优先级

V2.4.1 是一次“小版本可靠性修复”，不是 V3 视觉重做。实施顺序固定为：

| 阶段 | 优先级 | 工作项 | 关闭条件 |
| --- | --- | --- | --- |
| Stage 0 | **P0 发布阻断** | 复现并修复手机照片处理、上传与补传链路 | 3–6MB 手机原图可稳定保存；已选照片失败时不能静默完成无图记录 |
| Stage 1 | P1 | 修复地图筛选浮层被横向滚动容器裁切 | 三类菜单可完整显示、滚动、关闭且不移动地图 |
| Stage 2 | P1 | 接入新的定位透明 PNG srcset（SVG 回退）、建立按钮状态与几何居中合同 | 图标、按钮和命中区在目标设备真实居中，状态可理解 |
| Stage 3 | P1 | 将定位反馈改为面板安全区上方的瞬时状态提示 | 不遮挡面板、导航、备案或地图归属信息 |
| Stage 4 | 发布门禁 | 自动化、真机、生产和既有无图记录补传验收 | 全部矩阵通过并归档证据 |

照片问题优先于三项地图视觉问题。不得为了尽快发布地图样式而延后照片修复，也不得只把错误文案换掉就宣称完成。

## 2. 反馈台账

| 编号 | 反馈 | 定性 | 代码审计结论 | V2.4.1 目标 |
| --- | --- | --- | --- | --- |
| V241-01 | 常规手机照片提示过大或处理失败，最终地点没有照片 | **P0 数据完整性 / 核心流程** | 原图大小不是当前直接判断条件；客户端双尺寸压缩、编码能力、错误归类与上传后恢复均存在缺口 | 常见 3–6MB 原图稳定进入；失败可分类、可重试、可给已有记录补传 |
| V241-02 | 地图筛选菜单展开成一条窄缝 | P1 可用性 | 菜单是横向滚动筛选行的后代，`overflow-x: auto` 同时形成纵向裁切容器 | 菜单移出滚动条内部，作为地图上方独立浮层完整展示 |
| V241-03 | 获取当前位置按钮丑、图形不居中 | P1 视觉与操作 | 按钮内容是字体字符 `⌖`，外形、字面框和基线依赖系统字体 | 使用 UI-02 正式透明 PNG srcset，SVG 作为回退；44px 命中区内按 26px 光学居中 |
| V241-04 | “已按离你最近排序”压住下方文字 | P1 状态反馈 | 提示固定 `bottom: 92px`，没有使用实际面板高度和底部导航安全区 | 成功改为瞬时 toast，并以面板实测高度计算位置；按钮保留持续状态 |
| V241-05 | 上述问题缺少真实浏览器防回归 | P1 工程质量 | 当前地图布局测试偏字符串合同；照片选择器没有真实压缩测试 | 增加纯函数、组件、真实浏览器、真机和生产分层门禁 |

## 3. 已确认的技术根因

### 3.1 筛选菜单：不是高德地图压住，而是自身滚动容器裁切

当前 `MapBrowser` 把每个 `map-filter-menu` 渲染在对应的 `map-filter-control` 内，而 `map-filter-control` 又位于：

```css
.map-filter-row {
  overflow-x: auto;
}
```

菜单自身是向下展开的绝对定位元素。横向滚动容器会建立裁切 / 滚动区域，纵向溢出的菜单因此只能在筛选行高度内显示，看起来就像被地图压成窄条。提高菜单 `z-index` 不能越过祖先的 overflow 裁切，因此单纯把 `z-index: 15` 改得更大无效。

**结论：** 根因已经由 DOM 结构和 CSS 合同确认，与高德地图 Provider、地图瓦片或 Marker 层无关。

### 3.2 定位提示：固定偏移与动态面板冲突

当前 `.map-location-note` 使用固定位置：

```css
bottom: 92px;
```

而下方 `ViewportPlaceSheet` 有三种高度：

- `summary`：76px；
- `place_preview`：190px；
- `viewport_list`：`clamp(320px, 46dvh, 420px)`；
- 面板本身还位于底部导航及 `safe-area-inset-bottom` 上方。

提示没有读取 `--map-sheet-height`，也没有读取底部导航的实际占位，所以在摘要态会进入面板正文，在其他状态还可能被面板完全盖住。截图中它恰好落在“当前范围”摘要与底部导航交界处，是当前公式的必然结果，不是偶发像素误差。

### 3.3 定位按钮：字体字符不是正式功能资产

当前按钮内容为：

```tsx
<button className="map-locate-button">⌖</button>
```

即使容器使用 flex 居中，字符的字面框、字体基线、字重和不同系统的字体回退仍会让图形视觉偏移。该字符也与 Foodprint 现有软陶色彩和圆润图标语言不一致。

V2.4.1 已完成第二版 ImageGen 正式母稿，并通过可重复脚本转换为真实透明 RGBA 程序资产：

```text
public/icons/map-controls/locate-current-26.png
public/icons/map-controls/locate-current-52.png
public/icons/map-controls/locate-current-78.png
```

页面按 26 × 26 CSS px 使用上述 1×/2×/3× srcset；`locate-current-master.png` 是 1024px RGBA 生产母稿，`locate-current-ui.png` 是 256px 通用程序版。`locate-current.svg` 保留为确定性回退，不再把第一版带有烘焙棋盘格的 RGB 方向图用于运行时。

第二版生成先使用纯洋红抠图底，再由 `process-location-control.mjs` 完成连通域抠图、边缘去色、裁边、居中、多尺寸导出和自动审计。五张正式 PNG 均已确认是四通道 RGBA，四角 alpha 为 0，可见紫色残留为 0。完整提示词、校验值、失败方向图与 QA 检查板见 [UI-02 定位按钮正式资产包](./design/v2-4-1-location-control/README.md)。

### 3.4 照片问题：3–6MB 原图并不是当前直接限制

当前照片流程在浏览器中先把每张原图生成两份 WebP：

| 资源 | 最长边 | 单张硬上限 |
| --- | ---: | ---: |
| 展示图 | 1280px | 600KiB |
| 缩略图 | 640px | 120KiB |

因此用户选择的 3–6MB JPEG / HEIC 原图不会直接上传，也不会因为源文件处于 3–6MB 就触碰 Supabase 的 1.5MiB 单对象限制。当前相关网络边界为：

- Next Server Action body：16MB；
- Nginx `client_max_body_size`：16m；
- 私有 `place-photos` bucket 单对象：1.5MiB；
- 九组 display + thumbnail 的理论上限约 6.33MiB，不含 multipart 少量开销。

只要浏览器正常完成现有目标压缩，一到数张常规手机照片本应低于这些网络限制。真正的代码风险在压缩与恢复流程：

1. `renderWebp` 只尝试五次，同时降低质量和尺寸；任一 display 或 thumbnail 未达到预算就抛出“图片压缩后仍超过限制”。
2. `choosePhotos` 使用 `Promise.all` 同时处理全部原图；一张失败会让整批失败，已经成功处理的照片也不会保留。
3. `loadImage` 在存在 `createImageBitmap` 时直接使用它；若该 API 对当前 HEIC、方向或内存场景解码失败，不会回退到浏览器 `<img>` 解码路径。
4. `canvas.toBlob(..., "image/webp")` 的结果没有检查真实 `blob.type`，也没有检查 RIFF / WEBP magic bytes。浏览器若不支持或退化到其他格式，客户端可能把非 WebP 字节重新标成 `image/webp`，随后在字节预算或服务端 magic 校验处失败。
5. 所有压缩失败最终被折叠成“照片压缩后仍超过单张限制”，用户无法区分格式不支持、解码失败、编码器缺失、内存不足和真正超限。
6. 当前没有针对 `PhotoPicker`、真实图片编码、WebP MIME 退化或 iOS PWA 的自动化测试；现有测试主要验证 Server Action 配置和 migration 字符串。
7. 服务端先执行 `save_candidate_promotion_mark` / `record_place_visit`，再上传照片。canonical 上传或数据库登记失败只返回 warning，而页面仍进入“这一顿已记下”的成功态。因此业务记录可能已经创建、照片却没有保存，正好解释用户看到的新地点无图。
8. UI 与服务端写着“最多 9 张”，但数据库对 `visit_record_id` 实际仍限制 6 张；第 7–9 张可能在 Storage / DB 阶段失败。

### 3.5 已确认与待运行时确认必须分开

已由代码确认：上述八项结构性风险真实存在，必须修复。

尚不能仅凭截图断言本次真机的唯一触发点究竟是：

- `createImageBitmap` 解码失败；
- WebP 编码退化；
- 120KiB thumbnail 预算未达到；
- iOS 内存压力；
- 上传到 Storage 超时；
- 照片登记权限 / 数据库错误。

V2.4.1 Stage 0 必须先把错误分成匿名、可观察的阶段码再复现。不得把高概率原因写成已经由生产日志证实，也不得继续用一个“图片太大”覆盖全部原因。

## 4. V241-01｜手机照片处理、上传与补传

### 4.1 产品决定

1. 常规手机原图 3–6MB 是必须支持的主路径，不属于异常大图。
2. 照片仍在上传前去除 EXIF / GPS 等拍摄元数据；不得为修复上传而把原图或位置数据改成公开对象。
3. 用户没有选择照片时，照片继续是可选项；用户已经选择照片时，系统不能因为内部处理失败而静默当作“用户决定不上传”。
4. canonical 展示图是“照片已保存”的最低完成条件；thumbnail 失败可以进入后台 / 后续补齐，但 canonical 失败必须进入可重试状态。
5. 不回滚已经成功创建的地点或到访记录。跨数据库和 Storage 强行伪装原子事务风险更大，正确方案是显示“记录已保存、照片待补传”并提供幂等补传。
6. 已经由 V2.4 产生的本人无图到访也必须能在地点详情中补传，不能只修未来的新记录。
7. V2.4.1 以当前 UI 的“每条记录最多 9 张”为正式合同；新增向前 migration 把 `visit_record_id` 的 6 张限制统一为 9 张。若未来希望首次 9 张、复访 6 张，另立数据字段和产品规则，不在触发器中猜测“第几次到访”。

### 4.2 客户端预处理合同

将照片处理从 `PhotoPicker` 组件内部抽成可测试模块，例如：

```text
src/lib/photos/prepare-photo.ts
```

建议接口：

```ts
type PhotoPrepareFailureCode =
  | "source_too_large"
  | "source_too_many_pixels"
  | "decode_unsupported"
  | "decode_failed"
  | "webp_encoder_unavailable"
  | "output_budget_unmet";

type PreparedPhoto = {
  id: string;
  displayFile: File;
  thumbnailFile: File;
  width: number;
  height: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
};
```

处理要求：

- 接受 JPEG、PNG、WebP，以及当前设备能安全解码的 HEIC / HEIF；文件 MIME 为空时可以结合扩展名尝试解码，但最终只信任解码结果。
- 源文件单张上限设为 20MiB，解码像素上限设为 60MP；这两个值用于防止内存失控，不能把 3–6MB 当作超限。
- 先尝试 `createImageBitmap`；失败后必须回退到 `<img>` / `image.decode()`，而不是立即给出错误。
- 同一时间只解码 / 压缩一张原图，禁止 `Promise.all(incoming.map(compressPhoto))` 同时展开多张 12–48MP 图片。
- 每张照片独立返回成功或失败；一张失败不能抹掉同批其他成功预览。
- display 与 thumbnail 分开做自适应质量和尺寸循环；优先保留合理清晰度，必要时逐步缩小，不能只固定五次后笼统失败。
- native canvas 输出必须验证 `blob.type === "image/webp"` 并验证 magic bytes。若浏览器没有真实 WebP 编码能力，按需懒加载经过体积与安全评审的 Web Worker / WASM WebP 编码器；该代码不得进入发现页首屏包。
- display 继续满足最长边 ≤1280px、≤600KiB；thumbnail 继续满足最长边 ≤640px、≤120KiB。可在循环中把高复杂度图片进一步降到 display 720px / thumbnail 320px 的下限，但不得输出不可辨识缩略图。
- Canvas 重绘继续作为移除 EXIF 的边界；输出不保留原文件名、GPS、设备型号或拍摄时间。
- 预览必须来自最终准备上传的 display blob，而不是源文件，以便用户看到真实裁切与质量。
- 组件卸载、删除照片或完成上传后立即释放 object URL、ImageBitmap、Canvas 和 Worker 资源。

### 4.3 选择与表单状态

`PhotoPicker` 需要向父表单报告的不再只是 `processing: boolean`，而是：

```ts
type PhotoPickerState = {
  processing: boolean;
  preparedCount: number;
  failedCount: number;
  hasBlockingFailure: boolean;
};
```

状态规则：

- 正在处理时禁用主提交按钮；
- 任一已选择照片处理失败时，主提交按钮保持禁用，直到用户重新选择、移除失败项，或明确点击“忽略失败照片并继续”；
- 不能用一次 error 文案覆盖整个预览区；每张失败项显示简短原因和“重试 / 移除”；
- 已成功准备的照片在其他照片失败时继续保留；
- 达到 9 张后隐藏 / 禁用继续选择入口，并显示准确计数；
- 选择相同照片重试不会无限追加重复预览；
- 表单 action 返回“照片待补传”时，已准备的 blob 保留在客户端内存并重新同步到 retry form，直到 canonical 全部确认或用户主动离开。

### 4.4 服务端校验与上传

服务端仍不信任客户端声明：

- 重新读取 WebP magic、宽高、MIME 和字节；
- display / thumbnail 数量与顺序必须一一对应；
- 每组路径仍由 session 中的 group / user 与服务器生成的 photo ID 推导；
- 浏览器不得提交 object key、group ID、user ID 或可用签名 URL；
- 最多 9 组；总 multipart 文件字节应在进入业务 RPC 前校验并留出边界开销，不把 Nginx 413 变成白页；
- 单组上传幂等；重试不能创建重复照片行或覆盖其他用户对象；
- canonical 上传成功、thumbnail 失败时登记 canonical，向维护队列 / 日志标记 thumbnail 待补齐；用户可进入正常成功态，因为真实照片已经可由 V2.4 canonical fallback 显示；
- canonical 上传或照片行登记失败时，不进入完整成功态。

### 4.5 可恢复的部分成功

扩展 action 结果，区分业务记录和照片状态：

```ts
type SaveWithPhotosResult =
  | { status: "complete"; success: string }
  | {
      status: "photo_repair_required";
      visitRecordId: string;
      groupPlaceId: string;
      failedPhotoIds: string[];
      message: string;
    }
  | { status: "failed"; error: string };
```

`visitRecordId` / `groupPlaceId` 只作为不透明标识；补传 action 必须再次验证：

- 当前用户仍是该到访作者；
- 当前用户仍是该小组有效成员；
- 到访和地点未删除 / 归档；
- 当前可见照片数加本次补传不超过 9；
- 每张照片仍通过完整文件校验。

部分成功界面文案与操作：

```text
这顿已经记下，但 1 张照片还没传好。
[重试上传]  [暂时不传]
```

- “重试上传”只执行照片补传，不重新执行 `save_candidate_promotion_mark` 或 `record_place_visit`；
- “暂时不传”是用户明确选择，随后可以在地点详情继续补传；
- 网络恢复后可重试；快速连续点击只能有一个上传任务；
- 页面刷新后若内存中的源 blob 已丢失，地点详情仍提供重新选择照片的入口。

### 4.6 给现有无图记录补传

在地点详情的本人到访记录上增加作者专属操作：

```text
为这次到访补传照片
```

显示条件：

- 当前登录者是到访作者；
- 到访未删除、未被管理员隐藏；
- 当前照片少于 9 张；
- 当前成员状态有效。

该入口复用同一 `PhotoPicker` 与补传 action，不创建新到访，不改变推荐等级、日期、感受、匿名状态或地点汇总。管理员不能替作者上传，其他小组成员不能补传。

### 4.7 错误文案

只有真实源文件超过 20MiB 时才允许出现“原图超过限制”。其余错误按阶段表达：

| 场景 | 文案 |
| --- | --- |
| 原图 >20MiB | 这张原图超过 20MB，请先在相册中缩小后再试。 |
| 设备无法解码 | 当前设备暂时无法读取这张照片，请换用 JPG、PNG 或 WebP。 |
| 编码 / 压缩失败 | 这张照片暂时没有处理好，请重试或换一张。 |
| canonical 网络上传失败 | 记录已经保存，照片还没传好。请重试上传。 |
| thumbnail 单独失败 | 照片已保存，小尺寸预览稍后补齐。 |
| 权限变化 | 这条到访现在不能补传照片，请刷新后再试。 |
| 达到数量上限 | 这次到访最多保留 9 张照片。 |

不得再把解码、编码、网络、权限和数据库问题统一写成“照片太大”。

### 4.8 匿名观测

增加以下阶段指标，值只允许使用枚举和分桶：

- `photo_prepare_started`；
- `photo_prepare_succeeded`；
- `photo_prepare_failed` + `reason`；
- `photo_canonical_upload_failed` + `reason`；
- `photo_thumbnail_deferred`；
- `photo_repair_shown`；
- `photo_repair_succeeded` / `photo_repair_failed`。

允许记录：照片数量、源文件大小分桶、像素分桶、格式大类、耗时分桶、浏览器大类、成功 / 失败阶段。

禁止记录：真实文件名、图片内容、EXIF、签名 URL、object key、用户 ID、精确地点、精确坐标、完整 User-Agent 或错误堆栈中的敏感值。

## 5. V241-02｜地图筛选浮层

### 5.1 结构决定

触发 chip 继续位于可横向滚动的 `.map-filter-row`，但展开菜单不得再作为 `.map-filter-control` 的后代。

推荐结构：

```tsx
<div className="map-filter-row">…只渲染 chip…</div>
<div className="map-filter-popover-layer">
  {openMenu ? renderMapFilterMenu(openMenu) : null}
</div>
```

`map-filter-popover-layer` 是 `.map-overlay-controls` 的直接后代，在地图之上绝对定位；它不进入页面文档流，不把地图向下推，也不受筛选行 overflow 裁切。

不推荐把浮层直接 portal 到 `document.body`，因为当前应用存在居中手机壳、PWA 安全区和虚拟键盘；优先在地图叠层自己的坐标系内定位。只有真实浏览器验证证明内部坐标系无法满足时才使用 portal，并必须补齐滚动、resize 和焦点恢复。

### 5.2 几何与层级

- 浮层顶部锚定在筛选行下方 8px；
- 读取对应 chip 与 overlay 的 `getBoundingClientRect()`，把期望 left 限制在左右 0–安全边距范围；
- 地区菜单宽度 230px；餐馆类型和推荐等级宽度 `min(330px, 100%)`；
- 320px 宽设备使用 overlay 可用全宽，不产生横向页面滚动；
- 最大高度 46dvh，菜单内部滚动；搜索框、chip、地图和底部面板不因打开菜单改变高度；
- 层级高于地图、Pin、数量与定位按钮，低于真正的全局阻断对话框；
- 菜单表面近不透明，地图道路与文字不能穿透选项；
- `dynamic-map-shell` 可以继续裁切整个地图舞台，但 overlay 自身必须 `overflow: visible`。

### 5.3 交互合同

- 一次只打开一个菜单；
- 再次点击同一 chip、点击外部、Escape 或浏览器返回关闭；
- 多选草稿在“完成”前不写 URL；外部关闭时回滚草稿；
- 地区单选后立即提交并关闭；
- 打开后焦点进入首个可操作项；关闭后返回原 chip；
- 菜单内部 pointer / wheel / touch 不穿透地图；
- 菜单内滚动到底不会平移地图；
- 打开菜单不改变地图 center、zoom、ViewportSet、SelectedPlace 或面板状态；
- 筛选完成后只更新共享 SearchState 与数据集合，不重新创建 AMap 实例。

### 5.4 验收

- 截图所示三类 chip 均能展开完整面板，不再出现窄缝；
- 320 / 375 / 390 / 430px 下左右不越界；
- 餐馆类型长列表内部可滚动并始终看得到“清除 / 完成”；
- 地区、餐馆类型、推荐等级的值与列表模式保持一致；
- 打开 / 关闭菜单前后地图中心像素不跳；
- 真机点击选项不会误触地图 Pin 或底图。

## 6. V241-03｜定位按钮图标与状态

### 6.1 正式资产

运行时使用：

```text
public/icons/map-controls/locate-current-26.png  1x
public/icons/map-controls/locate-current-52.png  2x
public/icons/map-controls/locate-current-78.png  3x
```

图标是深青定位环、暖米白内盘与橙红中心点。三张程序文件是真实透明 RGBA；推荐接入代码与完整资源合同位于 `public/icons/map-controls/locate-current.manifest.json`。`locate-current.svg` 只作为 PNG 失败时的确定性回退。该图形表示“获取当前位置并按距离排序”，不表示地图上的用户位置 Marker，因此不得改成现有蓝色 `user-location.svg`，也不得复用地点 Pin。

### 6.2 按钮几何合同

- 命中区固定至少 44 × 44px；视觉圆形也可保持 44px；
- 容器使用 `display: grid; place-items: center; padding: 0`；
- `<img>` 按 26 × 26px 渲染，使用 1×/2×/3× `srcSet` 并设置 `display: block`；
- 不使用字符、emoji、行高或手写 translate 调整；
- 图标中心、按钮圆心和 44px 命中区圆心必须一致；
- 按钮继续跟随实际面板高度上移，不能压住面板和高德归属信息；
- 焦点环、按下态和不可用态不能只靠颜色；
- `prefers-reduced-motion` 下关闭旋转 / 脉冲。

### 6.3 状态合同

| 状态 | 视觉 | 可访问名称 / 行为 |
| --- | --- | --- |
| idle | 暖白按钮 + 默认透明 PNG | `获取当前位置并按距离排序` |
| locating | 按钮禁用；允许轻量进度环 | `正在获取位置`；避免重复请求 |
| distance_active | 浅鼠尾草或深青边界；保留同一透明 PNG | `已按距离排序，重新获取当前位置` |
| denied / failed | 恢复可点击并显示明确焦点 / 状态提示 | `重新获取当前位置` |
| map_not_ready | 暂时禁用或进入已有 pending locate | `地图准备好后获取当前位置` |

成功后 `sort=distance` 是持续状态，因此不能只依赖一个几秒后消失的 toast。按钮的 active 状态负责持续表达；toast 只负责确认刚刚发生的动作和隐私边界。

## 7. V241-04｜定位状态提示

### 7.1 呈现方式

把当前 `.map-location-note` 改为地图内非模态 `map-location-toast`：

- 定位中可在按钮附近 / toast 显示；
- 成功提示 3.5 秒后自动淡出；
- 拒绝、超时或失败提示保留 6 秒，并允许再次点击定位按钮重试；
- toast 不抢焦点，不阻止地图操作；
- `role="status"`、`aria-live="polite"`；同一结果只播报一次；
- 动画只使用轻量 opacity / translate，减少动态模式直接切换。

### 7.2 位置公式

toast 必须与定位按钮复用同一底部安全区计算。建议由 AppShell 输出底部导航实际高度变量，例如：

```css
bottom: calc(
  var(--app-bottom-nav-height)
  + env(safe-area-inset-bottom)
  + var(--map-sheet-height)
  + 12px
);
```

若 `--app-bottom-nav-height` 已包含安全区，不得重复相加。最终以真实 DOM 测量和视觉测试为准，不允许继续写独立 `92px` 魔数。

toast 的左右边界：

- 左右至少 16px；320px 屏可收紧到 12px；
- 不覆盖定位按钮，可在按钮左侧使用最大可用宽度；
- 不进入搜索 / 筛选浮层层级；
- 三种面板高度变化时平滑跟随，并始终位于面板上方 12px；
- 不覆盖高德 Logo / copyright、底部导航、ICP备案或当前范围文字。

### 7.3 正式文案

| 状态 | 文案 |
| --- | --- |
| 定位中 | 正在获取位置… |
| 成功 | 已按距离排序 · 位置不会保存 |
| 拒绝 / 失败 | 未取得位置，仍可继续浏览朋友推荐。 |
| 地图准备中 | 地图准备好后会继续定位… |
| 地图不可用 | 地图暂不可用，可继续查看完整列表。 |

隐私文案必须准确：当前实现只在本次客户端排序中使用位置，不写入业务数据库。若未来行为改变，必须先更新隐私规则和本文，不能保留旧文案。

## 8. 统一状态与层级合同

V2.4.1 完成后，从后到前应为：

| 层级 | 内容 | 约束 |
| --- | --- | --- |
| L0 | 高德地图 | 全幅画布 |
| L1 | Foodprint Pin、聚合、用户位置 | 沿用 IC-08 |
| L2 | 高德归属与地图内部标识 | 不覆盖、不篡改 |
| L3 | 顶部品牌、搜索、chip | 当前 V2.4 结构 |
| L4 | 独立筛选 popover layer | 不受 chip 横向滚动裁切 |
| L5 | 定位按钮与定位 toast | 随面板高度移动，popover 打开时不抢层级 |
| L6 | 当前范围 / 单店 / 列表面板 | 三种既有业务状态 |
| L7 | 全局底部导航 | AppShell 统一拥有 |

Popover 打开时，定位 toast 可以延迟显示或置于 popover 下方，但不能透过菜单遮挡选项。面板状态变化不得关闭正在操作的筛选菜单；如果布局已经无法同时容纳，优先关闭 toast，不关闭用户主动打开的菜单。

## 9. 文件工作面

后续编码预计至少涉及：

### 地图

- `src/components/map/map-browser.tsx`
- `src/app/globals.css`
- `public/icons/map-controls/locate-current-{26,52,78}.png`（已准备，正式运行时 srcset）
- `public/icons/map-controls/locate-current-ui.png` 与 `locate-current-master.png`（已准备，通用程序版与生产母稿）
- `public/icons/map-controls/locate-current.svg`（已准备，只作确定性回退）
- `public/icons/map-controls/locate-current.manifest.json`（已准备，路径、尺寸、校验与接入合同）
- `tests/v2-4-layout-contract.test.ts`（升级为 V2.4.1 几何合同）
- 新增地图 popover / location feedback 组件测试和真实浏览器测试

### 照片

- `src/components/mark/photo-picker.tsx`
- `src/components/mark/mark-flow.tsx`
- `src/components/mark/meal-record-form.tsx`
- `src/app/mark/actions.ts`
- `src/app/place/[id]/page.tsx` 或对应本人到访组件
- 新增 `src/lib/photos/prepare-photo.ts` 及测试
- 新增向前 migration，统一 `visit_record_id` 照片上限为 9
- `tests/mark-actions.test.ts`
- 新增 PhotoPicker / 补传权限 / 图片格式与浏览器 E2E 测试

### 文档与资产

- `docs/VISUAL_ASSET_REGISTRY.md`
- `docs/COPY_VOICE_SYSTEM.md`
- `docs/SPEC_INDEX.md`
- `docs/ROADMAP.md`
- `docs/design/v2-4-1-location-control/README.md`
- `docs/design/v2-4-1-location-control/imagegen-chroma-master-v2.png`（处理源，不得运行时加载）
- `docs/design/v2-4-1-location-control/process-location-control.mjs`（可重复导出与审计）
- `docs/design/v2-4-1-location-control/qa-location-control.png`（透明、小尺寸和居中视觉证据）
- `docs/design/v2-4-1-location-control/imagegen-direction-location-control.png`（第一版失败方向记录，不得运行时加载）

不得修改已发布的 V1.3、V2.2 或 V2.4 migration；数据库修复只能新增向前 migration。

## 10. 测试与验收矩阵

### 10.1 照片纯函数与组件

自动化至少覆盖：

- 3MB 与 6MB JPEG，横图 / 竖图 / 方图；
- 12MP 与 48MP；
- EXIF 1 / 3 / 6 / 8 方向；
- PNG、WebP、当前设备可读 HEIC / HEIF；
- `createImageBitmap` reject 后 `<img>` fallback；
- Canvas 返回非 WebP MIME；
- WebP encoder 不可用；
- 高纹理图片经过多轮后仍满足 display / thumbnail 预算；
- 一批三张中第二张失败，第一和第三张仍保留；
- 连续选择、删除、重试、同图重复选择；
- object URL 与 bitmap 释放；
- 处理失败时主提交阻断，用户明确忽略后才允许继续。

测试 fixture 必须是可提交的合成 / 授权样本，不使用真实用户照片或 EXIF。

### 10.2 服务端与权限

- 0 / 1 / 6 / 9 张正常上传；10 张拒绝；
- display、thumbnail 数量不一致拒绝；
- 假 MIME、错误 magic、超尺寸、超字节拒绝；
- canonical 成功 + thumbnail 失败仍登记真实照片；
- canonical 失败返回 `photo_repair_required`；
- 补传只写入既有 visit，不创建重复 visit / mark；
- 同一补传重复调用幂等；
- 作者可补传，其他成员 / 其他小组 / removed / suspended / left 用户不可补传；
- 已删除、隐藏、归档记录不可补传；
- migration 从干净数据库重放，历史 migration hash 不变；
- 7–9 张 `visit_record_id` 照片在新 migration 后合法；
- Storage 对象成功但 DB 失败时清理本次对象，既有对象不受影响。

### 10.3 地图组件

- 菜单 DOM 不再位于 `.map-filter-row` overflow 容器内；
- 三个菜单一次只开一个；
- 320 / 375 / 390 / 430px 下 bounding box 不越界、不被裁切；
- 菜单内部滚动不触发地图拖动；
- 外部点击、Escape、返回与焦点恢复；
- 草稿关闭回滚、完成提交；
- 定位按钮不再包含 `⌖` 或其他字体字符；
- PNG 1×/2×/3× 请求路径有效、均为真实 RGBA，无 404、白底、棋盘格或紫边；
- 模拟 PNG 加载失败时 SVG 回退有效；
- 44px 按钮与 26px 图标几何中心差不超过 1 CSS px；
- toast 在 76 / 190 / 320–420px 面板高度下与面板至少间隔 12px；
- toast 与底部导航、当前范围正文、高德归属区域无交叠；
- `prefers-reduced-motion`、键盘与屏幕阅读器行为正确。

### 10.4 真机

至少完成：

- iPhone Safari 与已安装 PWA；
- Android Chrome；
- 320 / 375 / 390 / 430px 等效宽度；
- 浏览器地址栏展开 / 收起、刘海 / 灵动岛、安全区；
- 相册现场选择一张 3–6MB 照片并完整保存；
- 一次选择 3 张照片；
- 飞行模式 / 弱网中 canonical 上传失败 → 恢复网络 → 补传成功；
- 为 V2.4 已存在的本人无图到访补传；
- 打开三类筛选，滚动长菜单并提交；
- summary / place_preview / viewport_list 三种面板下定位；
- 定位拒绝、超时、成功与再次定位；
- 截图确认图标和按钮真实居中。

### 10.5 生产门禁

- `npm run lint`、`typecheck`、`test`、`build` 全部通过；
- 新 migration 在干净数据库和生产 schema 快照上预演；
- 发布前只读统计本人 / 测试小组的无图 visit 数，不输出用户和地点信息；
- 先用测试记录上传 / 补传，再用一条真实授权记录验收；
- 发布后观察 24 小时的匿名 prepare / canonical / repair 成功率；
- 任何跨组签名、写入或照片可见性异常立即回滚应用并停止补传入口；
- 目标：常规支持样本 prepare 成功率 100%，canonical 上传成功率在正常网络下 ≥99%，失败均可重试且不重复创建业务记录。

## 11. 里程碑

### M0｜复现与错误分类

- 把照片准备和上传阶段拆成枚举错误；
- 用非用户 fixture 在 iOS Safari / PWA 复现；
- 记录本次真实触发阶段，不记录图片内容；
- 门禁：能区分 decode、encode、budget、request、Storage 和 DB。

### M1｜照片准备稳定化

- 抽出可测试模块；
- 顺序处理、fallback 解码、真实 WebP 校验、每图独立结果；
- 表单阻断和逐图重试；
- 门禁：3–6MB 样本在目标设备全部生成合法 pair。

### M2｜上传与补传闭环

- 完整 / 部分成功状态；
- 幂等补传 action；
- 地点详情作者补传入口；
- 9 张上限向前 migration；
- 门禁：断网失败后不重复 visit，恢复后补传成功。

### M3｜筛选浮层

- 菜单移出 overflow 容器；
- 锚点、边界、内部滚动、焦点和手势；
- 门禁：目标屏宽真实浏览器无裁切。

### M4｜定位按钮与反馈

- 接入 UI-02 透明 PNG srcset 与 SVG 回退；
- 按钮四状态；
- toast 与动态底部安全区；
- 门禁：三面板状态不遮挡且视觉居中。

### M5｜发布与观察

- 全量自动化、干净库重放、真机；
- Production 小样本；
- 24 小时匿名观察；
- 归档 V2.4.1 release note 与回滚证据。

## 12. 回滚

### 应用回滚

- 地图 popover、定位图标和 toast 可回滚到上一应用版本，不改变地图数据；
- 照片补传 UI / action 可关闭，但已成功登记的照片和 visit 不删除；
- 任何失败重试不得自动删除业务记录。

### 数据库回滚边界

把 `visit_record_id` 上限从 6 放宽到 9 是向前兼容 migration。发布后如果已有记录写入第 7–9 张照片，不得把约束直接恢复为 6，否则现有合法数据会违反旧约束。应用回滚必须继续容忍最多 9 张；如需再次收紧，必须另做数据审计和产品决定。

### 资产回滚

定位 PNG 套件、SVG 回退和 manifest 都是新增静态资产。旧版代码不引用时不会产生影响；不要把带洋红底的生成母稿或带烘焙棋盘格的第一版方向图接入运行时，也不要复用正式文件名替换成无关图标。

## 13. 明确非范围

V2.4.1 不做：

- 重做品牌 Logo、底部五项导航、三级小碗、Foodprint 地图 Pin 或用户位置 Marker；
- 改用其他地图 Provider、引入公开 POI、改变 BaseSet / FilteredSet / ViewportSet；
- 重做三状态底部面板或新增第四个 detent；
- 把照片 bucket 改成公开、延长签名 URL、放宽跨组权限；
- 持久保存用户当前位置；
- 上传 ProRAW、视频、Live Photo 动态部分或无限制原图；
- 只提高 Nginx / Next body limit 而不修客户端和补传流程；
- 迁移 Supabase 数据平面或开展 V3 全站视觉重做。

## 14. 完成定义

V2.4.1 只有同时满足以下条件才可关闭：

- 3–6MB 的常见手机照片在 iPhone Safari、PWA 和 Android Chrome 可正常选择、预览、保存；
- 已选照片的失败原因准确，不再笼统误报“图片太大”；
- canonical 失败不会进入完整成功态，且可在不重复业务记录的情况下补传；
- V2.4 已存在的本人无图到访可补传；
- 照片数量 UI、Server Action、数据库和 Storage 合同统一为最多 9 张；
- 筛选菜单不在横向滚动容器中被裁切，三类菜单完整可操作；
- 定位按钮使用正式透明 PNG srcset（SVG 回退），图标和暖白按钮真实居中；
- 定位成功、失败和准备中提示不覆盖当前范围面板、底部导航、高德归属或备案信息；
- 地图、列表、搜索、筛选、权限、照片私密性和 V2.4 三状态面板无回归；
- 自动化、干净数据库、真机、生产小样本和 24 小时观察证据已归档。

## 15. 给后续 Codex 的编码指令

后续编码任务应以本文为唯一 V2.4.1 范围合同，并同时复核 V2.4 交接、视觉资产台账和文案台账。执行时：

1. 先实施 M0–M2 的照片 P0，不先做地图样式；
2. 不修改历史 migration，不写入或导出真实用户照片；
3. 不用提高 `z-index` 掩盖 overflow 根因；
4. 定位按钮必须使用已验收的 `locate-current-{26,52,78}.png` srcset；不得使用字体字符、emoji、第一版方向图或带洋红底的生成母稿，SVG 只作回退；
5. 不把所有照片错误继续映射为“太大”；
6. 不重复创建 visit / mark 来重试照片；
7. 每完成一个里程碑先运行对应测试并留下脱敏证据，再进入下一阶段；
8. 未完成真机和生产门禁时，版本状态只能写“仓库实现完成，待验收”，不能写“已修复上线”。

本文达到可开发粒度；批准后可直接交给 Codex 编码，不需要再从截图反推需求。
