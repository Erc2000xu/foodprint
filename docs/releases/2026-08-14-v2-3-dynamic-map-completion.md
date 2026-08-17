# Foodprint V2.3「发现页动态地图」开发收束总结

> 项目：食迹 Foodprint
> 版本：V2.3 发现页动态地图
> 发布日期：2026-08-14
> 状态：已完成开发、生产部署和正式前台验收
> 正式入口：[https://foodprint.com.cn/?view=map](https://foodprint.com.cn/?view=map)

## 1. 最终结论

Foodprint V2.3「发现页动态地图」已经完成并进入正式生产环境。

本次版本已经实现并验证：

- 发现页默认进入真正可拖动、可缩放、可点选的高德动态地图；
- 地图、完整列表和当前视野抽屉使用同一组 Foodprint 授权地点数据；
- 地图 Pin、聚合点、地点卡片和底部视野抽屉可以联动；
- 搜索、地区、菜系、灵感、人均和排序在地图 / 列表之间保持一致；
- 动态地图加载失败时自动降级为完整列表，不显示静态地图占位；
- 高德、Supabase 和腾讯云生产配置已经完成；
- 用户已在正式 foodprint.com.cn 页面完成前台验收并确认通过。

当前线上应用版本提交为：

    2e2f747152e2ec8dfbdfc87c91dfaf63c51ca523

这不是 Preview 或临时测试版本，而是腾讯云生产服务正在运行的正式版本。

## 2. 产品目标与最终行为

本版本把发现页改造成“朋友共同推荐地点地图”。用户打开发现页后，可以从地图分布探索地点，也可以随时切换到完整列表。

Foodprint 使用高德的底图和地图交互能力，但不把自己变成公开餐厅黄页。地图只展示当前用户在当前有效小组中有权限看到、且已经形成正向推荐的地点。

最终行为：

- / 或没有 view 参数时，默认进入地图；
- /?view=map 进入地图；
- /?view=list 进入完整列表；
- 地图可以拖动和缩放，移动后更新“当前范围 · N 家”；
- 点击单个 Pin 后打开地点卡片，不立即跳详情；
- 点击聚合点后优先放大地图，无法继续放大时通过抽屉列出聚合地点；
- 上拉底部抽屉可以查看当前视野内的地点；
- 地图和列表切换时保留搜索、筛选和排序条件；
- 地图发生致命错误、数据不完整或功能开关关闭时，进入列表模式；
- V2.3 不再使用静态地图图片作为运行时兜底。

## 3. 技术实现

### 3.1 统一数据集合

发现地点按三层集合处理：

    当前用户 + 当前有效小组
                ↓
    BaseSet：active 且有正向推荐的全部地点
                ↓ 搜索 / 筛选 / 排序
    FilteredSet：当前筛选后的全部地点
                ↓ 与地图 bounds 求交
    ViewportSet：当前地图视野内的地点

核心一致性约束：

- 地图 Pin / 聚合点的地点 ID 集合等于 FilteredSet；
- 完整列表的地点 ID 集合等于 FilteredSet；
- 底部视野抽屉的地点 ID 集合等于 ViewportSet；
- 地图拖动只改变 ViewportSet，不改变筛选结果；
- “去试试”、dismissed、archived、其他小组和无正向推荐地点不进入地图；
- 坐标缺失、非法、坐标系未知或不能转换为有效 GCJ-02 时，地图降级为列表但保留完整地点数据。

### 3.2 服务端与数据库

新增完整发现索引 RPC：public.list_discovery_index_v2_3。

它具备：

- 根据当前登录身份和有效小组上下文读取；
- 不接受浏览器传入任意 group_id 扩大读取范围；
- 使用 created_at + id 稳定游标分页；
- 有分页上限和 overflow 状态；
- 固定 search_path 为 public；
- 撤销 public / anon 执行权限，仅向 authenticated 授予所需权限；
- 返回地图、列表、筛选和卡片所需的统一字段。

对应 migration：

[supabase/migrations/20260813120000_v2_3_discovery_map_index.sql](../../supabase/migrations/20260813120000_v2_3_discovery_map_index.sql)

### 3.3 前端地图边界

主要职责分层：

- map-browser.tsx：发现页状态、URL 筛选、地图 / 列表切换和降级；
- lazy-map-adapter.tsx：只在需要地图时懒加载适配器；
- map-adapter.tsx：高德实例、Marker、聚合、地图事件和视野回调；
- viewport-place-sheet.tsx：peek、card、half、expanded 四种抽屉状态；
- viewport.ts：视野 bounds 与地点集合求交；
- map-state.ts：默认地图、列表降级和重试状态；
- load-amap.ts：SDK 加载、安全代理、超时和失败状态；
- map-failure.ts：地图错误阶段、可重试性和用户提示。

地图实例不会因为筛选结果变化而整棵销毁重建，地点集合通过适配器更新，以减少卡顿、状态丢失和重复初始化。

### 3.4 Pin 资产

V2.3 使用已经确认的 B「餐盘定位圆章」正式资产：

- 一 / 二 / 三层小碗对应三档推荐强度；
- 默认态和选中态使用不同 SVG；
- 聚合数字代表 Foodprint 推荐地点数量，不代表高德公开 POI 数量；
- 用户位置使用独立蓝色定位点；
- Marker 具备可访问标签和触控命中区域；
- 资产从 public/icons/map-pins/ 统一注册表加载。

## 4. 主要文件

地图与发现页：

- [src/components/map/map-browser.tsx](../../src/components/map/map-browser.tsx)
- [src/components/map/lazy-map-adapter.tsx](../../src/components/map/lazy-map-adapter.tsx)
- [src/components/map/map-adapter.tsx](../../src/components/map/map-adapter.tsx)
- [src/components/map/viewport-place-sheet.tsx](../../src/components/map/viewport-place-sheet.tsx)
- [src/components/map/viewport-place-sheet-reducer.ts](../../src/components/map/viewport-place-sheet-reducer.ts)
- [src/lib/discovery/types.ts](../../src/lib/discovery/types.ts)
- [src/lib/discovery/server.ts](../../src/lib/discovery/server.ts)
- [src/lib/discovery/viewport.ts](../../src/lib/discovery/viewport.ts)
- [src/lib/discovery/map-state.ts](../../src/lib/discovery/map-state.ts)

高德与地图资产：

- [src/lib/amap/load-amap.ts](../../src/lib/amap/load-amap.ts)
- [src/lib/amap/map-failure.ts](../../src/lib/amap/map-failure.ts)
- [src/lib/amap/map-pin-assets.ts](../../src/lib/amap/map-pin-assets.ts)
- [src/lib/amap/map-pin-elements.ts](../../src/lib/amap/map-pin-elements.ts)
- [src/app/api/amap/[...path]/route.ts](../../src/app/api/amap/%5B...path%5D/route.ts)
- [public/icons/map-pins/](../../public/icons/map-pins/)

测试：

- [tests/v2-3-discovery-index.test.ts](../../tests/v2-3-discovery-index.test.ts)
- [tests/v2-3-map-geometry.test.ts](../../tests/v2-3-map-geometry.test.ts)
- [tests/v2-3-map-pin-assets.test.ts](../../tests/v2-3-map-pin-assets.test.ts)
- [tests/v2-3-map-state.test.ts](../../tests/v2-3-map-state.test.ts)
- [tests/env.test.ts](../../tests/env.test.ts)

发布与运维：

- [.github/workflows/release.yml](../../.github/workflows/release.yml)
- [deploy/server/foodprint-install-release](../../deploy/server/foodprint-install-release)
- [deploy/README.md](../../deploy/README.md)
- [deploy/production.env.example](../../deploy/production.env.example)
- [deploy/compose.production.yml](../../deploy/compose.production.yml)
- [deploy/nginx/foodprint.conf](../../deploy/nginx/foodprint.conf)
- [deploy/systemd/foodprint-compose.service](../../deploy/systemd/foodprint-compose.service)

## 5. 外部配置与安全边界

### 5.1 高德

生产使用高德 Web 端（JS API）Key，域名白名单为：

    foodprint.com.cn

www.foodprint.com.cn 由 Nginx 跳转到规范主域，不作为第二个地图应用 Origin。

生产运行时配置名为：

    AMAP_JS_KEY=<生产 Web 端 JS API Key>
    AMAP_SECURITY_KEY=<与 JS Key 匹配的 JS 安全密钥>
    DISCOVERY_DYNAMIC_MAP_ENABLED=true

其中：

- AMAP_JS_KEY 只在地图功能开启时按需下发；
- AMAP_SECURITY_KEY 只在腾讯云服务端安全代理中使用；
- JS 安全密钥不进入浏览器 bundle、HTML、日志、Git 或聊天；
- 高德 Web Service Key 与 JS API Key 是两条不同链路，不能混用。

### 5.2 Supabase

已完成：

- V2.3 数据库 migration 发布；
- 生产 amap-poi-search Edge Function 发布；
- Edge Function Secret 中的 Web Service Key 配置；
- APP_ALLOWED_ORIGINS=https://foodprint.com.cn；
- Auth Site URL 和回调地址切换到正式域名。

后续不需要在 Supabase SQL Editor 中重复粘贴 V2.3 migration。schema 变更继续走新的向前 migration 和发布 workflow。

### 5.3 GitHub Actions

敏感值只保留在 GitHub Actions Secrets 或腾讯云受控环境中。涉及的 Secret 名称包括：

- SUPABASE_ACCESS_TOKEN
- SUPABASE_PROJECT_ID
- SUPABASE_DB_PASSWORD
- TENCENT_HOST
- TENCENT_DEPLOY_USER
- TENCENT_SSH_PRIVATE_KEY
- TENCENT_KNOWN_HOSTS
- PRODUCTION_NEXT_PUBLIC_SUPABASE_URL
- PRODUCTION_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

正式发布从 main 手动启动，并精确输入 DEPLOY_PRODUCTION。本文不记录任何 Secret 的实际值。

## 6. 发布过程与故障修复

### 6.1 已通过的发布门禁

1. Audit production migration history 成功；
2. Verify legacy migration state 成功；
3. 应用验证通过：30 个测试文件、82 个测试结果全部通过；
4. migration integrity 通过；
5. production migration dry-run 和正式 push 成功；
6. 生产 amap-poi-search Edge Function 发布成功；
7. Docker 生产镜像构建和发布包打包成功。

### 6.2 原始失败原因

首次 Release production 执行时，大文件上传已经完成，但腾讯云安装步骤报错：

    foodprint-install-release: missing foodprint-image.tar in release bundle

远端压缩包实际完整，包含：

    foodprint-image.tar
    deploy/compose.production.yml
    deploy/nginx/foodprint-http.conf
    deploy/nginx/foodprint.conf

真正的问题是旧安装器在 set -o pipefail 下使用 tar | grep 校验目录。grep 提前找到匹配项后退出，tar 可能收到 SIGPIPE，整个 pipeline 被判定为失败，于是完整发布包被误判为缺少文件。

### 6.3 修复方式

修复后的安装器先将压缩包目录写入临时清单文件，再对清单文件执行白名单和必需文件校验。这样消除了 tar | grep 的 SIGPIPE 误判，同时保留发布包白名单、Docker 镜像加载、Nginx 检查、systemd 健康检查和失败回滚。

安装器修复已通过 [PR #31](https://github.com/Erc2000xu/foodprint/pull/31) 合并到 main。

### 6.4 生产恢复结果

为避免重复等待大文件上传，修复后的安装器直接复用了已经上传到腾讯云的发布包。最终确认：

- foodprint-compose.service 状态为 active；
- nginx -t 通过；
- 安装器检查输出 foodprint release target is ready；
- 正式健康接口返回 {"status":"ok","service":"foodprint"}。

GitHub Actions 中的旧失败记录仍会保留，这是历史执行记录，不代表当前生产状态失败，也不需要为了改变历史颜色而重复上传同一个发布包。

## 7. 验证与正式验收

### 7.1 自动验证

| 验证项 | 结果 |
| --- | --- |
| 应用测试文件 | 30 / 30 通过 |
| 测试断言 | 82 / 82 通过 |
| migration integrity | 通过 |
| production migration audit | 通过 |
| legacy migration state verification | 通过 |
| POI Edge Function 发布 | 通过 |
| 腾讯云 systemd 服务 | active |
| Nginx 配置 | 通过 |
| 正式 /api/health | 通过 |

### 7.2 正式前台验收

用户已在正式域名完成验收并确认通过，重点确认：

- 页面进入的是动态地图而不是静态图片；
- 地图可以拖动；
- 地图可以缩放；
- 地图标记可以点击；
- 地图与发现页列表交互符合预期。

因此 V2.3 产品验收状态为：**通过**。

## 8. 后续日常操作

当前不需要定期在 Supabase SQL Editor、腾讯云终端或高德控制台重复执行固定命令。

后续正常发布只需要：

1. 从 main 创建开发分支；
2. 完成代码、测试、migration 和文档；
3. 通过 PR 和 CI；
4. 在 GitHub Actions 手动运行 Release production；
5. 输入 DEPLOY_PRODUCTION；
6. 发布后打开正式域名做前台验收。

日常只需关注高德配额和白名单、Supabase / 腾讯云服务、/api/health、地图降级告警，以及 production.env 的 0600 权限。

如需紧急关闭动态地图，将生产运行时开关改为 DISCOVERY_DYNAMIC_MAP_ENABLED=false，并按正常生产重启 / 发布流程使配置生效。关闭后应用默认使用完整列表，不需要删除 migration 或回滚数据库。

## 9. 稳定观察期事项

这些事项不阻塞 V2.3 已完成和已验收，但建议纳入后续运维：

- 观察高德地图初始化量、失败率和免费额度；
- 观察地图降级列表的匿名错误指标；
- 确认旧 amap-static-map Edge Function 在观察期内没有活动调用；
- 稳定观察期结束后按运维文档退役旧静态地图函数；
- 后续新增地点字段或权限规则时，同步更新 RPC、类型、筛选、地图、列表和验收测试。

## 10. 关联文档

- [V2.3 产品规格](../specs/2026-08-v2-3-dynamic-discovery-map.md)
- [V2.3 开发交接](../FOODPRINT_V2_3_DYNAMIC_MAP_DEVELOPMENT_HANDOFF_2026-08-12.md)
- [V2.3 验收清单](../acceptance/V2_3_DYNAMIC_MAP_ACCEPTANCE_CHECKLIST_2026-08-12.md)
- [V2.3 Pin 正式资产规范](../design/v2-3-map-pins/final/README.md)
- [生产发布 SOP](../RELEASE_SOP.md)
- [腾讯云部署说明](../../deploy/README.md)

## 11. 收束声明

Foodprint V2.3 已完成从“静态地图占位”到“正式可交互动态地图”的完整闭环：产品约束、授权数据、数据库索引、地图适配器、失败降级、密钥白名单、生产发布、故障修复和正式验收均已落地。

本版本可以作为正式生产基线继续运营。后续开发应以 main 和本文所列的 V2.3 产品规格、验收清单及运维 SOP 为准，不再回到静态地图实现，也不绕过 GitHub Actions 直接修改生产代码或数据库。
