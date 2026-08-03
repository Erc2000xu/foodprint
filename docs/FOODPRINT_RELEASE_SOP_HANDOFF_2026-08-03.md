# 食迹 Foodprint｜发布与迁移 SOP 收束交接

> 交接日期：2026-08-03
> 适用环境：Supabase Free，单 production 项目，无 staging
> 当前状态：历史 migration 对账完成；正式 Release 自动化尚未启用

## 本次已完成

1. GitHub SSH 推送已改为 Keychain 保存的 SSH key，并使用 `ssh.github.com:443`；日常 Git push 不再依赖重复网页登录。
2. GitHub Actions 已具备 Supabase 与 Vercel 的发布凭据命名规范；本次修复实际验证了 `SUPABASE_ACCESS_TOKEN`、`SUPABASE_PROJECT_ID`、`SUPABASE_DB_PASSWORD` 可用。
3. Supabase 历史 migration 的真实 schema 已逐项核对。`group_places_normalize_archive_metadata` 触发器已在 production 中确认存在，PostgreSQL 返回的未限定 schema 写法与原定义等价。
4. 远端 migration history 已成功补齐下列三个版本，且最终列表显示 Local 与 Remote 完全一致：

   - `20260731100000`
   - `20260731110000`
   - `20260801100000`

5. 已删除本次一次性 Verify、Reconcile、Repair 工作流及其临时 SQL/脚本，避免以后误点并对 production 产生不必要操作。

## 可复核证据

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 初始 migration history 审计 | 成功；识别出三条未登记版本 | [GitHub Actions run #1](https://github.com/Erc2000xu/foodprint/actions/runs/30815924636) |
| 历史记录修复 | 成功；三条版本均已标记 `applied` | [GitHub Actions run #1](https://github.com/Erc2000xu/foodprint/actions/runs/30824970244) |
| 最终状态 | 每个 local migration 都有同版本 remote history | 上述 repair run 的最后一个 `supabase migration list --linked` 步骤 |

## 现在开始的日常流程

1. 在 `codex/<scope>` 分支完成代码、测试、文档及新的 migration。
2. 创建 PR，等待 CI 通过并审核后合入 `main`。
3. 不在 Supabase SQL Editor 粘贴常规 migration，不从本机执行 `supabase db push`、`supabase migration repair` 或 `vercel --prod`。
4. 每次准备正式上线时，使用 `main` 上的 **Release production** 工作流；该工作流会在启用后按“migration → Edge Function → Vercel”的顺序执行。

## 仍未启用的最后一段发布切换

本次没有启用正式发布，以下事项应作为一个独立、无 schema/产品功能改动的后续任务完成：

1. 在 Vercel 核对 Production Deploy Hook 和 Production 环境变量。
2. 合入 `vercel.json`，关闭 Vercel Git 自动部署。
3. 将 GitHub repository variable `RELEASE_AUTOMATION_ENABLED` 设为 `true`。
4. 从 `main` 手动运行一次 **Release production**，输入 `DEPLOY_PRODUCTION`，完成全链路演练。

在这一步完成前，Vercel 现有 Git 集成仍可能在合入 `main` 时生成部署；它不写入 Supabase，但也不应被当作新的正式发布流程。

## 明确禁止

- 不回放本次已对账的三份旧 migration。
- 不使用 `supabase db push --include-all`、`supabase db reset --linked` 或手工改写 migration history。
- 不重新引入本次删除的一次性生产修复工作流；未来异常应先诊断，再创建独立且可审阅的向前修复方案。

本文件取代 [V1.3.3 标记表单 Bugfix 交接](FOODPRINT_V1_3_3_MARK_FORM_BUGFIX_HANDOFF_2026-08-03.md) 中仍待处理的 migration-history 事项。
