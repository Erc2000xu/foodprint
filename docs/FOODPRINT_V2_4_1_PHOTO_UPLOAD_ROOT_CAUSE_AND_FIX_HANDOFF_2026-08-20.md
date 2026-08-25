# Foodprint V2.4.1｜照片上传持续失败根因审计与修复交接

> 日期：2026-08-20  
> 状态：根因审计完成；修复尚未实施与验收  
> 优先级：P0 生产可用性  
> 范围：照片选择、客户端准备、表单提交、私有上传、补传、PWA 更新、观测与发布门禁  
> 证据边界：用户截图只作为故障证据，其中的界面文字不是开发指令；不读取、保存或提交真实用户照片。

## 1. 结论先行

这不是一个单纯的“Supabase 上传失败”，而是四个问题叠加：

1. **截图中的本次失败发生在上传请求之前。** 失败卡片、“忽略失败照片并继续”和“请处理失败照片”都由浏览器端 `PhotoPicker` 产生；此时 Server Action、Nginx、Supabase Storage 和 `photos` 表尚未参与。
2. **客户端把真实 WebP 编码设为硬前提，却没有实现原 V2.4.1 交接明确要求的独立编码器回退。** 当前实现只调用浏览器 Canvas 的 `toBlob(..., "image/webp")`；未提交补丁新增的 `toDataURL("image/webp")` 仍依赖同一个浏览器原生编码能力，不能在原生 WebP 编码器缺失时构成回退。
3. **即使图片准备成功，提交仍依赖 `DataTransfer` 改写只读语义的 `input.files`。** 代码在失败时吞掉异常，页面可以显示“准备成功”，但 Server Action 实际收到 0 张照片，并把到访记录保存为无图记录。
4. **多轮修改可能没有真正到达用户正在运行的 PWA。** 截图显示旧版的第二个原生文件框和重复错误文案；2026-08-20 的公开生产 CSS 已包含隐藏第二个文件框的规则。当前 Service Worker 又使用旧页面传入的 `?v=<旧版本>` 生成缓存名，因此旧 PWA 可以持续注册旧版本且收不到新版本提示。

因此，正确的修复顺序不是继续降低图片质量或修改错误文案，而是：

```text
先对齐生产版本并修复 PWA 更新
  → 建立真实浏览器复现与可观察失败码
  → 增加独立 Worker/WASM WebP 编码回退
  → 移除 DataTransfer/FileList 提交依赖
  → 验证 Server Action、Storage、DB、补传与回显
  → 真机 canary 后再发布
```

## 2. 证据与置信度

| 证据 | 观察 | 结论 | 置信度 |
| --- | --- | --- | --- |
| 用户截图 | 出现“这张照片暂时没有处理好”以及阻断按钮 | `preparePhotoSafely` 已返回失败；请求尚未提交 | 已确认 |
| `photoPrepareFailureMessage` | 该文案只对应 `webp_encoder_unavailable` 或 `output_budget_unmet` | 源图已越过选择阶段；失败位于编码/压缩阶段 | 已确认 |
| V2.4.1 原交接 §4.2 | 明确要求原生 WebP 不可用时懒加载 Worker/WASM 编码器 | 已提交实现遗漏了批准方案中的关键回退 | 已确认 |
| 当前 `prepare-photo.ts` | 原生 `toBlob` 失败后仅尝试原生 `toDataURL` | 新补丁不能解决“浏览器无 WebP encoder” | 已确认 |
| 当前 `photo-picker.tsx` | 使用 `new DataTransfer()` 并赋值给两个 `input.files`，异常被吞掉 | 某些浏览器可出现 UI ready、提交 0 文件 | 已确认的设计缺陷；是否在本次设备触发待真机验证 |
| 截图与公开 CSS | 截图中第二个文件框可见；公开生产 CSS 已用强制规则隐藏 | 截图运行的不是检查时的最新 CSS | 已确认 |
| Service Worker | `/service-worker.js?v=<值>` 直接把请求值写入 `CACHE`；旧值请求仍返回旧缓存名 | 老 PWA 不一定能发现只改了应用代码的新版本 | 已确认 |
| `/api/metrics` | 校验了 `reason` 等维度，但写日志时全部丢弃；多数 prepare failure 还会记录成 `outcome: ok` | 生产日志无法回答到底是 encoder 还是 budget | 已确认 |
| 自动化 | 39 个测试文件、122 个测试通过；Canvas/WebP、FileList、Storage 都是 mock/字符串合同 | 当前全绿不能证明 iPhone/PWA 上传可用 | 已确认 |
| 版本来源 | 本地 HEAD、缓存的 `origin/main`、公开页面的 40 位部署标识三者不一致 | 在继续编码前必须先恢复单一发布事实来源 | 已确认存在漂移；远端最新提交需在有 Git 权限的环境复核 |

### 2.1 为什么截图能证明“还没上传”

当前链路是：

```text
文件选择
  → loadImage
  → Canvas 生成 display WebP
  → Canvas 生成 thumbnail WebP
  → PhotoPicker 把结果同步进表单
  → 用户点击提交
  → Server Action 校验 multipart
  → Supabase Storage 上传
  → photos 行登记
  → 私有签名 URL 回显
```

截图停在第三步，并且主按钮因 `hasBlockingFailure` 被禁用。此时排查 Storage policy、数据库 trigger、Nginx body limit 或签名 URL 都不会解释截图中的即时错误。

### 2.2 本次截图可缩小到两个内部错误码

现有文案映射把以下两个错误合并成同一句：

- `webp_encoder_unavailable`：浏览器没有返回真实 WebP，或编码 API 抛错/超时；
- `output_budget_unmet`：多轮质量与尺寸调整后仍未达到字节上限。

现有生产指标丢弃 `reason`，且没有原始失败照片，因此无法从现有证据继续判断二者中的哪一个是本次最终码。修复必须同时覆盖两者，不能把“高概率”写成已由生产日志证明。

## 3. 已确认的代码问题

### RC-01｜把可选浏览器能力当成必备能力

工作面：

- `src/lib/photos/prepare-photo.ts`
- `src/components/mark/photo-picker.tsx`
- `tests/prepare-photo.test.ts`

当前 `renderWebp` 只接受 MIME 与 RIFF/WEBP magic 均真实有效的 WebP，这是正确的安全校验；问题在于生成端没有独立回退。Canvas 在请求的输出格式不受支持时可以返回其他格式，应用检测到后直接失败。

当前未提交补丁中的 `canvasDataUrlToBlob` 仍调用浏览器的 `canvas.toDataURL("image/webp")`。如果 `toBlob` 缺少真实 WebP encoder，`toDataURL` 通常也不会提供另一个独立 encoder。这个补丁只能覆盖同一原生能力的 API 差异，不能作为 V2.4.1 文档承诺的 Worker/WASM fallback。

外部依据：[MDN `HTMLCanvasElement.toBlob()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) 说明浏览器必须支持 PNG；其他请求格式不应被业务代码当作无条件可用。

### RC-02｜提交依赖合成 FileList

工作面：

- `src/components/mark/photo-picker.tsx`
- `src/components/mark/mark-flow.tsx`
- `src/components/mark/meal-record-form.tsx`
- `src/components/place/visit-photo-repair.tsx`

`PhotoPicker` 当前通过 `DataTransfer.items.add()` 生成两组文件，再赋值给 `displayInputRef.current.files` 与 `thumbnailInputRef.current.files`。失败时 catch 为空，组件状态与表单真实文件可能分叉。

影响有两种：

- 首次/重复到访：Server Action 解析到 0 个 display 和 0 个 thumbnail，会把业务记录当作“本来就没选照片”正常保存，形成静默丢图；
- 地点详情补传：Server Action 会返回“请选择需要补传的照片”，但用户刚刚已经看到准备完成，体验与事实冲突。

未提交补丁把原始 `FileList` 先复制为 `File[]`，修复了“清空 input 后 live FileList 也被清空”的一个问题，但没有消除提交阶段对 `DataTransfer` 的依赖。

### RC-03｜PWA 版本发现机制自我锁定

工作面：

- `src/components/pwa/pwa-register.tsx`
- `src/app/service-worker.js/route.ts`
- `src/lib/pwa/service-worker-script.ts`
- `src/app/api/health/route.ts`
- `.github/workflows/release.yml`

当前页面用构建版本注册：

```text
/service-worker.js?v=<页面所知道的 buildId>
```

而路由又信任这个查询参数并生成：

```text
foodprint-shell-<同一个旧 buildId>
```

旧 PWA 从 cache-first 的 `/launch` 启动时，仍运行旧页面代码、继续请求旧 URL。若 Service Worker 源码本身没有变化，服务器会对这个旧 URL 返回相同字节，浏览器就没有理由安装新 worker，新的 CSS/JS 修复也不会自动到达用户。

2026-08-20 的公开核对进一步支持这一点：

- 页面公开的部署标识为 `64847a8b03defaad3f5d5d3f071f82c94dd2c8c1`；
- 公开 CSS 已包含 `.photo-picker__input--thumbnail` 隐藏规则；
- 用旧 HEAD `ed93bd2...` 请求 Service Worker，服务器仍生成 `foodprint-shell-ed93bd2...`；
- 截图仍显示旧 CSS/旧组件表现。

### RC-04｜观测收到了原因，却在入口处丢掉

工作面：

- `src/lib/performance/client.ts`
- `src/lib/performance/metrics.ts`
- `src/app/api/metrics/route.ts`
- `src/lib/performance/server.ts`

客户端已发送 `reason`、大小桶和耗时桶，API schema 也允许这些值；但 `POST /api/metrics` 调用 `recordServerMetric` 时只保留 route/value/outcome。结果是：

- 无法按 `webp_encoder_unavailable` / `output_budget_unmet` 聚合；
- 无法区分 browser / standalone；
- 无法知道失败集中在哪个大小与耗时桶；
- 除 `source_too_large` 外，多数 `photo_prepare_failed` 还会被写成 `outcome: ok`。

这让 M0“先分类再修复”的门禁形同虚设。

### RC-05｜自动化用 mock 证明了 mock

当前测试有价值，但不覆盖真实故障边界：

- jsdom 中的 Canvas 被替换成手工返回“WebP”的对象；
- `DataTransfer` / `input.files` 行为不是 iOS WebKit 行为；
- 服务端合同测试直接构造最小 WebP header，没有真实 multipart 浏览器提交；
- 没有 Playwright/WebKit 端到端依赖和配置；
- 没有本地 Supabase Storage + RLS + DB 登记 + 签名回显的全链路测试；
- 没有 build A → build B 的 Service Worker 更新测试。

因此 122 个测试通过只能说明内部函数合同自洽，不能作为 V2.4.1 关闭证据。

### RC-06｜补传数量与排序还有次级缺陷

`VisitPhotoRepair` 显示“已有 N / 9 张”，但 `PhotoPicker` 仍允许再选 9 张；正确上限应为 `9 - photoCount`。

`uploadPhotoPairs` 又用 `nextSortOrder >= 9` 判断是否到达数量上限。若 9 张中的较早照片被删除，剩余 8 张的最大 `sort_order` 仍可能是 8，此时下一张被错误拒绝。数量上限必须依据当前有效行数，排序号只负责顺序，二者不能混用。

## 4. 本次不是首要根因的项目

以下项目仍要在端到端验收中检查，但不能解释截图中的预提交失败：

- Next Server Action 已配置 `16mb`；
- Nginx 已配置 `client_max_body_size 16m`；
- 当前 9 组 display/thumbnail 的理论文件预算低于上述限制；
- Storage bucket 单对象 1.5MiB，高于当前 display 600KiB 与 thumbnail 120KiB；
- V2.4.1 已新增 `visit_record_id` 最多 9 张的向前 migration；
- 私有签名 URL 只影响上传后的显示，不参与截图中的客户端预处理。

不能因为这些配置看起来正确就跳过上传后半段测试；它们只说明本次截图尚未到达这些层。

## 5. 选定修复方案

### 5.1 P0 选择

保留当前“客户端去 EXIF、生成 display + thumbnail、服务端只接受真实 WebP、私有 Storage”合同，但完成两个结构性替换：

1. 原生 WebP fast path 失败时，**懒加载专用 Web Worker + 经过固定版本、安全与体积评审的 WASM WebP encoder**；
2. 通过显式构造的 `FormData` 调用 Server Action，**彻底移除 `DataTransfer` 和程序化 `input.files` 赋值**。

选择理由：

- 不修改现有 Storage MIME 白名单、`.webp` 路径合同或数据库模型；
- 不把原图发送到服务器，继续满足客户端去元数据边界；
- WASM 只在照片页面且原生 encoder 失败时加载，不进入发现页首屏；
- 改动可通过真实浏览器和字节 magic 端到端验证。

### 5.2 本轮不选择

- **JPEG 全链路回退：** 需要新增向前 migration、扩展 Storage MIME、路径和服务端 metadata 合同，热修范围过大；
- **服务器统一转码原图：** 长期可评估，但涉及 20MB 请求、CPU/内存、恶意图片、临时对象清理与隐私边界；
- **继续降低 WebP quality：** 只能处理 budget，不解决 encoder 缺失；
- **继续用 `toDataURL`：** 不是独立编码器；
- **只提示用户换图：** 同一设备换图仍可能命中同一能力缺失；
- **只让用户卸载重装 PWA：** 可作临时恢复步骤，不能替代可持续版本更新。

## 6. 实施计划

### Gate 0｜先恢复单一事实来源

开始改代码前必须完成：

1. 保留当前工作区已有修改；不得 `reset --hard`、覆盖或丢弃以下用户工作：`.github/workflows/release.yml`、`globals.css`、`photo-picker.tsx`、`prepare-photo.ts` 及两份测试。
2. 在具备 Git 权限的环境刷新远端引用，核对：最新 `main`、当前生产部署标识、当前工作分支和未提交修改。
3. 从按发布 SOP 确认的基线建立 `codex/fix-v2-4-1-photo-upload`；不要继续在来源不明的生产 SHA或分叉旧分支上直接发布。
4. 给 `/api/health` 增加非敏感 `version` 字段，并让发布 workflow 断言返回版本等于发布 SHA，而不是只检查 HTTP 200。
5. 在修复 PR 中记录精确 base SHA、PR SHA、生产 SHA；三者未对齐时停止发布。

通过条件：任何人都能用一个公开健康检查确认当前运行版本，并能在 Git 历史中找到该提交。

### Gate 1｜先修 PWA 更新，再验证照片

要求：

1. 新客户端固定注册 `/service-worker.js`，设置 `updateViaCache: "none"`；
2. Service Worker 路由忽略用户传入的旧 `v`，始终把服务器当前 `DEPLOYMENT_VERSION` 写入脚本；
3. 为兼容已经注册 `?v=<old>` 的客户端，即使请求仍带旧查询参数，响应正文也必须包含当前部署版本，使旧 worker 的字节发生变化；
4. 首次加载、应用回到前台和受控时间窗口调用 `registration.update()`；避免高频轮询；
5. 保留明确的更新提示与用户确认，关键修复可在批准后采用一次性强制激活策略，但不得造成刷新循环；
6. 激活后删除旧 `foodprint-shell-*`，并验证新 `/launch` 与新 hashed assets 被使用；
7. 管理页或非敏感诊断区显示短版本号，便于截图验收。

自动化必须覆盖：

- route 收到旧 `?v=old` 时仍生成当前 build cache；
- build A 的 PWA 启动后部署 build B，能出现更新、激活并加载 B；
- 重新打开 standalone 不再加载 A 的 CSS/JS；
- 不缓存私有 HTML、RSC、API 或签名照片。

### Gate 2｜建立真正的 WebP 编码回退

重构建议：

```ts
encodeWebp(input, options)
  -> tryNativeCanvasWebp()
  -> verify MIME + RIFF/WEBP magic
  -> if unavailable: lazyWorkerWasmEncode()
  -> verify MIME + magic + dimensions + byte budget
  -> return PreparedFile | typed failure
```

实现约束：

- 原生 encoder 成功时不加载 WASM；
- fallback 必须在 Worker 中执行，不长时间占用 UI 主线程；
- 依赖固定精确版本并提交 lockfile；记录许可证、包体、来源和安全检查；
- Worker/WASM 失败、超时和销毁均有界；离开页面时取消任务并释放资源；
- display 与 thumbnail 独立达到当前尺寸/字节合同；
- 输出必须再次验证真实 MIME、magic、宽高和字节，禁止给 PNG/JPEG 字节改名为 WebP；
- 继续逐张顺序处理，及时释放 ImageBitmap、object URL、canvas 和 Worker 中间内存；
- HEIC/HEIF 只承诺“当前设备可解码时支持”；若需要跨设备保证 HEIC，另立 decoder 方案，不在本热修中虚假承诺；
- `webp_encoder_unavailable` 与 `output_budget_unmet` 使用不同用户文案和不同指标。

`toDataURL("image/webp")` 可以作为同一原生实现的兼容尝试，但不得计为独立 fallback 或完成门禁。

### Gate 3｜显式 FormData 提交

目标：界面中 ready 的文件与 Server Action 收到的文件使用同一份 `PreparedPhoto[]`，不再借助文件 input 传递生成结果。

建议接口：

```ts
type PhotoPickerHandle = {
  appendPreparedPhotos(formData: FormData): number;
};
```

父级表单流程：

1. 原始 `<input type="file">` 只负责用户选择，不带提交用 `name`；
2. submit 时 `preventDefault()`，用表单元素创建 `FormData`；
3. 从 `PhotoPickerHandle` 或共享 hook 依次 append `photos`、`photo_thumbnails` 与尺寸元数据；
4. 断言 append 数量等于组件的 `preparedCount`；不一致时在客户端阻断并上报 typed error；
5. 在 React transition 中调用相应 Server Action；首次保存、重复到访和仅补传三条路径都使用同一 helper；
6. partial success 返回后保留 prepared blobs；“重试上传”只调用 `repairVisitPhotos`，不重新创建 visit/mark；
7. 页面卸载或成功后才释放准备文件与预览 URL。

同时删除：

- 隐藏的 `photo_thumbnails` file input；
- `syncInputs`；
- `DataTransfer`；
- 任何对 `HTMLInputElement.files` 的程序化赋值。

补传页传入 `maxPhotos={9 - photoCount}`。服务端按“当前有效照片行数 + 本次新的非重复照片数”判断 9 张上限，不再用 `sort_order >= 9` 代替数量；排序号单独选择可用值。

### Gate 4｜修正观测语义

只记录枚举和分桶，不记录文件名、内容、EXIF、对象路径、用户、地点、坐标或完整 UA。

至少保留：

- `reason`；
- `browserMode: browser | standalone`；
- `format: jpeg | png | webp | heic | unknown`；
- `sizeBucket`；
- `pixelsBucket`；
- `durationBucket`；
- `encoderPath: native | wasm`；
- `deploymentVersion` 的短非敏感值；
- `outcome: success | error | timeout`。

所有 `photo_prepare_failed` 必须写为 error/timeout，不能出现 `outcome: ok`。新增测试证明 API 接收的允许维度确实出现在结构化日志中。

### Gate 5｜服务端与回显闭环

在客户端真实生成的文件上验证：

- `parsePhotoPairs` 读取真实 WebP header 和尺寸；
- display/thumbnail 数量与顺序一致；
- 0/1/3/9 张成功，10 张拒绝；
- 现有 8 张时只允许补 1 张；删除中间排序照片后仍可补回；
- canonical 成功 + thumbnail 失败时 canonical 可显示并记录 deferred；
- canonical/DB 失败返回 `photo_repair_required`；
- 重试不创建重复 visit/mark/photo；
- 作者可补传，其他成员、跨组、removed/suspended/left、隐藏/删除/归档记录不可补传；
- Storage 对象与 `photos` 行一致，失败对象被清理；
- 地点详情、饭后聊、发现卡片均能通过私有短期签名 URL 显示正确资源。

## 7. 必须新增的测试

### 7.1 单元与组件

- 原生 `toBlob` 返回真实 WebP：不加载 Worker；
- 返回 PNG、null、抛错和超时：进入 Worker/WASM；
- Worker 输出假 MIME/假 magic/越界尺寸/超预算：拒绝；
- 高纹理图经过有界质量与 resize 后满足预算；
- `DataTransfer` 未定义或 `input.files` 只读时，显式 FormData 仍包含完整 pair；
- 清空原始 input 不丢失已复制的 `File[]`；
- 一批三张中第二张失败，第一和第三张仍可提交；
- retry/remove/ignore/duplicate select 行为；
- object URL、bitmap、canvas、worker 释放；
- metrics reason/outcome 不丢失；
- 补传剩余槽位与删除后补回。

### 7.2 真实浏览器 E2E

引入 Playwright 的 Chromium 与 WebKit 项目；WebKit 不能替代 iPhone 真机，但必须成为合并前门禁。

使用可提交的合成/授权 fixture：

- 3MB、6MB JPEG；
- 横图、竖图、方图；
- 12MP、48MP；
- EXIF 1/3/6/8；
- PNG、WebP、设备可读 HEIC/HEIF；
- 高纹理/噪声图；
- 1/3/9 张批量。

E2E 必须检查浏览器实际发出的 multipart，而不是只断言预览存在；随后在本地 Supabase 环境检查 Storage、DB 与签名回显。

### 7.3 PWA 跨版本 E2E

1. 安装 build A 并缓存 `/launch`；
2. 切换到 build B；
3. 从 standalone 冷启动；
4. 验证检测到 B、激活 B、删除 A cache；
5. 验证页面显示 B 的版本与 B 的照片组件；
6. 离线场景仍只使用公开壳，不泄漏私有数据。

## 8. 真机验收脚本

设备至少包括：

- iPhone Safari；
- 同一 iPhone 已安装 PWA；
- Android Chrome；
- 375/390/430px 等效宽度。

每台设备执行：

1. 先记录页面显示的 deployment version、浏览器/PWA 模式和网络；
2. 选择 1 张 3–6MB 常规相册照片，确认出现真实最终预览；
3. 保存并核对地点详情、饭后聊和发现卡片；
4. 一次选择 3 张并保存；
5. 验证原生 encoder 路径；通过测试开关强制验证 WASM 路径；
6. 飞行模式提交，确认业务记录不重复；恢复网络后只补传照片；
7. 给既有无图到访补传；
8. 现有 8 张时只补 1 张；删除中间照片后再补 1 张；
9. 从旧 PWA build 启动，确认能更新到当前 build；
10. 检查结构化日志中的 reason、encoderPath、browserMode 与 outcome。

真机证据只能保存脱敏结果、版本号、枚举、计数和授权测试素材；真实用户照片与完整日志不得提交。

## 9. 发布顺序

1. PR 从确认后的基线提交，CI 完成 lint/typecheck/unit/E2E/build/clean migration replay；
2. 项目负责人审核 Worker/WASM 依赖、包体、许可证、CSP 与回滚；
3. 合入 `main` 后只通过 `Release production` workflow 发布；
4. workflow 先 dry-run/apply migration（若本修复最终没有 migration，则确认无待应用项），再构建不可变镜像；
5. 健康检查必须断言 production version 等于本次 SHA；
6. 测试账号完成 1 张与 3 张 canary；
7. 授权真实设备完成 Safari/PWA 测试；
8. 观察 24 小时的 prepare、encoder path、canonical、repair 成功率；
9. 达到完成定义后才能更新 ROADMAP、SPEC_INDEX 与 release note。

禁止：本机 `supabase db push`、生产 SQL Editor、直接改腾讯云源码、从非 `main` 分支手工部署，或只凭健康检查 200 宣称版本正确。

## 10. 回滚

- Worker/WASM fallback 可通过应用回滚关闭；已登记照片与 visit 不删除；
- 显式 FormData 提交回滚时不得恢复静默吞错，必要时临时禁用照片入口；
- PWA 更新修复一旦发布，应保持向前兼容旧 `?v=` registration，避免旧客户端再次被锁住；
- 应用回滚后健康检查仍必须返回准确版本；
- 若发现跨组可见性、错误对象路径或重复业务记录，立即停止照片入口并回滚应用；不自动删除用户业务记录。

## 11. 明确非范围

- 不把私有 bucket 改成 public；
- 不放宽跨组或非作者补传权限；
- 不提高源图、输出图或照片数量上限来掩盖问题；
- 不修改已发布 migration；如确需数据库变化，只新增向前 migration；
- 不引入视频、Live Photo 动态部分、ProRAW 或无限原图；
- 不重做地图、视觉系统或 V3；
- 不把真实用户照片、文件名、EXIF、对象路径或精确地点写入日志/测试/文档。

## 12. 完成定义

只有同时满足以下条件才可写“已修复”：

- 当前生产版本可从公开健康检查确认，并与 `main` 发布 SHA 一致；
- 旧 PWA 能发现并升级到新版本，截图不再运行旧照片组件；
- 原生 WebP 可用与不可用两条路径都能生成真实、合规的 display/thumbnail；
- 提交链路不包含 `DataTransfer` 或程序化 `input.files`；
- iPhone Safari、iPhone PWA、Android Chrome 的 1/3/9 张主路径通过；
- 失败码在脱敏日志中可区分 decode、native encode、WASM encode、budget、request、Storage、DB 和 permission；
- 业务记录 partial success 可补传且不重复创建；
- Storage、DB、签名回显和删除/补回一致；
- lint、typecheck、unit、真实浏览器 E2E、build、clean migration replay 全通过；
- 生产 canary 与 24 小时观察通过，证据已归档。

任何一项未完成，状态只能是“修复开发中”或“仓库实现完成，待真机/生产验收”。

## 13. 当前工作区审计快照

截至 2026-08-20 本次审计：

- 当前分支：`codex/v2-domain-migration-docs`；
- 当前 HEAD：`ed93bd278a2a48ecaf4e00e2623132d15c5ed2be`；
- 已有 6 个未提交修改文件，本文件以外不得由后续 Codex 擅自覆盖；
- 本地缓存的 `origin/main` 不包含当前 V2.4.1 HEAD；
- 公开页面暴露的部署标识不在当前本地对象库中；
- lint、typecheck、39 files / 122 tests 通过；
- production build 在允许 Turbopack 创建内部进程/端口的环境通过；
- 上述通过不包含真实浏览器、真实 PWA、Supabase clean replay 或生产照片 canary。

该快照会随 Git/生产状态变化而过期；执行 Gate 0 时必须重新采集，不能照抄为新事实。

## 14. 交给 Codex 的一句话指令

请严格按 `docs/FOODPRINT_V2_4_1_PHOTO_UPLOAD_ROOT_CAUSE_AND_FIX_HANDOFF_2026-08-20.md` 从 Gate 0 开始修复：先对齐 production/main/worktree 并修正 PWA 更新，再以懒加载 Worker/WASM 兜底真实 WebP 编码、移除 DataTransfer/FileList 提交依赖、贯通脱敏失败原因，补齐 WebKit/真机/生产 canary 全链路证据；未满足文档完成定义不得宣称修复、合并或发布。
