# 食迹 Foodprint｜规格与交付索引

> 更新日期：2026-08-10
> 使用方式：开发从上至下推进。每一项由项目负责人明确批准后，才可将状态改为“开发中”并开始代码变更。

## 1. 总体交付链路

P0 地图可靠性与安全基线 → V1.2 发现与去试试 → V1.3 记一顿与地点详情 → V1.4 字体与文案收束 → V2 大陆部署与地图体验 → V2.1 低延迟与 PWA 用户体验 → V2.2 启动、跳转与私有图片性能 → V3 视觉系统与精致表达

P0 是最初的地图阻塞基线：V1.2 的地点检索入口依赖稳定高德服务。V2 不能因为想做动态地图而跳过 V1.3 的地点生命周期与权限基础。当前性能工作按 V2.1 → V2.2 推进；V3 只负责视觉和表达，不回头改写已验证的产品数据逻辑，也不替代 V2.2 的性能验收。

## 2. 文档地图

| 文档 | 状态 | 用途 | 进入条件 |
| --- | --- | --- |
| PRODUCT.md | 生效 | 长期产品意图、语言、信息架构和不变约束 | 无 |
| ROADMAP.md | 生效 | 版本顺序、依赖和状态 | 无 |
| specs/2026-07-p0-amap-reliability-security.md | 已关闭（2026-07-28） | 高德来源配置治理、降级和运维 | 已完成 |
| decisions/2026-07-02-amap-origin-service-boundary.md | 已记录 | 地图 Key、Origin 和代理边界 | P0 实施前复核 |
| AMAP_OPERATIONS_RUNBOOK.md | 生效 | 地图故障、发布、配额和密钥操作 | 每次地图/域名发布 |
| decisions/2026-08-03-free-tier-release-pipeline.md | 已确认，待外部配置完成后启用 | 免费版单生产、GitHub Actions、凭据与手动发布顺序 | 每次数据库、Edge Function 或部署改动 |
| RELEASE_SOP.md | 已确认，待外部配置完成后启用 | 免费版日常开发、迁移、验收、发布与失败处理唯一流程 | 每次进入 GitHub 的正式迭代 |
| specs/2026-07-v1-2-discovery-try-list.md | 待批准 | 发现、去试试、下回吃与候选流转 | P0 验收、生命周期工程设计 |
| decisions/2026-07-01-place-lifecycle-recommendation-model.md | 已记录 | 地点状态、重复到访和汇总原则 | V1.2/V1.3 实施前复核 |
| specs/2026-07-v1-3-record-a-meal.md | 待批准 | 记一顿、三级小碗、地点详情和饭后聊 | V1.2 稳定、迁移评审 |
| specs/2026-07-v1-3-1-discovery-polish.md | 开发完成，待 Preview 验收（2026-07-30） | 发现卡片、三级小碗、搜索筛选和商圈兼容 | V1.3 验收反馈 |
| specs/2026-07-v1-3-2-try-flow.md | 开发完成，待 Preview 验收（2026-07-30） | 去试试导航、附近搜索、分类和完整转正流程 | V1.3.1 规则复用 |
| VISUAL_ASSET_REGISTRY.md | 生效 | 全产品视觉资产、图标、插画的状态与开发门禁 | 每次视觉与页面迭代 |
| COPY_VOICE_SYSTEM.md | 生效 | 品牌语气、页面标题、功能文案和状态文案台账 | 每次新增或修改用户可见文字 |
| FOODPRINT_V1_3_X_ITERATION_HANDOFF_2026-07-29.md | 生效 | V1.3.1/V1.3.2 已确认规则、完成情况与下次开发顺序 | 下一次小迭代开发前 |
| FOODPRINT_V1_3_3_DEVELOPMENT_HANDOFF_2026-07-30.md | 待批准后使用 | V1.3.3 产品、视觉、管理权限与开发顺序总交接 | V1.3.3 编码前 |
| specs/2026-07-v1-4-typography-and-copy-workbook.md | 已批准，待开发 | 全页面已定稿功能文案、创意标题与字体使用基线 | V1.4 开发交接单 |
| FOODPRINT_V1_4_DEVELOPMENT_HANDOFF_2026-08-03.md | 已批准，待开发 | V1.4 字体、文案、品牌化清洁与实施/验收顺序 | 开始 V1.4 编码前 |
| specs/2026-07-v2-mainland-maps-compliance.md | V2-A 已发布，进入稳定期 | 腾讯云/.com.cn 迁移、动态地图与私域运营边界 | 角色化回归、稳定观察、恢复演练 |
| FOODPRINT_V2_MAINLAND_DOMAIN_MIGRATION_DEVELOPMENT_HANDOFF_2026-08-05.md | V2-A 已实施，作为当前线上交接 | V2 域名迁移、腾讯云部署、发布/回滚和验收的唯一交接 | 自动化发布与稳定期收口 |
| decisions/2026-08-05-v2-domain-runtime-and-data-plane-boundary.md | 已确认并执行（V2-A）；V2-B 待立项 | V2 先迁应用运行环境、数据平面另立 V2-B 的架构边界 | 数据平面迁移另行立项 |
| specs/2026-08-icp-filing-display.md | 已完成（2026-08-06） | 首页全局 ICP 备案号、工信部查询链接和后续公安备案展示边界 | 公安联网备案信息另立小任务 |
| FOODPRINT_V2_1_PERFORMANCE_UX_DEVELOPMENT_HANDOFF_2026-08-06.md | 仓库实现完成，真实体验未达标 | 第一阶段低延迟、页面转场、PWA 公开启动壳、远程请求链路和性能指标 | V2.2 接续修正并完成真机/线上验收 |
| FOODPRINT_V2_2_PERCEIVED_PERFORMANCE_MEDIA_DEVELOPMENT_HANDOFF_2026-08-10.md | 仓库实现已落地，验收未通过 | PWA 持续启动壳、真实导航完成、路由读模型、私有缩略图、字体/资源预算、验收与回滚 | 干净库重放、同设备前后基线、向前兼容 migration、真实手机和大陆网络；见 [实现记录](./releases/2026-08-10-v2-2-performance-media-implementation.md) |
| specs/2026-07-v3-editorial-visual-system.md | 待立项 | 视觉系统、纸张感时间线、小碗图标 | V2.2 稳定、真实用户反馈 |
| SECURITY_COMPLIANCE_BASELINE.md | 生效 | 安全、隐私、用户权利和大陆发布检查 | 涉及数据、内容、部署的每个版本 |

## 3. 建议的批准节奏

1. 先批准 P0；完成后用真实页面和真机确认高德恢复，再讨论 V1.2 的未决产品选项。
2. V1.2 上线并观察候选地点真实使用后，确认 V1.3 的迁移字段、用户退出后的历史可见性和图片限制。
3. V2-A 已完成 DNS 切流；当前优先完成角色化业务回归、7 天稳定观察、恢复演练和 GitHub Actions 腾讯云发布管道。
4. V2.1 已完成仓库内第一阶段性能/UX 改造，但 2026-08-10 真实使用仍有约 10 秒 PWA 白屏、页面跳转慢和图片慢，不能按原验收直接关闭。
5. 项目负责人批准 V2.2 后，先修指标语义和采集同设备基线，再按启动 → 字体/资源 → 导航 → 读模型 → 私有 thumbnail → 真实设备/7 天观察推进；不把完整数据平面迁移混入本版本。
6. V3 以 V2.2 稳定后的用户反馈和设计探索为输入，先出可点击原型/视觉基线，再实施。

## 4. 全版本工程检查

每个版本提交前都需要：范围未扩大检查、迁移向前兼容检查、RLS/Storage 权限测试、第三方 Key/Origin 核对、类型/Lint/测试/构建、干净数据库 migration 重放、桌面与手机人工验收、错误降级验证、发布记录、回滚步骤和已知限制。数据库或部署改动还必须通过 RELEASE_SOP 的 PR CI → 项目负责人手动 Production 发布顺序。

## 5. 文档归档规则

正式产品、规格、ADR、脱敏运行手册与验收结论提交 GitHub；密钥、控制台证据、真实用户数据、备案材料与本机 Codex 临时笔记只留本地。详见 DOCUMENT_GOVERNANCE.md。
