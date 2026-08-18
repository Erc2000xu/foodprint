# 食迹 Foodprint｜规格与交付索引

> 更新日期：2026-08-18
> 使用方式：开发从上至下推进。每一项由项目负责人明确批准后，才可将状态改为“开发中”并开始代码变更。

## 1. 总体交付链路

P0 地图可靠性与安全基线 → V1.2 发现与去试试 → V1.3 记一顿与地点详情 → V1.4 字体与文案收束 → V2 大陆部署与地图体验 → V2.1 低延迟与 PWA 用户体验 → V2.2 启动、跳转与私有图片性能 → V2.3 发现页动态地图 → V2.4 地图优先体验与生产回归 → V2.4.1 地图控件与照片上传修复 → V3 视觉系统与精致表达

P0 是最初的地图阻塞基线：V1.2 的地点检索入口依赖稳定高德服务。V2 已完成腾讯云和正式域名切换；V2.3 完成动态地图基础闭环，V2.4 接续解决正式使用中发现的合规、图片、Pin、布局与地图浏览体验问题，V2.4.1 再收口真机验收暴露的照片上传与地图控件可用性。V3 只负责更广泛的视觉与表达，不替代 V2.2–V2.4.1 的正确性、性能和生产验收。

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
| specs/2026-08-icp-filing-display.md | 已部署；V2.4 回归修复待开发 | 首页全局 ICP 备案号、工信部查询链接、永久发布门禁和后续公安备案展示边界 | V2.4 先恢复并验收；公安联网备案信息另立小任务 |
| FOODPRINT_V2_1_PERFORMANCE_UX_DEVELOPMENT_HANDOFF_2026-08-06.md | 仓库实现完成，真实体验未达标 | 第一阶段低延迟、页面转场、PWA 公开启动壳、远程请求链路和性能指标 | V2.2 接续修正并完成真机/线上验收 |
| FOODPRINT_V2_2_PERCEIVED_PERFORMANCE_MEDIA_DEVELOPMENT_HANDOFF_2026-08-10.md | 仓库实现已落地，验收未通过 | PWA 持续启动壳、真实导航完成、路由读模型、私有缩略图、字体/资源预算、验收与回滚 | 干净库重放、同设备前后基线、向前兼容 migration、真实手机和大陆网络；见 [实现记录](./releases/2026-08-10-v2-2-performance-media-implementation.md) |
| specs/2026-08-v2-3-dynamic-discovery-map.md | 实现完成，待 Preview / 生产验收 | 默认动态地图、同一推荐数据集、Pin / 聚合、地点卡片与当前视野抽屉 | 腾讯云 / 正式域高德配置、真实地图与真机验收 |
| design/v2-3-map-pins/final/README.md | 已接入代码，待真实地图 / 真机验收 | B「餐盘定位圆章」三级推荐、选中、聚合、用户位置的正式资产与工程合同 | 已由 DynamicMapAdapter / MarkerCluster 使用 |
| FOODPRINT_V2_3_DYNAMIC_MAP_DEVELOPMENT_HANDOFF_2026-08-12.md | 仓库实现完成，待 Preview / 生产验收 | V2.3 数据、组件、地图 Provider、失败降级、里程碑、发布与回滚唯一实施交接 | 真实外部配置、迁移重放、真机与七天观察 |
| acceptance/V2_3_DYNAMIC_MAP_ACCEPTANCE_CHECKLIST_2026-08-12.md | 待实施后验收 | 数据一致性、权限、真机、故障、性能、生产与七天观察逐项门禁 | M2–M7 逐阶段留证 |
| decisions/2026-08-12-v2-3-dynamic-map-default-and-list-fallback.md | 已确认 | 动态地图默认、列表唯一降级、单一数据集、静态地图退出 | 任何地图默认 / 数据范围 / 降级变更前复核 |
| releases/2026-08-14-v2-3-dynamic-map-completion.md | 已归档 | V2.3 开发收束、验证证据与后续观察基线 | V2.4 追溯上一版本实现边界时复核 |
| FOODPRINT_V2_4_MAP_FIRST_EXPERIENCE_DEVELOPMENT_HANDOFF_2026-08-16.md | 仓库实现完成，待真实地图／真机／生产验收 | ICP 永久门禁、照片与 Pin 回归、居中与地图扩大、已批准地图主界面 UI / 交互实施规格 | 真实高德 / 真机 / 干净数据库 migration / 生产验收与回滚证据 |
| FOODPRINT_V2_4_1_MAP_POLISH_AND_PHOTO_UPLOAD_RECOVERY_DEVELOPMENT_HANDOFF_2026-08-18.md | 仓库实现完成，待真实设备／生产验收；实现报告已归档 | 常规手机照片处理 / 上传 / 补传、筛选浮层裁切、定位透明 PNG srcset 与 SVG 回退、动态面板安全提示及完整门禁 | 真实设备、干净库重放、生产小样本与 24 小时观察 |
| releases/2026-08-18-v2-4-1-map-polish-photo-upload-recovery.md | 已归档；外部发布门禁待执行 | M0–M5 实现摘要、自动化证据、未执行门禁与回滚边界 | 完成真实设备、数据库、生产样本与观察后再关闭版本 |
| design/v2-4-1-location-control/README.md | 正式透明资产包已接入，待真机验收 | UI-02 定位按钮的 ImageGen 正式母稿、RGBA 1×/2×/3× 程序文件、SVG 回退、处理脚本、manifest、QA 与使用合同 | V2.4.1 M4 / 真机门禁 |
| specs/2026-07-v3-editorial-visual-system.md | 待立项 | 视觉系统、纸张感时间线、小碗图标 | V2.2 稳定、真实用户反馈 |
| SECURITY_COMPLIANCE_BASELINE.md | 生效 | 安全、隐私、用户权利和大陆发布检查 | 涉及数据、内容、部署的每个版本 |

## 3. 建议的批准节奏

1. 先批准 P0；完成后用真实页面和真机确认高德恢复，再讨论 V1.2 的未决产品选项。
2. V1.2 上线并观察候选地点真实使用后，确认 V1.3 的迁移字段、用户退出后的历史可见性和图片限制。
3. V2-A 已完成 DNS 切流；当前优先完成角色化业务回归、7 天稳定观察、恢复演练和 GitHub Actions 腾讯云发布管道。
4. V2.1 已完成仓库内第一阶段性能/UX 改造，但 2026-08-10 真实使用仍有约 10 秒 PWA 白屏、页面跳转慢和图片慢，不能按原验收直接关闭。
5. 项目负责人批准 V2.2 后，先修指标语义和采集同设备基线，再按启动 → 字体/资源 → 导航 → 读模型 → 私有 thumbnail → 真实设备/7 天观察推进；不把完整数据平面迁移混入本版本。
6. V2.3 开发工作已归档；2026-08-16 的正式使用反馈不回写旧版本历史，统一进入 V2.4。
7. V2.4 先独立完成 ICP 合规热修，再修照片与 Pin 正确性、居中和地图布局；地图顶部叠层、紧凑搜索 / 筛选、三状态底部面板和手势隔离已经批准，可按开发交接分阶段编码与验收。
8. V2.4.1 批准后先执行照片 M0–M2，再执行筛选、定位和发布门禁；不得只改 CSS 或错误文案后关闭版本。
9. V3 以 V2.2 / V2.4.1 稳定后的用户反馈和设计探索为输入，先出可点击原型/视觉基线，再实施。

## 4. 全版本工程检查

每个版本提交前都需要：范围未扩大检查、迁移向前兼容检查、RLS/Storage 权限测试、第三方 Key/Origin 核对、类型/Lint/测试/构建、干净数据库 migration 重放、桌面与手机人工验收、错误降级验证、发布记录、回滚步骤和已知限制。数据库或部署改动还必须通过 RELEASE_SOP 的 PR CI → 项目负责人手动 Production 发布顺序。

## 5. 文档归档规则

正式产品、规格、ADR、脱敏运行手册与验收结论提交 GitHub；密钥、控制台证据、真实用户数据、备案材料与本机 Codex 临时笔记只留本地。详见 DOCUMENT_GOVERNANCE.md。
