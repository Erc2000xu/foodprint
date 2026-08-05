# 食迹 Foodprint｜V1.4 收尾记录与 V2 开发交接

> 状态：V1.4 / V1.4.1 开发收尾完成；V2 待立项与 Spec 批准
> 日期：2026-08-05
> 当前主线：`main`
> V1.4.1 实现来源：`codex/v1-4-1-ui-polish`，提交 `04723c3`

## 1. V1.4 收尾结论

- V1.4 的字体、文案、品牌化清洁和公共页面实现已完成。
- V1.4.1 已完成地点卡片管理按钮替换、公共控件对齐修复、契约测试和 Preview 验收清单，并已合入 `main`。
- 项目负责人已于 2026-08-05 完成 Preview 人工检查并确认没有问题，V1.4 开发任务本轮收束。
- 本轮没有新增或修改数据库 migration、RLS、权限模型、接口、Server Action、第三方 Key 或外部资源配置。
- 本次合入 `main` 不等同于 Production 发布；正式发布、数据库与 Vercel 动作仍必须遵循 [RELEASE_SOP](./RELEASE_SOP.md)。

## 2. 交付物与事实来源

- [V1.4 字体与文案工作稿](./specs/2026-07-v1-4-typography-and-copy-workbook.md)
- [V1.4 开发交接单](./FOODPRINT_V1_4_DEVELOPMENT_HANDOFF_2026-08-03.md)
- [V1.4.1 Spec](./specs/2026-08-v1-4-1-ui-polish.md)
- [V1.4.1 Preview 验收清单](./acceptance/V1_4_1_PREVIEW_ACCEPTANCE_CHECKLIST_2026-08-05.md)
- [V1.4.1 UI 实现](../src/components/place/place-management-control.tsx)

实现文件、资源和测试的范围以 V1.4.1 Spec 为准；本交接单不新增产品需求。

## 3. 校验与已知限制

- 项目负责人：Preview 人工验收通过，无遗留问题。
- `git diff --check`：通过。
- V1.4.1 静态契约检查、PNG 资源存在性和 TSX 语法解析：通过。
- 本机 `typecheck`、Vitest、Lint 和 Production Build 曾在启动/依赖解析阶段长时间无输出，已停止，未记录为通过。后续 CI 或正式发布前应重新执行并保留真实结果。

上述工具链限制不改变已验收的人工结果，也不应被下一轮 V2 复制为默认假设；V2 开始前先确认 CI/本地依赖环境可以给出完整检查结果。

## 4. 回滚与后续发布

- 本轮无数据库迁移，因此不需要数据库回滚。
- 若 UI 代码或资源需要回退，回退本次 V1.4.1 合入 `main` 的代码提交即可；不要修改已上线 migration。
- Production 发布由项目负责人按 `RELEASE_SOP` 手动执行；发布后补写 Production 地址、检查结果、发布时间和回滚点。

## 5. V2 启动边界

现有 [V2 大陆部署与地图体验 Spec](./specs/2026-07-v2-mainland-maps-compliance.md) 仍是“待立项”方向材料，不自动等同于已批准开发需求。下一轮对话开始 V2 前，必须先由项目负责人确认范围、优先级和验收口径。

当前可以作为讨论入口的主题，仅限于现有 V2 文档已经提出的方向：

- 中国大陆部署、腾讯云与 `.com.cn` 的迁移边界；
- 高德动态地图、静态地图回退、列表/地图联动和真实导航；
- 数据流、隐私、安全、合规、备份恢复和灾备演练。

这些主题还需要重新核对当前项目状态、外部配置、成本和合规前提；不得在未批准前直接编码、创建 migration 或修改生产配置。

## 6. V2 开发前置清单

1. 阅读最新 `main`、[ROADMAP](./ROADMAP.md)、[SPEC_INDEX](./SPEC_INDEX.md)、[DEVELOPMENT_WORKFLOW](./DEVELOPMENT_WORKFLOW.md)、[SECURITY_COMPLIANCE_BASELINE](./SECURITY_COMPLIANCE_BASELINE.md) 和 [RELEASE_SOP](./RELEASE_SOP.md)。
2. 复核 V2 现有 Spec 与当前代码、部署、地图 Adapter、Supabase 权限、域名和密钥配置的差距。
3. 由 ChatGPT 与项目负责人先收束 Brief、范围、非范围、成功判断和验收清单；涉及长期技术取舍时补充 ADR。
4. 明确迁移向前兼容、RLS/Storage、备份恢复、回滚、第三方 Key/Origin、监控和发布顺序。
5. 项目负责人批准 V2 Spec 后，再从最新 `main` 创建 `codex/v2-...` 工作分支并开始编码。

## 7. 继续有效的工程要求

- 已批准的 Spec、交接单、ADR 和项目规范是唯一事实来源；不得自行编造需求、改变定稿文案或扩大范围。
- 业务、权限、数据流、视觉分层和回滚等非显然约束，代码中继续添加适量中文注释，解释原因和不可随意改变的边界。
- 每次实现都要同步测试、验收文档和路线图状态；自动化检查未通过或未完成时，必须如实记录。
- V2 的具体开发任务将在下一轮对话中单独立项，不把本交接单中的讨论入口当成已批准功能。
