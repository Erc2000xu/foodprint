# Foodprint V2.3｜动态地图开发交接、技术方案与里程碑

> 文档日期：2026-08-12  
> 状态：仓库实现完成，待 Preview / 生产验收  
> 面向：下一轮 Codex 编码执行、代码评审、数据库评审、发布与验收  
> 产品真相源：[V2.3 产品规格](./specs/2026-08-v2-3-dynamic-discovery-map.md)  
> 逐项验收：[V2.3 验收清单](./acceptance/V2_3_DYNAMIC_MAP_ACCEPTANCE_CHECKLIST_2026-08-12.md)  
> 决策记录：[V2.3 架构决策](./decisions/2026-08-12-v2-3-dynamic-map-default-and-list-fallback.md)
> Pin 真相源：[B「餐盘定位圆章」正式资产规范](./design/v2-3-map-pins/final/README.md)

## 0. 执行摘要

V2.3 要把首页“发现”改成真正可拖动和缩放的高德动态地图，并上线类似大众点评地图模式的“当前范围地点抽屉”。地图、完整列表和抽屉必须来自一个受授权的 Foodprint 地点索引：

    当前用户 + 当前有效小组
              ↓
    全部 active 且已有正向观点的共同地点（BaseSet）
              ↓ 同一套搜索 / 筛选
    筛选后全部地点（FilteredSet）
              ├── 地图单点 / 聚合所代表的全部 ID
              ├── 列表模式全部 ID
              └── 与地图 bounds 求交 → 当前范围抽屉（ViewportSet）

本版本不使用静态地图。动态地图加载失败、被功能开关关闭或高德链路不可用时，应用直接切换到列表并保留已加载数据与筛选。地图不查询高德公开 POI，不把“去试试”地点上图，不保存用户位置。

下一轮编码必须按本文的阶段和门禁推进，不能先做一个“看起来能拖”的 Demo 再补数据权限、故障降级和完整性。最容易走偏的三处是：

1. 复用当前最多 20 条的 list_discovery_cards_v2 直接上图，造成静默漏点；
2. 在 pins 变化时销毁并重建 AMap 实例，造成卡顿、配额浪费和状态丢失；
3. 把地图视野列表做成一份新的高德周边搜索结果，破坏“只看朋友推荐”的产品边界。

## 1. 已批准的不可变决定

| 编号 | 决定 | 实现含义 |
| --- | --- | --- |
| D1 | 动态地图默认进入 | URL 没有 view 时为 map；view=list 才是列表 |
| D2 | 不做静态地图 | 不调用 amap-static-map；地图失败直接列表 |
| D3 | 地图与列表一组数据 | Map IDs = List IDs = FilteredSet IDs |
| D4 | 只显示小组已推荐地点 | active + 至少一份 current_opinion；候选 / 归档 / 无观点地点排除 |
| D5 | Pin 点选显示底部卡片 | 点 Pin 不立即跳详情 |
| D6 | 未选 Pin 也有当前范围抽屉 | ViewportSet 在 moveend / zoomend 后由本地 bounds 计算 |
| D7 | Pin 使用已批准 B「餐盘定位圆章」 | 只接入 v2.3.0 正式 SVG；三级小碗、选中、聚合与用户位置按 IC-08 规范实现，不再使用临时 Pin |
| D8 | 允许一键关图 | 服务端 DISCOVERY_DYNAMIC_MAP_ENABLED=false 时列表默认，不发 Key、不载 SDK |
| D9 | 地图只负责展示 Foodprint 数据 | 地图移动不触发 POI 搜索、地理编码或私有数据写入 |

若编码中发现这些决定之间有真实技术冲突，应先停在可复现证据处更新 ADR，不得自行改成静态图、列表默认或公开 POI 地图。

## 2. 当前仓库审计

### 2.1 已有可复用能力

| 现有位置 | 能力 | V2.3 处理 |
| --- | --- | --- |
| src/lib/amap/load-amap.ts | AMap Loader 2.0；设置同源安全代理 | 保留并加超时、加载状态、插件合同 |
| src/app/api/amap/[...path]/route.ts | 受控 /api/amap/_AMapService 代理；服务端追加 jscode | 加强错误映射、AbortSignal、缓存边界与监控 |
| src/components/map/amap-map.tsx | 最小动态地图、Scale、Marker | 重构为真正的 adapter；不得在 places 变化时重建地图 |
| src/components/map/map-adapter.tsx | viewport / pins / selection 回调雏形 | 替换 StaticMapAdapter，并把 bounds 加入合同 |
| src/components/map/map-browser.tsx | 列表、筛选、URL、定位、静态地图入口 | 拆分为状态编排 + MapCanvas + ViewportSheet + ListView |
| src/lib/discovery/search-state.ts | 搜索 / 筛选 / 排序纯函数 | 继续作为 FilteredSet 唯一入口；移出 UI 类型依赖 |
| src/lib/discovery/server.ts | V2.2 发现读模型与缩略图签名 | 新增 V2.3 完整索引读取，保留 V2.2 兼容期 |
| src/app/api/photos/sign/route.ts | 最多 20 个私有缩略图批量重签 | 用于抽屉可见项 / 选中卡片的按需图片链路 |
| src/lib/performance/* | 客户端 / 服务端匿名性能指标 | 增加地图指标白名单，不放 ID、查询或坐标 |
| deploy/nginx/foodprint*.conf | 腾讯云同源反代、隐私日志、普通 API 限流 | 为高德代理增加独立 zone / location |
| deploy/production.env.example | 生产环境变量模板 | 增加服务端地图功能开关 |

### 2.2 当前必须修正的问题

1. map-browser.tsx 当前把没有 view=map 的请求解释为列表，与 V2.3 相反。
2. 当前地图模式渲染 StaticMapAdapter，不是动态地图。
3. amap-map.tsx 的 effect 依赖 places；筛选变化会 destroy 再 new Map。
4. marker click 使用 window.location.assign，无法先显示底部卡片。
5. 当前 MapViewport 只有 center + zoom，没有 bounds，无法定义 ViewportSet。
6. MapPlace 定义在 UI 文件 amap-map.tsx，导致 server、搜索、卡片反向依赖地图组件。
7. list_discovery_cards_v2 把每页硬限制为 20，不能证明地图完整。
8. V2.2 RPC 快路径没有场景标签和商圈字段，现有筛选可能与旧 fallback 结果不同。
9. 当前浏览器 navigator.geolocation 返回通常为 WGS84，却直接和 GCJ-02 地点计算距离。
10. 普通 /api/ 的限流 burst=16 可能误伤高德 JS SDK 一次初始化产生的并发请求。
11. 当前 map proxy 没有上游 AbortSignal；供应商慢响应只能等待通用超时。
12. 现有 metrics 白名单不包含地图事件和错误类别。
13. static-amap-map.tsx 和 Supabase amap-static-map 仍在运行路径与旧手册中。
14. 当前 JS Key 使用构建期 NEXT_PUBLIC_AMAP_KEY；它不利于运行时关图后停止下发，也会让换 Key 必须重新构建。V2.3 应迁移为服务端 AMAP_JS_KEY，并仅在 mapEnabled=true 时经 Server Component 传给客户端。

## 3. 目标架构

### 3.1 组件边界

    src/app/page.tsx（Server）
      ├── getDiscoveryRequestContext()
      ├── loadDiscoveryIndexV23()  ← 完整、轻量、已授权
      └── DiscoveryBrowser（Client）
           ├── useDiscoveryController
           │    ├── URL 筛选状态
           │    ├── view / map 状态机
           │    ├── selectedPlaceId
           │    ├── sheetDetent
           │    └── userOrigin（仅内存）
           ├── DiscoveryControls
           ├── DynamicMapAdapter（仅 map 模式动态加载）
           │    └── AMap 2.0 + MarkerCluster
           ├── ViewportPlaceSheet
           │    ├── range summary
           │    ├── selected place card
           │    └── viewport place list
           └── DiscoveryListView

职责约束：

- Server 负责身份、小组、完整数据读取和功能开关。
- DiscoveryBrowser 负责模式、筛选和状态编排，不直接操作 AMap 实例。
- DynamicMapAdapter 是高德边界；上层只传业务数据和接收标准事件。
- ViewportPlaceSheet 不调用高德、不查数据库；它只消费 ViewportSet。
- DiscoveryListView 与地图消费同一个 FilteredSet。

### 3.2 建议文件结构

    src/
      components/
        discover/
          discovery-browser.tsx
          discovery-controls.tsx
          discovery-list-view.tsx
          map-place-card.tsx
          viewport-place-list.tsx
          viewport-place-sheet.tsx
          viewport-place-sheet-reducer.ts
        map/
          dynamic-map-adapter.tsx
          amap-runtime.ts
          amap-types.ts
          # Marker DOM 由 lib/amap 工厂提供；adapter 只负责高德生命周期
          map-geometry.ts
          map-failure.ts
      lib/
        amap/
          map-pin-assets.ts
          map-pin-elements.ts
        discovery/
          types.ts
          server.ts
          search-state.ts
          viewport.ts
      app/
        api/
          amap/[...path]/route.ts
          photos/sign/route.ts
    supabase/
      migrations/
        20260812xxxxxx_v2_3_discovery_map_index.sql
    tests/
      v2-3-discovery-index-migration.test.ts
      v2-3-discovery-parity.test.ts
      v2-3-map-geometry.test.ts
      v2-3-map-failure.test.ts
      v2-3-viewport-sheet.test.tsx
      v2-3-dynamic-map-adapter.test.tsx

不要求机械照搬文件名；但类型、数据、地图 provider 和 UI 必须保持上述分层。不要继续让 src/lib/discovery/server.ts import src/components/map/amap-map.tsx。

## 4. 领域模型与前端合同

### 4.1 移出组件的地点类型

在 src/lib/discovery/types.ts 建立唯一类型。建议合同：

    export type CoordinateSystem = "GCJ-02" | "WGS84" | "unknown";

    export type PlaceLocationStatus =
      | "ready"
      | "missing"
      | "invalid"
      | "needs_conversion";

    export type DiscoveryPlace = {
      id: string;                    // group_places.id，不是高德 POI ID
      name: string;
      category: string;
      address?: string;
      city?: string;
      district?: string;
      businessAreaName?: string;
      businessAreaAdcode?: string;
      latitude: number | null;
      longitude: number | null;
      coordinateSystem: CoordinateSystem;
      locationStatus: PlaceLocationStatus;
      cuisineSlugs: string[];
      sceneTags: string[];
      pricePerPerson: number | null;
      recommendedItems: string[];
      review: string | null;
      lastMarkedAt: string | null;
      bowlStrength: 1 | 2 | 3 | null;
      friendCount: number;
      recommendCount: number;
      goodTagCounts: Record<string, number>;
      savedForLater: boolean;
      coverPhotoId: string | null;
      coverPhotoWidth: number | null;
      coverPhotoHeight: number | null;
      coverPhotoUrl?: string | null; // 只在按需签名后出现
    };

    export type MapDiscoveryPlace = DiscoveryPlace & {
      latitude: number;
      longitude: number;
      coordinateSystem: "GCJ-02";
      locationStatus: "ready";
    };

DiscoveryPlace 是完整列表合同，必须能诚实表达历史坏数据；MapDiscoveryPlace 是经过运行时 schema / type guard 验证后才能交给地图的收窄类型。禁止用 0、默认城市中心或强制类型断言替代缺失坐标。只要 BaseSet 中存在一条不能收窄为 MapDiscoveryPlace 的记录，整个结果就是 invalid_coordinates，列表可用但地图不初始化。

迁移期间若保留 averageRating / markCount：

- 对外展示继续用 bowlStrength / friendCount；
- markCount 只作为兼容别名，最终统一为 friendCount；
- 不在 Pin 上重新显示五分星或小数评分。

### 4.2 地图合同

    export type LngLat = {
      longitude: number;
      latitude: number;
    };

    export type MapBounds = {
      southWest: LngLat;
      northEast: LngLat;
    };

    export type MapViewport = {
      center: LngLat;
      zoom: number;
      bounds: MapBounds;
    };

    export type MapPadding = {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };

    export type DynamicMapAdapterProps = {
      pins: readonly MapDiscoveryPlace[];
      selectedPlaceId?: string;
      fitRequestKey: string; // 只有筛选结果语义变化时变化
      padding: MapPadding;
      onReady(viewport: MapViewport): void;
      onSelectPlace(placeId: string): void;
      onClearSelection(): void;
      onViewportSettled(viewport: MapViewport): void;
      onFatalError(error: MapFailure): void;
    };

不要把 AMap.Map、AMap.Bounds、Marker 或供应商错误对象穿透到上层。adapter 之外不得依赖 window.AMap。

### 4.3 地图失败类型

    export type MapFailureStage =
      | "disabled"
      | "configuration"
      | "sdk_load"
      | "security_proxy"
      | "map_complete"
      | "runtime";

    export type MapFailureCode =
      | "missing_public_key"
      | "missing_security_key"
      | "origin_rejected"
      | "rate_limited"
      | "provider_timeout"
      | "provider_unavailable"
      | "sdk_rejected"
      | "complete_timeout"
      | "runtime_unrecoverable"
      | "unknown";

    export type MapFailure = {
      stage: MapFailureStage;
      code: MapFailureCode;
      retryable: boolean;
    };

错误对象不得包含原始 URL、jscode、地点数据、经纬度或第三方响应全文。

## 5. 数据方案

### 5.1 为什么不能直接复用当前 20 条 RPC

list_discovery_cards_v2 当前：

- p_limit 在数据库内被强制限制到最多 20；
- 快路径只给首批卡片签名封面；
- 没有返回完整场景标签和商圈；
- 页面代码把这 20 条当作所有 places；
- 旧 fallback 也只 limit 20。

如果直接把这些 rows 放到地图，地图与列表虽然“彼此一致”，却共同漏掉第 21 家以后地点。V2.3 的完整性要求是对 BaseSet 的完整，而不是对当前错误截断结果的一致。

### 5.2 新增向前兼容 RPC

新增一份 migration，例如：

    supabase/migrations/20260812120000_v2_3_discovery_map_index.sql

不要编辑 20260810120000_v2_2_read_models_and_photo_thumbnails.sql。旧函数在兼容窗口内保留。

建议新函数名：

    public.list_discovery_index_v2_3(
      p_limit integer default 100,
      p_before_created_at timestamptz default null,
      p_before_id uuid default null
    )

返回一页轻量 DiscoveryPlace 字段，并额外返回：

    next_cursor_created_at
    next_cursor_id
    has_more

分页规则：

- 稳定排序：gp.created_at desc, gp.id desc。
- 单页上限：100；不得接受浏览器传入任意高值。
- 服务端循环读取直到 has_more=false。
- 防御性最大页数：20，即最多 2,000 条。
- 达到 2,000 仍 has_more=true 时返回 dataCompleteness=overflow，不能把前 2,000 条宣布为完整地图。
- 循环中发现游标不前进、重复 ID 或 RPC 错误，返回 dataCompleteness=error。
- 正常完成后在服务端用 Set 校验无重复 ID。

2,000 是应用安全阀，不是产品最多允许记录 2,000 家。未来真实小组接近该数量时，应另立空间分页方案；V2.3 不提前做复杂空间服务。

### 5.3 BaseSet 数据库定义

RPC 必须由数据库按以下条件构造：

    with active_group as (
      select group_id
      from public.get_active_group_context_v2()
    )
    select ...
    from public.group_places gp
    join active_group on active_group.group_id = gp.group_id
    join public.places place on place.id = gp.place_id
    where gp.status = 'active'
      and exists (
        select 1
        from public.current_opinions opinion
        where opinion.group_place_id = gp.id
      )

说明：

- 离开小组成员已保留的 current_opinion 按既有隐私治理决议继续参与地点汇总，这不等于离开成员仍可读地图。
- 当前用户是否有权读取，由 active_group / auth.uid() 决定。
- candidate、dismissed、archived 和 inactive_no_marks 均不进入。
- 如果历史 active 数据没有 current_opinion，先做只读数据审计，不要自动凭空生成推荐观点。

### 5.4 RPC 返回字段来源

| 字段 | 建议来源 |
| --- | --- |
| 核心地点 / 坐标 | group_places + places |
| 推荐强度 / 人数 / 四维标签 | current_opinions 聚合，或已验证同步的 group_place_stats |
| 最新时间 | max(current_opinions.last_visited_on / updated_at) 与 gp.created_at 的已确认规则 |
| 菜系 | place_cuisines array_agg |
| 场景 | 仅使用经 M1 证明确实表达“约会 / 聚会”等场景的字段；当前候选是 legacy place_mark_scene_tags。若没有持续采集且可信的来源，则返回空能力标记并隐藏场景筛选 |
| 人均 / 推荐菜 / 摘要 | 最新可见到访记录；不得只读已隐藏 / 已删除内容 |
| 商圈 | place_amap_business_area_cache status=success |
| 收藏 | wishlist_items 中 auth.uid() 的存在性 |
| 封面 | 第一张可见缩略图的 photo ID + 宽高，不返回 object key |

重要：V2.3 表单的 visit_records.tags 已经是“吃得香 / 坐得住”等四维评价，绝不能聚合成“约会 / 聚会”等场景。当前“找灵感”的旧场景标签来源需要在 M1 数据审计中确认；legacy place_mark_scene_tags 只能作为有证据的兼容来源，不能为了保住筛选而虚构映射。若现有产品已不再采集场景标签，应在 V2.3 中隐藏该筛选，或另立字段和采集流程恢复；不能返回永远为空但仍可点击的筛选。

### 5.5 安全属性

RPC：

- language sql 或 plpgsql；
- security definer；
- stable（若实际语义满足）；
- set search_path = public；
- revoke all ... from public, anon；
- grant execute ... to authenticated；
- 不接收 group_id；
- 不返回用户 ID、昵称、邮箱、图片 object key 或高德安全信息；
- 单元 / migration 测试覆盖 anon、无会话、被移出成员、跨组、active member。

### 5.6 服务端加载结果

建议：

    type DiscoveryIndexResult =
      | {
          status: "complete";
          places: MapDiscoveryPlace[];
        }
      | {
          status: "empty";
          places: [];
        }
      | {
          status: "invalid_coordinates";
          places: DiscoveryPlace[];
          invalidCoordinateCount: number;
        }
      | {
          status: "overflow" | "error";
          places: DiscoveryPlace[]; // 可以供分页列表继续使用，但不能宣布完整地图
          reason: string;
        };

规则：

- status=complete 才允许动态地图进入 ready。
- empty 显示空状态，不必加载 SDK。
- invalid_coordinates 直接进入完整列表；有问题的行显示“位置待补充”，页面级提示说明地图暂不可用。埋点和日志只记录 invalidCoordinateCount，不记录地点 ID、名称或原始坐标。
- overflow / error 默认列表，并提示“地图暂时没打开，已为你切换到列表”；列表应继续使用可验证的 cursor 分页读法完成浏览，不能把部分数据当全量。
- 不把服务端数据库读取失败归类成 AMap 失败。

### 5.7 私有缩略图策略

为了让地图先可操作，新索引只返回封面 photo ID 和尺寸，不为所有地点预签名：

1. selectedPlaceId 变化时，将该 photo ID 加入待签名集合。
2. 抽屉 half / expanded 时，只签名当前可见 / 即将可见的最多 20 个 photo IDs。
3. 完整列表首屏可继续一次签名前 12–20 个。
4. 使用现有 /api/photos/sign，按 ID 去重并合并 50–100ms 内的批次。
5. URL 只存在内存；15 分钟过期后沿用 PrivatePhoto 的重签机制。
6. 地图拖动但抽屉处于 peek 时不签图片。
7. 不把 signed URL 放入共享缓存、埋点或日志。

若为了降低 V2.3 首次实现风险而暂时保留 server 签名前 12 张，也必须保证其不阻塞地图数据完整性，并在性能证据中明确。

## 6. 数据集合与纯函数

### 6.1 FilteredSet

保留 filterDiscoveryPlaces 作为唯一过滤入口，但进行以下重构：

- 参数和返回值改为 readonly DiscoveryPlace[]；
- MapPlace import 改为 src/lib/discovery/types；
- 每次返回新数组，避免 distance sort 原地修改 memoized 数据；
- 搜索字段和 RPC 返回字段一一对照测试；
- 场景字段按 M1 审计决定，不允许虚假筛选；
- 结果排序的稳定 tie-breaker 最后使用 place.id。

### 6.2 ViewportSet

新增纯函数：

    export function placesWithinBounds(
      places: readonly DiscoveryPlace[],
      bounds: MapBounds,
    ): DiscoveryPlace[];

边界规则：

- latitude 在 southWest.latitude 与 northEast.latitude 闭区间内；
- 正常 bounds 下 longitude 在 west 与 east 闭区间；
- west > east 时按跨 180° 经线处理，即 lng >= west 或 lng <= east；
- 无穷、NaN、纬度越界或经度越界视为非法 bounds，不更新上一次有效 ViewportSet；
- 边界上的点计入；
- 只做 O(n) 本地计算，500 点目标 <50ms；
- 最终按当前发现排序排列。

中国大陆场景几乎不会跨 180°，但纯函数应正确，避免把供应商合同写成隐式假设。

### 6.3 集合一致性断言

开发环境和测试必须提供：

    mapRepresentedIds === filteredIds
    listIds === filteredIds
    viewportIds === intersection(filteredIds, bounds)

生产不抛含私有 ID 的日志。生产只记录匿名计数差，例如 filteredCount、representedCount 及 mismatch=true。

## 7. 地图适配器实现

### 7.1 加载

仅在以下条件全部满足时动态 import：

- view=map；
- mapEnabled=true；
- data status=complete；
- places.length > 0；
- Server Component 已在 mapEnabled=true 时提供 JS API Key。

建议在 DiscoveryBrowser 中用 next/dynamic ssr:false 引入 DynamicMapAdapter。view=list 的构建 chunk 与网络瀑布不得包含高德 SDK。

loadAmap：

- 继续在 load 前设置 window._AMapSecurityConfig.serviceHost；
- 插件至少 AMap.Scale、AMap.MarkerCluster；定位按用户操作延迟加载 AMap.Geolocation；
- 包装 8,000ms SDK 加载超时；
- 同一个页面会话共享单一 Promise；
- 不在普通筛选失败时调用 loader.reset()；
- 只有用户显式“重试地图”且上一次加载已经彻底失败时，才允许一次受控 reset / reload；实现前验证 loader 版本行为；
- 任何错误先转为 MapFailure，再传上层。

官方参考：

- [地图 JS API 2.0](https://lbs.amap.com/api/javascript-api-v2/documentation)
- [MarkerCluster](https://lbs.amap.com/api/maps-javascript-api/reference/amap-marker/markercluster)
- [地图状态与 setFitView](https://lbs.amap.com/api/maps-javascript-api/guide/map/state)
- [Geolocation](https://lbs.amap.com/api/maps-javascript-api/guide/services/geolocation)
- [WGS84 转高德坐标](https://lbs.amap.com/api/javascript-api-v2/guide/transform/convertfrom)

### 7.2 实例生命周期

地图实例创建 effect 只能依赖：

- apiKey；
- retry generation；
- container 是否存在。

它不能依赖：

- pins；
- selectedPlaceId；
- sheetDetent；
- filters；
- viewport；
- signed photo URL。

使用单独 effects / imperative methods 完成：

- cluster.setData(nextData) 更新点；
- marker content / class 更新选中态；
- fitRequestKey 变化时 fit；
- padding 变化时重新计算安全位置；
- unmount 时 cluster.setMap(null)、解绑全部事件、clear timers、map.destroy()。

测试断言：连续筛选 10 次仍只 new AMap.Map 一次。

### 7.3 初始地图参数

建议起点：

    {
      viewMode: "2D",
      resizeEnable: true,
      zooms: [3, 19],
      zoom: 12,
      center: [116.397428, 39.90923],
      dragEnable: true,
      zoomEnable: true,
      touchZoom: true,
      rotateEnable: false,
      pitchEnable: false,
      showIndoorMap: false,
      isHotspot: false
    }

原因：

- 2D 足够且更可预测；
- 关闭热点，避免用户把高德底图上的公开 POI 误认为 Foodprint 可选地点；
- 禁止旋转 / 倾斜，减少移动端手势冲突；
- 保留底图文字与高德标识。

最终 mapStyle 先用标准 / 经官方允许的免费样式，视觉探索不得依赖付费自定义地图。

### 7.4 完成判定和超时

loader resolve 不等于地图可用。adapter 状态：

    idle → loading-sdk → creating-map → waiting-complete → ready
                                                   ↘ fatal
    ready → fatal（不可恢复运行错误）

- new Map 后注册 once complete；
- complete 在 8,000ms 内触发才调用 onReady；
- complete 后读取 getBounds / getCenter / getZoom，验证有限数值；
- 如先收到明确鉴权 / 代理错误，立即 fatal；
- fatal 必须幂等，最多通知上层一次；
- ready 后的单个瓦片慢请求不要轻易判全图 fatal；只有不可恢复的上下文 / 鉴权链路错误才切列表。

### 7.5 Pin 和聚合数据映射

MarkerCluster 官方输入至少为 lnglat / weight。业务 ID 映射必须经过一次实现 spike 验证，不能假定所有自定义字段都会原样出现在 renderMarker 回调。

建议顺序：

1. 在本地 spike 中确认 dataOptions 自定义 id / getExtData / click event.marker 的实际行为。
2. 若能稳定得到点数据，使用：

       { lnglat: [longitude, latitude], weight: bowlStrength ?? 1, placeId: id }

3. 若 renderMarker 不能稳定取业务 ID：
   - 为数据项生成局部 integer index；
   - 由 index → placeId Map 管理；
   - 或使用聚合 click 返回的 marker / 坐标，通过局部索引解析；
   - 不以地点名称做 key。
4. 同坐标多个地点必须保留多 ID；不得用 lng,lat 字符串作为唯一键覆盖。
5. maxZoom 先设 17 或 18，gridSize 先以 60px 为基线，在 320 / 390 / 430px 真机校准。
6. cluster click：
   - count > 1 且 zoom < maxZoom：计算聚合 bounds 并放大；
   - 最大级别或完全同坐标：打开 half，列表限定为该聚合集合，或在普通 ViewportSet 中明确高亮这些项；不得死循环放大。

正式视觉通过 `map-pin-assets.ts` 注册表和 `map-pin-elements.ts` DOM 工厂注入，不改数据和事件代码。单点优先使用高德 `anchor: "bottom-center"`；如适配层只能使用偏移，必须调用 `mapPinPixelOffset`。选择变化只替换对应 Marker content / class 并提高 zIndex，不重新创建 Map 或全量 cluster 数据。详细合同见 [正式 Pin 资产规范](./design/v2-3-map-pins/final/README.md)。

### 7.6 安全视野

地图 fit 必须考虑遮挡：

    top = 实际标题 + 搜索 / 筛选遮挡 + 12px
    right = 地图控件宽度 + 12px
    bottom = 当前抽屉可见高度 + 底部导航相关遮挡 + 12px
    left = 12px

- 用 ResizeObserver 获取抽屉实际高度，不硬编码唯一机型。
- 首次 / 筛选变化通过 getFitZoomAndCenterByBounds 或 setFitView 计算，maxZoom 建议 15–16。
- 单点使用 zoom 15 左右，不放到建筑级 19。
- 选中 Pin 时若被卡片遮挡，使用 lngLatToContainer / panBy 校正；不要每次选择都重新 fit 全部地点。
- expanded 抽屉只校正当前选中点与控件，不反复缩放地图。

### 7.7 地图事件

监听：

- complete；
- click（地图空白）；
- moveend；
- zoomend；
- 必要的 runtime error / WebGL context lost。

不监听或不用于业务更新：

- 高频 mapmove；
- mousemove；
- dragging 每一帧。

moveend 和 zoomend 可能在同一次缩放后都触发。使用 requestAnimationFrame + 100–150ms debounce 或等效 coalescer：

1. 清掉上一任务；
2. 读取一次中心、缩放、bounds；
3. 与上一归一化 viewport 比较；
4. 只有有效变化调用 onViewportSettled。

程序触发的 fit 也会产生事件。用 fit generation 标记，避免再次触发 fit，但仍允许最终 viewport 更新抽屉。

## 8. 发现页状态编排

### 8.1 URL 规则

解析：

    const requestedView = params.get("view") === "list" ? "list" : "map";

- view=map 作为旧链接兼容；
- 新地图链接删除 view 参数；
- 列表设置 view=list；
- 地图故障自动切列表时，在当前 React 状态中立即切换，并用 router.replace 写入 view=list，保留所有筛选；
- selectedPlaceId 从 SearchState 移到本地状态；
- 旧 ?place=id 可在首次进入时作为一次性兼容输入；验证它属于 FilteredSet 后选中，不继续把 Pin 操作写 URL；
- map center / bounds / zoom / detent / user origin 不写 URL。

### 8.2 状态机

建议 reducer：

    type MapModeState =
      | { kind: "map-loading"; retryGeneration: number }
      | { kind: "map-ready"; retryGeneration: number }
      | { kind: "list"; reason: "user" | "map-failure" | "disabled" | "data-incomplete" }
      | { kind: "empty" };

事件：

    OPEN_DEFAULT
    USER_SELECT_MAP
    USER_SELECT_LIST
    MAP_READY
    MAP_FATAL
    DATA_INCOMPLETE
    RETRY_MAP
    FEATURE_DISABLED

关键规则：

- MAP_FATAL 同一 generation 只处理一次；
- 失败后不自动 RETRY_MAP；
- USER_SELECT_MAP 在本会话已有失败时等同显式 retry；
- feature disabled 时不能通过 URL 强开；
- 数据不完整时不能启动地图；
- 用户主动 list 不显示故障 banner。

### 8.3 选择状态

- filteredIds 不再包含 selectedPlaceId 时立即清除。
- viewport settled 后选中点不在 bounds 内则清除。
- pin click：selectedPlaceId=id；sheet=card。
- map background click：selectedPlaceId=undefined；sheet=peek。
- list row click：selectedPlaceId=id；map adapter pan/select；sheet=card。
- 详情跳转前沿用 currentUrl 保存筛选和 view；不要保存精确地图位置。

### 8.4 视野数组性能

    const filteredPlaces = useMemo(...);
    const viewportPlaces = useMemo(
      () => viewport ? sort(placesWithinBounds(filteredPlaces, viewport.bounds), state.sort) : filteredPlaces,
      [filteredPlaces, viewport, state.sort],
    );

- Map / Set 索引通过 useMemo 构建；
- 不在 render 内反复 JSON.stringify 全量地点；
- pins 的坐标 / id 稳定投影单独 memo；
- signed photo URL 更新不应让 cluster.setData；
- 当前数据规模先用 O(n)，不要过早引入 PostGIS 或客户端 R-tree。

## 9. 底部抽屉实现

### 9.1 reducer

    type SheetDetent = "peek" | "card" | "half" | "expanded";

    type SheetState = {
      detent: SheetDetent;
      selectedPlaceId?: string;
      dragOffset: number;
    };

动作：

- SELECT_PLACE → card；
- CLEAR_SELECTION → peek；
- OPEN_HALF → half；
- OPEN_EXPANDED → expanded；
- COLLAPSE：expanded → half → selected ? card : peek；
- DRAG_START / DRAG_MOVE / DRAG_END；
- VIEWPORT_REMOVED_SELECTED → peek；
- ESCAPE：expanded → half → card/peek。

将 reducer 独立为纯函数，完整单测状态转换。不要把拖拽数学、选中地点、地图对象和 URL 逻辑混在一个 effect。

### 9.2 高度

CSS / JS 使用实际可视高度：

- peek：clamp(72px, 内容高度, 88px) + safe area；
- card：内容自然高度，上限约 240px；
- half：约 48dvh；
- expanded：顶部停在紧凑控制区下方，不能遮住地图 / 列表切换；
- 底部定位：var(--app-bottom-nav-height) + env(safe-area-inset-bottom)。

必须在 iOS Safari 动态地址栏和 PWA standalone 验证 dvh。不要只用 100vh。

### 9.3 拖拽

- 只在 handle / sheet header 捕获 Pointer Events；
- setPointerCapture 保证手指移出把手仍可结束；
- 列表内容正常 scroll，不捕获用于滚动的 pointer；
- drag end 根据位移和速度吸附最近 detent；
- 设 8–12px movement threshold，避免点击被误判拖拽；
- pointercancel / unmount 必须清理；
- prefers-reduced-motion 时禁用弹簧式动画；
- 仍提供按钮点击展开 / 收起，拖拽不是唯一入口。

不要为第一版引入重量级 drawer 依赖，除非评审确认包体、许可、SSR 和无障碍均优于自有轻量实现。

### 9.4 列表虚拟化

V2.3 的 ViewportSet 预期较小，不强制引入虚拟列表。规则：

- <=100 行使用普通列表和图片懒加载；
- 真实数据证明 >100 行且滚动掉帧后再评估虚拟化；
- 不因虚拟化破坏屏幕阅读器、焦点或详情返回位置。

### 9.5 卡片复用

不要直接把完整 DiscoveryPlaceCard 无修改塞进 220px 抽屉，它含管理控件、收藏、完整标签和大量内容。新增 MapPlaceCard：

- 复用 BowlIcon、PrivatePhoto、位置显示和详情链接；
- 信息密度按 Spec 收敛；
- 不在地图卡片放 Owner/Admin 下架控件；
- 收藏若保留，复用 WishlistToggle；
- 详情 returnTo 带筛选 / view，不带坐标。

## 10. 定位与坐标

优先使用 AMap.Geolocation：

    new AMap.Geolocation({
      enableHighAccuracy: false,
      timeout: 10_000,
      convert: true,
      zoomToAccuracy: false,
    });

说明：

- 只有用户触发才加载插件 / 请求权限；
- convert=true 确保输出为高德坐标；
- 不让插件自行 zoomToAccuracy，以免绕开抽屉安全边距；
- 回调成功后把 origin 放 controller 内存、显示用户位置点、必要时 sort=distance；
- 如果必须继续 navigator.geolocation，则先 AMap.convertFrom([lng, lat], "gps")，失败时不得混用坐标直接计算。

距离函数明确输入同一 GCJ-02 坐标系。位置失败不触发 MAP_FATAL；它只是定位功能失败。

## 11. 失败、降级与重试

### 11.1 分类表

| 失败 | 识别 | UI | 自动重试 |
| --- | --- | --- | --- |
| 功能开关 false | 服务端 prop | 列表默认；地图不可用 | 否 |
| public key 缺失 | render 前检查 | 列表 + 地图提示 | 否 |
| security key 缺失 | proxy 503 + 稳定错误码 | 立刻列表 | 否 |
| Origin 拒绝 | proxy / provider 403 | 立刻列表 | 否 |
| 代理限流 | 429 | 立刻列表 | 否 |
| SDK 网络失败 | loader reject | 列表 | 否 |
| SDK / complete 超时 | 8 秒 timer | 列表 | 否 |
| 用户拒绝定位 | geolocation error | 保留地图；轻提示 | 不适用 |
| 数据 RPC 不完整 | server result | 列表 | 否 |
| 单张照片失败 | PrivatePhoto | 卡片占位 / 重试 | 仅图片 |

### 11.2 用户重试

- banner 中“重试地图”是唯一会话内重试入口；
- 点击后清 map failure，retryGeneration + 1，切 map-loading；
- 最多允许连续 2 次手动重试；之后保留列表并提示稍后再试；
- 成功后清 banner；
- 不把重试次数写持久化存储；
- feature disabled / data incomplete 不显示无效重试。

### 11.3 不允许的降级

- 静态地图；
- 空白地图容器；
- 无限 loading；
- 失败后把公开 POI 结果代替 Foodprint 数据；
- 丢掉筛选再切列表；
- 通过 window.location.reload 重试；
- 把 403 / 429 文案直接展示给用户。

## 12. 高德同源代理与 Nginx

### 12.1 Next Route

src/app/api/amap/[...path]/route.ts 需要：

- 保留固定 _AMapService 前缀检查；
- 继续只允许 [a-zA-Z0-9/_-]+ 上游路径；
- 只允许 GET；
- AMAP_SECURITY_KEY 缺失返回稳定 JSON：error=amap_security_key_missing；
- 同源 Referer 不合法返回 origin_rejected；对高德 SDK 实测必须允许的无 Referer 请求记录设计理由，不能简单依赖可伪造 Referer 当认证；
- AbortController 12–15 秒上游超时；
- 只转发 accept 与确有必要的请求头；
- 不转发 Cookie、Authorization、真实用户信息；
- 不记录 upstream.toString()；
- 上游非 2xx 只记录状态 / 分类，不记录 body；
- 响应缓存只用于经验证可公开复用的底图配置；鉴权 / 错误 no-store；
- 加 X-Content-Type-Options: nosniff；
- 明确测试 path traversal、编码 slash、超长查询、重复 jscode 参数：服务端必须覆盖为自己的 secret。

不要把 AMAP_SECURITY_KEY 改成 NEXT_PUBLIC_*。

### 12.2 独立限流

在 deploy/nginx/foodprint-http.conf 新增起始配置：

    limit_req_zone $binary_remote_addr zone=foodprint_amap:10m rate=30r/s;

在通用 /api/ 之前新增：

    location ^~ /api/amap/_AMapService/ {
        limit_req zone=foodprint_amap burst=60 nodelay;
        # 其余 proxy headers / timeout 与受控 API 一致
    }

30r/s + burst 60 是首次本地 / 单账号网络瀑布测试的起始值，不是无需验证的最终值。M3 必须：

1. 冷启动抓取同一浏览器一次地图初始化的同源代理请求数和最大 1 秒突发；
2. 正常阈值至少覆盖 p99 突发的 2 倍；
3. 用异常脚本验证仍能产生 429；
4. 确认普通 /api/ rate limit 没有再次匹配该 location；
5. 记录最终值与证据。

隐私日志当前只记 $uri 而非 $request_uri，应保持，不得把查询串加回 access log。

### 12.3 域名和环境

生产检查（V2.3 目标）：

- JS API Key 白名单含 foodprint.com.cn；不依赖旧 Vercel 域名。
- APP_ALLOWED_ORIGINS 含 https://foodprint.com.cn，供地点搜索 Edge Function 使用。
- AMAP_JS_KEY 是正确 JS Key，只存在服务端运行时环境；地图开启时会作为页面配置送到浏览器，因此仍必须按公开 Key 管理并绑定域名。
- AMAP_SECURITY_KEY 是与该 JS Key 匹配的安全密钥。
- NEXT_PUBLIC_APP_URL=https://foodprint.com.cn。
- DISCOVERY_DYNAMIC_MAP_ENABLED=true。
- www.foodprint.com.cn 只 308 到主域，不作为应用 origin。

迁移规则：

- 当前生产仍可能使用 NEXT_PUBLIC_AMAP_KEY；V2.3 发布前先把同一 JS Key 写入服务器 AMAP_JS_KEY，再发布兼容读取、但只通过 Server Component 下发的新代码；
- 新代码验证后删除生产 NEXT_PUBLIC_AMAP_KEY，并从 public env schema、Docker build args、README 与模板移除；
- 兼容读取只能存在于这一发布窗口，并明确以 AMAP_JS_KEY 优先；不得永久保留双变量；
- 这不是把 JS Key 伪装成 Secret；价值是运行时开关可停止下发、Key 轮换不再要求重建镜像。AMAP_SECURITY_KEY 仍是绝不能进入浏览器的真正 Secret。

## 13. 功能开关

新增服务端读取，返回判别联合而不是彼此可能矛盾的 boolean + key：

    type DiscoveryMapRuntimeConfig =
      | { enabled: false }
      | { enabled: true; jsApiKey: string };

    export function readDiscoveryMapRuntimeConfig(
      env = process.env,
    ): DiscoveryMapRuntimeConfig {
      if (env.DISCOVERY_DYNAMIC_MAP_ENABLED === "false") {
        return { enabled: false };
      }

      const jsApiKey = env.AMAP_JS_KEY?.trim();
      return jsApiKey
        ? { enabled: true, jsApiKey }
        : { enabled: false };
    }

建议默认语义：

- 变量缺失：开发环境 true；生产发布模板明确写 true；
- 只有字面值 false 关闭；
- 在 page.tsx 读取；enabled=true 时才把 jsApiKey 作为地图运行配置传给客户端；
- 开关 false 或 JS Key 缺失时只传 { enabled:false }，RSC payload / HTML / 客户端 props 中不得出现 Key；
- 组件中不得直接读取 process.env.NEXT_PUBLIC_AMAP_KEY；
- 不使用 NEXT_PUBLIC_DISCOVERY_DYNAMIC_MAP_ENABLED，因为那需要重构建才能切换，失去运行时止血价值。

上面“开发环境 true”指开关默认语义；若 AMAP_JS_KEY 缺失，最终仍是 enabled=false 并进入列表，不能构造 enabled=true + 空 key。建议把 runtime config 放在 server-only 模块，并用测试证明该模块不会被客户端 import。

腾讯云修改环境变量后需滚动重启容器；这是运维开关，不是浏览器远程配置。

## 14. 监控与指标

### 14.1 复用现有管道

扩展 src/lib/performance/metrics.ts 的枚举：

    discovery_map_load
    discovery_map_ready
    discovery_map_failure
    discovery_map_fallback
    discovery_map_pin_select
    discovery_map_cluster_open
    discovery_viewport_sheet_open
    discovery_viewport_sheet_place_open
    discovery_map_retry

扩展维度应使用白名单枚举：

    mapStage: sdk_load | security_proxy | map_complete | runtime
    mapFailure: missing_key | origin | rate_limit | timeout | unavailable | unknown
    placeCountBucket: 0 | 1_20 | 21_100 | 101_500 | 501_plus
    sheetDetent: peek | card | half | expanded
    viewMode: map | list

如果当前 metrics API 不支持这些维度，先扩展严格 zod schema，再上报。不要把分类塞进自由文本 detail。

### 14.2 关键看板 / 日志查询

- map ready 成功率；
- map ready p50 / p75 / p95；
- 各阶段失败率；
- fallback 到列表率；
- 代理 403 / 429 / 5xx；
- 每日 / 每月地图初始化估算与高德控制台实际用量；
- 同一次页面 map init 次数分布；
- drawer 打开率和地点详情点击率，仅做匿名总量。

### 14.3 告警与配额动作

- 5 分钟地图 ready 成功率低于 90% 且样本 >=20：告警，评估关图；
- 代理 403 持续出现：关图并核对域名 / key；
- 内部 429 >0.5%：先确认恶意流量还是阈值误伤；
- 高德月额度到 80%：告警并复核增长速度；
- 预计本周期会超额或达到 90%：先 DISCOVERY_DYNAMIC_MAP_ENABLED=false；
- 不自动充值、不自动开包。

小规模私域样本不足时用人工冒烟与错误日志补充，不为了凑告警门槛采集私有字段。

## 15. 静态地图退出方案

### 15.1 V2.3 代码发布时

- map-browser 不再 import StaticMapAdapter。
- map-adapter 删除 StaticMapAdapter，或文件重构为动态合同。
- 删除 src/components/map/static-amap-map.tsx 的主分支引用。
- 测试断言 bundle / 源码运行路径没有 amap-static-map。
- Supabase 静态 Edge Function 不在发布命令和手册中。

代码文件可在 V2.3 合并时删除；Git 历史仍能恢复。

### 15.2 回滚窗口

V2.3 发布后前 7 天：

- 已部署的远端 amap-static-map Edge Function 可以暂时保留但不应有 V2.3 请求；
- 这样回滚到 V2.2 旧镜像时仍可使用旧链路；
- 监控确认远端调用量为 0。

稳定满 7 天且确认不再回滚到 V2.2 后：

- 删除远端 amap-static-map function；
- 删除 supabase/functions/amap-static-map 源目录；
- 更新 config、文档和检查测试；
- 记录删除时间、执行人和恢复方式（从 Git 旧版本重新部署）；
- 不删除历史 release / ADR 记录。

## 16. Pin 视觉工作包

### 16.1 已批准产出

    docs/design/v2-3-map-pins/
      README.md                         # 五套方向与 B 选择记录
      direction-a...e.png              # ImageGen 方向稿，仅用于历史评审
      final/
        README.md                       # 正式规范唯一真相源
        qa/
          map-pin-size-and-map-preview.png
          map-pin-small-size-grid.png
          render-map-pin-qa.mjs

    public/icons/map-pins/
      pin-level-{1,2,3}-{default,selected}.svg
      cluster-{default,active}.svg
      user-location.svg
      manifest.json

    src/lib/amap/
      map-pin-assets.ts
      map-pin-elements.ts

    tests/
      v2-3-map-pin-assets.test.ts

B「餐盘定位圆章」已于 2026-08-13 由产品负责人选定，正式 SVG 与工程注册表已制作完成。方向 PNG 不得成为运行依赖；正式地图接入必须使用 `/icons/map-pins/`。

### 16.2 技术约束

- `bowlStrength=1 / 2 / 3` 对应一 / 二 / 三层小碗和“值得去 / 想再去 / 会专门去”；
- 默认 40 × 45px，选中 48 × 54px，聚合 44 × 50px / 激活 48 × 54px，命中区域至少 44 × 44px；
- 单点和聚合锚点统一为 SVG 底部中心 `(0.5, 1)`，选中放大不能产生坐标跳动；
- 聚合数量 `1–99` 显示整数，超过 99 显示 `100+`；
- 选中状态同时改变尺寸与橙红轮廓，不只靠颜色；
- 用户位置使用蓝色圆点，与三级推荐和选中态分离；
- 避免在每个 marker 里嵌入大图、长 DOM 或远程请求；
- 资产只从本地 /public 读取，不使用临时外链；
- alt / aria-label 在可访问的并行文字列表表达；地图 marker DOM 不重复朗读大量内容；
- 通过 DOM API 创建 Marker content，不把私有地点名称插入 `innerHTML`；
- 运行路径调用注册表 / 工厂，禁止组件散写 SVG 路径；
- 已登记 `VISUAL_ASSET_REGISTRY.md`，真实地图接入后再更新为“已接入 / 已验收”。

完整状态、颜色、锚点、代码示例与剩余 QA 矩阵以 [正式资产规范](./design/v2-3-map-pins/final/README.md) 为准。

## 17. 测试方案

### 17.1 纯单元测试

必须覆盖：

- placesWithinBounds：普通边界、边界点、无效值、跨 180°；
- FilteredSet 各筛选和稳定排序；
- map / list / viewport ID 集合关系；
- 默认 URL map、view=list、旧 view=map；
- selectedPlaceId 被筛除 / 移出视野；
- map reducer 所有状态与重复 fatal 幂等；
- sheet reducer 所有 detent 与 drag threshold；
- WGS84 不得直接进入 distance 排序；
- failure mapping 不泄漏原始错误。

### 17.2 组件测试

jsdom 不加载真实高德。mock DynamicMapAdapter，覆盖：

- 首次默认 map；
- 用户切 list，再切 map；
- feature flag false 不渲染 adapter；
- data incomplete 不渲染 adapter；
- MAP_FATAL 自动 list、筛选保留、banner 出现；
- Retry 只增加 generation；
- pin select → card；
- 未选 pin 的 peek → half；
- viewport 回调更新 N 家；
- 列表 row → 选择 pin；
- map blank → 清除；
- 抽屉按钮的 aria-expanded；
- 320px 不出现横向溢出（样式 / 快照 + 人工）。

### 17.3 Adapter 合同测试

用手写最小 FakeAMap，不把真实 SDK 带进 Vitest：

- loader 仅一次；
- Map 构造仅一次；
- complete 前不 ready；
- complete timeout → fatal 一次；
- setData 更新不 destroy；
- moveend + zoomend 合并一次 viewport；
- invalid bounds 不上报；
- click single / cluster；
- unmount 解绑、清 timer、destroy；
- retry generation 允许重建；
- padding / fit maxZoom；
- 选中态变化不重建聚合数据（或只做最小样式更新）。

### 17.4 Migration / 权限测试

- migration 文件存在且只向前新增；
- function search_path 固定；
- anon / public revoke；
- authenticated grant；
- active member 只能拿当前小组；
- removed member 读取失败 / 空；
- 另一组数据不可见；
- pending / dismissed / archived / inactive_no_marks 排除；
- active 但无 current_opinion 排除；
- 离开作者的保留 current_opinion 仍参与当前小组汇总；
- 删除 / 隐藏到访内容不作为最新摘要 / 图片；
- 21、100、101、500 条的分页无漏 / 重；
- cursor 同时间 UUID tie-break；
- overflow 明确，不返回 complete；
- 坐标系字段只允许 GCJ-02；历史 WGS84 有显式修复 / 转换计划。

### 17.5 真实高德人工矩阵

设备 / 模式：

- iPhone Safari；
- iPhone 已安装 PWA；
- Android Chrome；
- Android 已安装 PWA（如实际支持）；
- macOS Chrome / Safari；
- 320、375、390、430px。

数据：

- 0、1、2、20、21、100、500 地点；
- 同坐标 2–5 家；
- 极近密集点；
- 跨北京远距离点；
- 长名称、无照片、无商圈、无推荐菜；
- 筛选 0 / 1 / 多结果。

交互：

- 拖、缩放、连续快速拖、旋转手势；
- cluster 点击；
- Pin 点选 / 切换；
- card / half / expanded；
- 列表内部滚动不拖地图；
- 抽屉拖动不滚列表；
- 定位允许 / 拒绝 / 超时；
- 详情返回；
- 横竖屏切换（产品可锁竖屏视觉，但不能破版）；
- 字体放大 / reduced motion / 键盘。

### 17.6 故障注入

- 删除 AMAP_JS_KEY 的本地运行环境；
- AMAP_SECURITY_KEY 缺失；
- 错误 Key；
- 高德白名单不含当前测试域名；
- proxy 人为 403 / 429 / 503；
- DNS / offline；
- SDK 延迟超过 8 秒；
- complete 不触发；
- Fake WebGL context lost；
- 数据 RPC 第 2 页失败；
- auth 过期；
- 图片签名失败。

每个场景验证：无静态地图、无死循环、列表可用、筛选保留、用户文案正确、日志无敏感信息。

## 18. 性能验证

### 18.1 采集点

    route commit
      → discovery index complete
      → map chunk requested
      → AMap loader resolved
      → Map constructed
      → complete
      → cluster data ready
      → map interactive

另采：

- Pin click → selected style；
- Pin click → card skeleton；
- sheet open → list rendered；
- moveend → viewport list committed；
- fatal → list interactive。

### 18.2 门槛

| 指标 | 门槛 |
| --- | --- |
| 每次发现页 map init | 1 |
| 500 点本地 viewport 计算 | 目标 <=50ms |
| Pin 选中视觉反馈 | <=100ms |
| 冷地图交互 p75 | <=5s |
| 暖地图交互 p75 | <=2.5s |
| 已知 HTTP fatal → 列表 | 立即，目标 <=500ms |
| 未知超时 → 列表 | <=8s |
| list 模式 AMap SDK | 0 byte / 0 request |
| 拖图触发 POI / reverse geocode | 0 |
| V2.3 静态地图请求 | 0 |

使用同设备、同网络、同账号数据量记录至少 5 次冷 / 5 次暖样本。不要用开发服务器数字代替生产构建。

## 19. 实施里程碑

### M0｜配置、条款与基线确认

目标：证明“可以上动态地图”，并把不能由代码解决的外部条件先锁定。

工作：

- 高德控制台复核 JS Key、security key、foodprint.com.cn 白名单；
- 复核账户主体 / 用途 / 免费额度；
- 对照实际页面复核用户协议、隐私政策、第三方地图服务告知、高德隐私规则入口，以及精确定位的主动触发与适用同意流程；
- 腾讯云环境变量盘点；
- 抓当前安全代理真实请求瀑布；
- 记录发现页地点数量分布、当前 20 条截断和性能基线；
- 确认静态远端函数回滚窗口。

完成门槛：

- 控制台和本地生产构建均能创建一个空白测试动态地图；
- 没有在仓库、截图或日志泄漏 secret；
- 实际运营主体确认第三方地图 / 定位告知已上线且与真实数据流一致；未通过时功能开关保持 false；
- 项目负责人确认继续使用当前高德账户和免费边界。

### M1｜数据语义与 Pin 视觉接入验证

目标：在写主 UI 前消除两处最大歧义。

工作：

- 审计 BaseSet：active 与 current_opinions；
- 审计场景筛选真实数据来源；
- 审计所有地点 coordinate_system；
- 使用已批准 B 正式资产完成 MarkerCluster 接入 spike，并在真实底图验证尺寸、锚点、聚合数字与 zIndex；
- 做 MarkerCluster 业务 ID 映射 spike。

完成门槛：

- 有脱敏计数证明 BaseSet 定义；
- 场景筛选保留 / 隐藏决定写入 PR；
- BaseSet 所有地点均已修复并验证为合法 GCJ-02；故障样本会返回 invalid_coordinates 并完整进入列表，不会被静默漏掉；
- B Pin 选择记录、正式资产规范、manifest、运行注册表和资产测试保留在仓库；
- 不存在临时 Pin 或方向 PNG 进入运行 bundle；
- cluster mapping spike 有测试结论。

### M2｜V2.3 读模型与纯状态

目标：先得到完整、可授权、可测试的一组地点。

工作：

- 新 migration + list_discovery_index_v2_3；
- 服务端游标循环和 completeness 状态；
- DiscoveryPlace 类型迁移；
- filter / viewport 纯函数；
- URL view 语义与 reducers；
- 权限、分页、集合一致性测试。

完成门槛：

- 21 / 100 / 101 / 500 条无漏点；
- map IDs / list IDs 的纯函数测试一致；
- anon、removed member、cross-group 测试通过；
- 旧 V2.2 RPC 保留，migration 可干净重放。

### M3｜动态地图 adapter 与基础设施

目标：建立不会因 UI 状态变化而反复初始化的 provider 边界。

工作：

- DynamicMapAdapter；
- loader / complete timeout；
- MarkerCluster；
- viewport 回调；
- fit / padding；
- click / cluster；
- geolocation 坐标转换；
- proxy timeout / error mapping；
- Nginx 独立限流；
- 地图 metrics。

完成门槛：

- FakeAMap 合同测试通过；
- 筛选 10 次只创建一个 Map；
- 地图动作不触发 POI；
- 代理正常启动无内部 429；
- 故障能稳定转 MapFailure。

### M4｜发现页默认地图、卡片与抽屉

目标：完成用户可用的核心体验。

工作：

- 默认 map / view=list；
- 地图 / 列表共享 FilteredSet；
- ViewportPlaceSheet 四 detents；
- MapPlaceCard；
- Pin / list / map / sheet 联动；
- 空、加载、筛选、定位和详情返回；
- 按需缩略图。

完成门槛：

- 用户无需点 Pin 即可拉开当前范围列表；
- 点 Pin 出卡片；
- 当前范围 N 与实际行数一致；
- 抽屉遮挡和手势在目标设备通过；
- 无横向溢出和底部导航遮挡。

### M5｜视觉接入验收、故障降级与静态链路退出

目标：把技术可用版本变成可发布版本。

工作：

- 将已制作的 B Pin 正式资产接入真实 Marker / MarkerCluster；
- 功能开关；
- fatal 自动 list + retry；
- 错误文案 / 埋点；
- 删除 V2.3 静态地图运行引用；
- 更新视觉台账、运行手册、环境模板。

完成门槛：

- 三级小碗、选中、聚合、用户位置与锚点按正式规范通过多底图 / 真机验收；
- 8 类故障注入通过；
- 关图后不发 Key、不载 SDK；
- 源码和生产请求均无静态地图调用。

### M6｜全量 QA、生产发布与观察

目标：用真实 foodprint.com.cn 和真实账号确认完成。

工作：

- npm run check；
- git diff --check；
- 干净数据库 migration 重放；
- 真实角色 / 真机 / PWA / 大陆网络矩阵；
- 性能采样；
- 手动生产 migration 与容器发布；
- 发布后冒烟；
- 7 天观察。

完成门槛：

- 验收清单全部通过或项目负责人书面接受已知限制；
- 无 RLS / 数据完整性 / key 泄漏问题；
- 7 天地图成功率、错误率、代理限流和配额趋势正常；
- 需要时完成回滚演练。

### M7｜静态远端能力退役

目标：稳定后删除已无运行价值的远端静态函数。

进入条件：

- V2.3 生产稳定至少 7 天；
- 不再计划回滚到依赖静态函数的镜像；
- 线上静态函数调用量为 0。

完成：

- 删除远端 Supabase amap-static-map；
- 删除源目录与发布说明；
- 更新 AMAP 手册；
- 记录可恢复方式。

## 20. 建议提交拆分

1. docs(v2.3): approve dynamic discovery map scope
2. db(v2.3): add complete authorized discovery index
3. refactor(discovery): move place types and add pure set / bounds logic
4. feat(map): add stable AMap adapter and clustering
5. infra(amap): harden security proxy and dedicated nginx limits
6. feat(discovery): make map default and add viewport sheet
7. feat(map): add selected place card and on-demand thumbnails
8. feat(map): add failure fallback, retry, feature flag and metrics
9. design(map): add approved pin assets and registry entry
10. test(v2.3): add permissions, adapter, UI and failure matrix
11. chore(map): remove static map runtime and update runbooks

每个提交保持单一目的。数据库 migration 与消费它的应用代码可以在同一 PR，但不得在旧应用不兼容的顺序下直接发布。

## 21. 文件级改动清单

### 必改

- src/app/page.tsx
- src/components/map/map-browser.tsx（可迁至 discover/discovery-browser.tsx）
- src/components/map/map-adapter.tsx
- src/components/map/amap-map.tsx（重构或替换）
- src/lib/amap/load-amap.ts
- src/lib/env.ts（移除 public JS Key；新增 / 复用 server-only runtime config）
- src/app/api/amap/[...path]/route.ts
- src/lib/discovery/server.ts
- src/lib/discovery/search-state.ts
- src/lib/discovery/types.ts（新增）
- src/lib/discovery/viewport.ts（新增）
- src/lib/performance/metrics.ts
- src/app/api/metrics/route.ts
- src/app/globals.css
- src/app/map/page.tsx（旧 redirect 改为 /）
- deploy/nginx/foodprint-http.conf
- deploy/nginx/foodprint.conf
- deploy/production.env.example
- README.md（同步 V2.3 环境变量与静态地图退出）
- 对应 tests
- 新 V2.3 migration

### 新增建议

- ViewportPlaceSheet / reducer
- MapPlaceCard
- DynamicMapAdapter provider wrapper
- map failure mapping
- Pin / cluster render components
- docs/design/v2-3-map-pins

### 稳定期后删除

- src/components/map/static-amap-map.tsx
- StaticMapAdapter
- supabase/functions/amap-static-map
- 静态地图部署命令和运行手册条目

若主代码发布时直接删除本地静态文件也可以，但远端函数仍按 7 天窗口处理。

## 22. 发布顺序

遵守 RELEASE_SOP 的单生产流程：

1. PR CI：lint、typecheck、test、build、migration 静态检查。
2. 本地生产构建 + 真实高德 Key 冒烟；不要连接 Production 做写入测试。
3. 项目负责人批准 PR，并确认实现没有偏离已批准的 B Pin 正式规范。
4. 手动在生产应用向前 migration。
5. 验证新 RPC 的 active member / removed member 结果。
6. 更新腾讯云环境变量，包括 DISCOVERY_DYNAMIC_MAP_ENABLED=true。
7. 更新 Nginx 配置并先 nginx -t。
8. 构建、发布新容器。
9. 真实 foodprint.com.cn 验证默认地图、Pin / cluster、抽屉、列表一致、关图演练、地点搜索与导航。
10. 监控 30 分钟，无严重错误后结束发布窗口。
11. 进入 7 天观察。

数据库 migration 一旦生产应用，不做破坏性 down migration。应用回滚到兼容旧 RPC 的上一镜像；新函数留在数据库中。

## 23. 回滚

### 23.1 首选止血

    DISCOVERY_DYNAMIC_MAP_ENABLED=false
    → 重启应用容器
    → 发现页默认列表
    → 不加载动态 / 静态地图

适用：高德故障、配额风险、地图 UI 严重 bug、代理异常。

### 23.2 应用回滚

- 回到上一通过验收的容器镜像；
- 新 V2.3 RPC / migration 留存；
- 若上一镜像依赖 amap-static-map，7 天窗口内远端函数仍在；
- 验证列表、搜索、详情、记录、图片。

### 23.3 Nginx 回滚

- 恢复上一已验证配置；
- nginx -t 后 reload；
- 不改证书、DNS 或数据库；
- 如果只因地图限流误配，可先关闭地图而不回滚整站。

### 23.4 不允许

- drop V2.3 function / columns 作为紧急数据库回滚；
- 删除用户数据；
- 恢复 Vercel 为临时地图方案；
- 把 security key 放浏览器绕过 proxy；
- 临时购买流量包而不经过产品决定。

## 24. Codex 执行指令

开始编码前：

1. 完整阅读产品 Spec、本文、验收清单、ADR、RELEASE_SOP、AMAP_FREE_TIER_POLICY 和 AMAP_OPERATIONS_RUNBOOK。
2. 先运行 git status；保留用户已有改动。
3. 先完成 M0 / M1 的只读审计，把发现写入 PR 说明。
4. Pin 已选定为 B「餐盘定位圆章」；必须使用 `public/icons/map-pins/` v2.3.0 正式资产和配套注册表，不得创建 temporary Pin 或擅自变更方向。
5. 若场景筛选数据语义无法从当前 schema 确认，停止该小项并提交证据；不要伪造字段。

编码时：

- 只新增向前 migration；
- 不连接 Production 写数据；
- 不提交 secret、真实位置、真实用户数据和控制台截图；
- 不在地图拖动时查高德 POI；
- 不引入静态地图；
- 不让 props 更新重建 AMap；
- 不为了“列表完整”一次签名所有图片；
- 不引入与 V2.3 无关的视觉 / 数据平面重构；
- 所有外部 SDK 行为以当前官方文档和本地 spike 验证，不靠记忆猜类型；
- 每个阶段先补测试再合并下一层。

交付时必须附：

- 变更摘要；
- migration 名称和安全评审；
- 地图 / 列表 / 抽屉 ID 一致性证据；
- 真实设备截图 / 录屏；
- Pin 选择记录；
- 失败注入结果；
- 性能前后数据；
- Nginx 最终限流依据；
- 功能开关和回滚演练；
- 未完成事项和风险。

## 25. Definition of Done

只有以下全部为真，V2.3 才能从“待开发”改为“已关闭”：

- 产品 Spec 没有被实现偏移；
- 数据完整性和 RLS 已证明；
- 默认地图、拖拽、缩放、聚合、卡片和视野抽屉可用；
- 地图、完整列表和抽屉集合关系正确；
- 定位坐标系正确且不持久化；
- 地图失败自动列表，功能开关有效；
- 正式 Pin 已批准；
- 高德域名、代理、限流、日志、额度、条款、隐私告知和定位同意门槛复核通过；
- list 模式不载地图 SDK，V2.3 不请求静态地图；
- 自动化、真机、PWA、故障、性能、生产冒烟通过；
- 7 天观察无阻塞问题；
- 静态远端函数按约定退役或有明确待执行日期和负责人。
