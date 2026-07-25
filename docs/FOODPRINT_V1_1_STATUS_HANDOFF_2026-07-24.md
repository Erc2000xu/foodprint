# Foodprint V1.1 状态与开发交接

> 交接日期：2026-07-24  
> 当前工作分支：`codex/v1-1-amap-navigation-clean`  
> 当前待合并 PR：[PR #3 · feat: AMap 驱动地点筛选与导航](https://github.com/Erc2000xu/foodprint/pull/3)  
> 适用范围：V1 已上线后的 V1.1 小迭代；本文件以实际代码和部署状态为准。

## 1. 本轮目标与结论

本轮 V1.1 的目标是改善 V1 的地点检索和餐厅落地体验，并确立“高德是地理数据来源、Foodprint 不维护一张不完整的城市地理字典”的原则。

本轮**已完成并提交到 PR #3**的内容包括：

1. 首页列表优先，静态地图作为第二视图；
2. 高德 URI 导航跳转；
3. 地点标签视觉分层；
4. 移除后台手工维护商圈/行政区/地铁的旧入口，并停止首页读取 V1 的不完整 `geo_entities` 种子数据；
5. 首页行政区动态读取的代码路径、商圈/交通关键词的高德实时建议代码路径；
6. 用户反馈后的两项 UI 修复：市级 + 区级一致展示、删除无增益的固定快捷筛选行；
7. 高德免费版使用政策与合规/配额边界文档。

本轮**尚未形成可发布闭环**：PR #3 尚未合并到 `main`；最新提交对应的 Vercel GitHub 状态仍显示 `pending`，不能把它当作已发布生产版本。

## 2. 已完成事项

### 2.1 V1 基线（已在此前完成）

- V1 discovery 数据库迁移已由项目负责人通过 Supabase SQL Editor 手动执行并验证五张关系表存在：`cuisine_categories`、`geo_entities`、`place_cuisines`、`place_geo_entities`、`group_place_discovery_metadata`。
- V1 已合并至 `main`，基线提交为 `2aefddb`（`Implement V1 discovery experience`）。
- V1 支持菜系、场景、人均、评分、列表/静态地图、餐厅详情、真实标记、照片、邀请、导出等功能。
- 域名已购买，ICP 备案仍在流程中；备案后计划从 Vercel 迁移至腾讯云。项目通过 Adapter/环境变量保持替换地图、存储和部署底座的空间。

### 2.2 本轮代码提交

PR #3 是从已合并 V1 的 `main` 创建的干净分支，避免了旧临时克隆落后而重复带入 V1 代码的问题。

| 提交 | 内容 | 状态 |
| --- | --- | --- |
| `94c33c8` | 高德驱动地点筛选、导航、标签和后台旧地理入口清理 | 已推送 |
| `7168455` | 用户反馈：行政区展示规范化、删除首页固定快捷筛选 | 已推送 |
| `b11084c` | 高德免费版政策文档与 README 入口 | 已推送 |

另：PR #2 已关闭。它来自一个落后的临时本地 `main`，会重复包含已合并的 V1 内容，**不得恢复或合并**。

### 2.3 高德导航

餐厅详情页新增：

- `去高德导航`：使用 URI API，传递目的地 GCJ-02 坐标和餐厅名称；手机端优先唤起高德 App，不能唤起时降级至 Web；
- `在高德地图查看`：打开该餐厅名称/地址的高德地图搜索；
- Foodprint 不传递、不保存导航起点或用户实时位置。

实现文件：

- `src/lib/amap/uri.ts`
- `src/app/place/[id]/page.tsx`
- `tests/amap-uri.test.ts`

### 2.4 地点标签和行政区显示

地点标签采用不同颜色：

- 行政区：蓝色；
- 商圈/地点：橙色；
- 地铁/交通：紫色；
- 高德来源：绿色。

最新展示规则是：

```text
行政区 · {高德 city 原始字段} · {高德 district 原始字段}
```

例如 `行政区 · 北京市 · 顺义区`、`行政区 · 天津市 · 和平区`。代码只在 `district` 已经重复带有同一 `city` 前缀时去重；**不硬编码北京，也不在 city 缺失时凭空补城市**。

实现文件：

- `src/lib/amap/location-display.ts`
- `tests/location-display.test.ts`
- `src/components/map/map-browser.tsx`
- `src/app/place/[id]/page.tsx`

### 2.5 首页筛选的调整

用户反馈后，已删除首页固定的 `全部 / 咖啡馆 / 约会 / 评分 4+` 行。

原因：这些项目只是根据现有小样本字段硬编码，既不具代表性，又与“按地点找 / 按菜系找 / 找灵感”重复。首页目前把决策入口保留为：

1. 搜索框；
2. 按地点找；
3. 按菜系找；
4. 找灵感；
5. 用户主动筛选后才出现的人均、评分、排序控制。

这比继续堆放静态 chips 更符合“先表达意图，再得到列表”的使用路径。

### 2.6 高德免费版政策

已新增并在 README 引用：

- [`docs/AMAP_FREE_TIER_POLICY.md`](AMAP_FREE_TIER_POLICY.md)

政策要求：

- 中长期不采购流量包、技术服务许可、专业/旗舰版、商务/高级服务；
- 只使用高德当时免费版在当前主体、用途、权限和配额下明确允许的能力；
- 超出免费配额、权限或许可范围时，必须降级、停用或替换提供商，**禁止自动付费**；
- Web Service Key 只能在服务端/Edge Function Secret 保存；
- 不批量抓取、导出、再分发高德 POI/商圈/地铁数据。

### 2.7 已完成的质量验证

在本地干净分支上已执行：

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

最新测试结果：5 个测试文件、11 项测试通过。`git diff --check` 通过。

## 3. 高德数据能力与当前接入状态

### 3.1 可免费范围内优先使用的能力

| 业务需要 | 高德能力 | 关键数据/作用 |
| --- | --- | --- |
| 录入餐厅 | 输入提示、POI 关键字/周边/ID 搜索 | `poiid`、名称、地址、坐标、`city`、`district`、分类 |
| 行政区 | 行政区域查询 | 行政区名称、`adcode`、中心点、下级区域 |
| 餐厅的行政层级、商圈 | 逆地理编码 `extensions=all` | 结构化地址、区县、`adcode`、附近 POI、`businessAreas` |
| 商圈/AOI | POI/AOI 搜索 | 商圈名称、AOI ID、中心点；可用时还有边界 `polyline` |
| 地图 | JS API / 静态地图 API | 地图图面、缩放、标记 |
| 导航 | URI API | 唤起高德 App/Web 地图 |
| 自建路线页（未来可选） | 基础路径规划 | 驾车、公交、步行、骑行路线 |

官方资料：

- [逆地理编码与 businessArea](https://lbs.amap.com/api/webservice/guide/api/georegeo/)
- [POI/AOI 搜索](https://lbs.amap.com/api/webservice/guide/api-advanced/search)
- [高德 API 能力目录](https://lbs.amap.com/api/)
- [免费配额/认证 FAQ](https://lbs.amap.com/faq/account/certification/39670)
- [高德服务协议](https://lbs.amap.com/pages/terms/)

### 3.2 已实现的高德地理检索路径

- 首页行政区：`getAmapBeijingDistricts()` 调用高德行政区接口；
- 首页商圈/地铁关键词：`searchAmapPoiTips()` 调用高德输入提示，用户选中建议后以高德坐标做距离筛选；
- 地点标签：当前读取 `places.city` 和 `places.district`，这两个字段来自餐厅录入时的高德 POI 结果；
- 数据层：主页不再读取 `geo_entities` / `place_geo_entities` 作为权威位置筛选来源；旧表和迁移保留，以避免破坏既有数据和迁移历史。

## 4. 未完成、风险与明确卡点

### P0：Vercel 预览/发布尚未闭环

- 用户已打开并审阅过 PR #3 的早期 Vercel preview，能正常加载首页，证明早期 V1.1 构建产物可访问。
- 但 GitHub 对该 preview 的 Vercel status 长时间维持 `pending`，未提供失败日志；最新提交 `b11084c` 已触发新的 preview，当前同样尚未验证成功。
- Vercel 官方状态页当时显示 Build & Deploy 正常，因此更像项目级队列或部署任务卡住，而不是平台全局故障；但这尚未被日志证实。

**禁止动作：** 在 PR #3 的最新 preview 成功、并完成人工验收前，不合并 PR #3 到 `main`，不触发生产更新。

**下一步：** 在 Vercel Deployments 中打开最新部署，检查 Build Logs；若仍长期 pending，执行一次项目级 Redeploy，并确认最终 commit 为 `b11084c` 或更新后的修复提交。若失败，先修复日志错误再合并。

### P0：高德 Web Service Key 运行位置需统一

现有 V1 的 `amap-poi-search` 使用 Supabase Edge Function Secret 中的 `AMAP_WEBSERVICE_KEY`。V1.1 新增的 `getAmapBeijingDistricts()` 和 `searchAmapPoiTips()` 被 Next.js Server Action 调用，因此它们需要 Vercel 服务端环境变量 `AMAP_WEBSERVICE_KEY`。

README 旧文字曾要求“不要把 Web Service Key 放到 Vercel”，与该实现不一致。这是一个真实部署风险：若 Vercel 未配置该服务端 secret，首页展开行政区或搜索商圈/地铁时会显示“地点筛选服务尚未配置”。

**推荐修复（优先）：** 将这两项调用移入 Supabase Edge Function（可扩展现有 `amap-poi-search`），让 Key 始终只存放在 Supabase Secret；前端只调用 Edge Function。这样同时满足免费版密钥隔离政策与 README 约束。

**临时替代：** 在 Vercel Production/Preview 环境以私密变量配置 `AMAP_WEBSERVICE_KEY`。此做法仍不会暴露给浏览器，但会偏离当前 README 的密钥边界，必须同步更新文档后才能采用。

### P1：商圈归属尚未按餐厅坐标反查

当前首页“商圈/地铁”是高德实时关键词建议 + 坐标半径筛选；这已经避免了本地不完整的字典，但仍不是餐厅详情上的权威商圈归属。

还需要实现：

1. 对餐厅的高德 GCJ-02 坐标调用逆地理编码 `extensions=all`；
2. 读取返回的 `businessAreas`，显示真实商圈标签；
3. 以 AOI `id` / 坐标 / 可用时 `polyline` 对餐厅进行归属和筛选；
4. 使用可失效的短期缓存降低免费配额消耗；缓存不是项目自建权威商圈库；
5. 删去目前通过名称是否包含“站”判定“地铁/交通”的轻量启发式，改由高德 POI/AOI 类型或类型编码判断。

### P1：历史餐厅的城市/区县字段需刷新

较早录入的餐厅可能只有 `district`，或出现 `北京市顺义区` 与 `朝阳区` 两种格式。UI 已统一展示，但数据本身未批量修改。

待实现的安全回填：以已有 `source_poi_id` 或 GCJ-02 坐标向高德重新查询，将真实的 `city`、`district`、`adcode`（以及未来的商圈）更新到地点记录。不得用猜测字符串补齐，也不得批量抓取全城无关数据。

### P1：免费版配额与许可复核

高德个人认证 Web 服务配额中，输入提示和 POI 搜索的日配额较低（官方 FAQ 示例各为 100 次/日），V1.1 的商圈/地铁实时建议必须使用防抖、缓存、限量返回和用量监控。认证类型、账户实际额度和条款可能变化，发布前由项目负责人在高德控制台再次核验。

同时，若 Foodprint 后续转为公司主体、对外商业运营或不再符合个人研究学习用途，高德条款可能不允许继续仅按免费配额使用。项目既定“不使用付费高德”政策下，届时要停用/替换，而不是购买。

### P2：V1.2 “发现”页替换（等待产品文档）

用户明确认为当前底部第二项“发现”与首页列表功能重叠，应移除其现有布局并改为新功能。尚未收到 V1.2 的完整开发文档，当前不要自行修改该页面。等待新文档后先完成：信息架构、用户路径、原型/验收标准，再编码。

### P2：互动地图仍是未来主页面

产品最终主页面仍应是可缩放、可定位、可点击餐厅大头标、下半屏展示餐厅详情的互动地图。V1/V1.1 的列表优先和静态地图仅为当前 Vercel/高德连接问题下的阶段性方案。

未来实施前需：

1. 修复高德 JS API 的域名白名单、Key、安全密钥与 CSP/加载问题；
2. 使用现有 `MapProvider` / Adapter 边界接入互动地图；
3. 用地图视窗、缩放和 marker 聚合驱动检索，不将用户精确位置写入共享 URL；
4. 明确免费版许可、加载配额与降级路径。

## 5. 部署、域名与迁移状态

- 当前公开生产地址：`https://foodprint-nine.vercel.app/`；
- V1.1 待验证 preview：由 PR #3 的 Vercel deployment 生成；
- 域名已购买；ICP 备案尚在流程；
- 备案完成后计划迁移到腾讯云服务器。迁移时必须保留：环境变量分层、Supabase 接口、Adapter 边界、PWA 路径、回调 URL、域名白名单和高德 Key 绑定配置；
- 不要把高德 Key、Supabase Service Role Key、数据库连接串提交到 Git。

## 6. 下一位开发者的建议执行顺序

1. 查 Vercel 最新 deployment 日志，先完成 PR #3 最新 preview 验收；
2. 统一高德 Web Service Key 的调用位置，优先迁移到 Supabase Edge Function；
3. 实作“餐厅坐标 → 逆地理编码 `businessAreas` → 真实商圈标签/筛选”；
4. 用高德 POI/逆地理数据安全回填历史地点的 `city`、`district`、`adcode`；
5. 对免费配额增加防抖、缓存、阈值与可见降级；
6. 合并 PR #3 后检查 Vercel Production；
7. 等待 V1.2 文档后再替换“发现”页；
8. ICP 完成后按 `docs/OPERATIONS.md` 进行腾讯云切流评审。

## 7. 关键文件索引

| 文件 | 作用 |
| --- | --- |
| `docs/AMAP_FREE_TIER_POLICY.md` | 免费版、许可、配额、数据边界政策 |
| `src/components/map/map-browser.tsx` | 首页检索、动态行政区/商圈/交通建议、列表/静态地图切换 |
| `src/lib/discovery/server.ts` | 首页服务端读取模型；已停止使用旧地理种子关联作为权威来源 |
| `src/lib/amap/uri.ts` | 高德 URI 导航/地图查看链接 |
| `src/lib/amap/location-display.ts` | 高德 `city` + `district` 分层展示、只去重不推断 |
| `src/app/place/[id]/page.tsx` | 餐厅详情、标签、导航入口 |
| `supabase/functions/amap-poi-search/index.ts` | 现有高德 POI 搜索 Edge Function；建议扩展为统一的免费版服务端网关 |
| `docs/OPERATIONS.md` | Vercel/Supabase/腾讯云迁移与运行说明 |
