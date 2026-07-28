# 食迹 Foodprint｜文档归档与 GitHub 同步规则

> 生效日期：2026-07-28
> 原则：仓库保存可复现、可协作、无敏感信息的项目事实；本地保存仅供当前电脑运行、排障或合规留档的敏感上下文。

## 1. 结论

本轮新增的产品、规格、架构决策、运行与安全基线文档都应上传到 GitHub。它们记录的是后续任何 Codex、开发者或未来自己都需要遵守的产品决定和技术检查，且不含密钥、真实用户数据或后台截图。

GitHub 不是“所有笔记”的备份盘。不能因为某个文件对本机 Codex 有帮助，就把它提交进仓库。

## 2. 应提交到 GitHub 的文档

| 类别 | 放置位置 | 是否提交 | 原因 |
| --- | --- | --- |
| 产品基线、路线图、版本 Spec | docs/PRODUCT.md、docs/ROADMAP.md、docs/specs/ | 是 | 开发范围、先后关系、验收和非范围必须可追溯 |
| 架构决策 ADR | docs/decisions/ | 是 | 避免后续开发重复讨论或违背已确认边界 |
| 可公开的运行手册与安全基线 | docs/OPERATIONS.md、docs/AMAP_OPERATIONS_RUNBOOK.md、docs/SECURITY_COMPLIANCE_BASELINE.md | 是 | 让任何维护者按同样步骤发布、排障和检查 |
| 高德政策、数据模型说明、迁移/回滚方案 | docs/ | 是 | 属于可复现的工程知识，不应依赖某台电脑 |
| 已脱敏的发布记录与验收结论 | docs/ 或 docs/releases/ | 是 | 保留版本事实、已知限制和可回退信息 |
| 示例配置 | .env.example、去标识化样例 | 是 | 说明变量名称和格式；不得放真实值 |

本轮应提交的文件包括：SPEC_INDEX.md、PRODUCT.md、ROADMAP.md、PROJECT_CONTEXT.md、OPERATIONS.md、AMAP_OPERATIONS_RUNBOOK.md、SECURITY_COMPLIANCE_BASELINE.md、两个 ADR，以及 P0、V1.2、V1.3、V2、V3 的 Spec。

## 3. 只保留在本地、不提交 GitHub 的内容

这些文件统一放在 docs/local/、docs/private/ 或 docs/evidence/；它们已经被 .gitignore 排除。

| 内容 | 本地用途 | 不提交原因 |
| --- | --- | --- |
| .env.local、服务端 Secret、Key、Token、证书、数据库连接串 | 本机运行和紧急恢复 | 一旦进入 Git 历史即应视为泄漏 |
| Vercel、Supabase、高德控制台截图/导出 | 当前配置核对 | 可能包含项目 ID、成员、Key、日志或账户信息 |
| 真实用户导出、照片样本、完整错误日志、搜索词、精确坐标 | 排障、备份、合规留档 | 含个人信息或私有内容 |
| ICP 材料、主体证件、合同、法律意见、支付/账号资料 | 备案与合规流程 | 敏感主体与业务信息 |
| 本机 Codex 临时任务笔记、浏览器会话、录屏、未脱敏测试结果 | 当次开发辅助 | 过期快、不可复现或包含隐私 |
| 未确认的产品随记和个人草稿 | 个人思考 | 未形成项目决定，不能误导后续开发 |

## 4. 给本机 Codex 的工作方式

1. Codex 先读取 Git 跟踪的 PRODUCT、ROADMAP、Spec、ADR 和运行手册；它们是项目正式事实。
2. 需要本机排障时，可读取 docs/local/ 中的受限笔记或证据，但不得把其中的敏感内容复写入代码、提交信息、文档或聊天截图。
3. 本机笔记中一旦产生可长期复用的结论，例如新的域名、发布步骤、故障根因或经批准的产品决定，先脱敏，再更新对应 Git 文档。
4. 每次提交前检查 git status 和 git diff；发现 docs/local/ 等私有路径出现在待提交列表时，停止提交并核查忽略规则。

## 5. 文件命名与脱敏

- 正式规格：docs/specs/YYYY-MM-version-name.md。
- 架构决策：docs/decisions/YYYY-MM-NN-short-title.md。
- 本机笔记：docs/local/YYYY-MM-DD-topic.local.md。
- 本机证据：docs/evidence/YYYY-MM-DD-topic/，只存本机。
- 正式文档使用变量名、角色名、时间窗口和结论，不写真实 Secret、完整 Authorization 头、用户邮箱、手机号、精确地址、签名 URL 或控制台导出。

## 6. 提交门槛

文档可提交前必须确认：

1. 不含任何密钥、Token、密码、证书、连接串或可用的签名 URL。
2. 不含真实用户个人信息、私人照片、原始日志、精确定位或后台截图。
3. 版本状态、依赖、验收和未决项与 ROADMAP/SPEC_INDEX 一致。
4. 链接和文件路径有效，且不把临时 Preview 地址误写成长期生产事实。

若 GitHub 仓库未来改为公开仓库，此规则仍有效，并应再做一次历史文档与附件敏感信息审查。
