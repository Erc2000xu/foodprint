# 食迹 Foodprint｜免费版单生产环境发布与数据库迁移 SOP

> 状态：已确认采用方案 B；正式 Release workflow 保持关闭。迁移历史恢复完成前，既有 Vercel Git 自动部署暂时保留，之后再切换为 Deploy Hook。
> 生效范围：任何需要进入 GitHub 的代码、测试、migration、Edge Function 或正式开发文档
> 关联决策：[免费版单生产环境发布管道](decisions/2026-08-03-free-tier-release-pipeline.md)

## 1. 一句话规则

**Codex 负责代码和 migration；GitHub Actions 是唯一可以写入远端 Supabase、部署 Edge Function、触发 Vercel Deploy Hook 的执行者；项目负责人通过手动启动一次 Production workflow 作出最后发布决定。**

合入 main 绝不会自动改动 Supabase。当前过渡期 Vercel 的既有 Git 集成仍可能生成部署，但这不是正式 Release；完成 Deploy Hook 切换后将关闭该行为。任何 Codex 对话都不得改用本机 supabase db push、生产 SQL Editor 或 vercel --prod 来临时发布。失败时停在 workflow 的错误处处理，不能复制 SQL 绕过。

## 2. 环境与分支

| 层级 | Git 分支 | Supabase / Vercel | 允许的数据与用途 |
| --- | --- | --- | --- |
| 本地开发 | codex/<scope> | 本机、GitHub CI 的临时 Supabase 容器；不部署 | 合成测试数据与开发验证 |
| 代码审核 | codex/<scope> → main 的 PR | GitHub CI；不连接真实 Supabase | 应用检查与全部 migration 的干净重放 |
| 正式生产 | main | 当前 production Supabase、Production Vercel | 真实受控数据 |

当前免费额度已被两个既有 Supabase 项目占用，因此不再依赖第三个 staging 项目。也不让任意 Vercel Preview 连接 production Supabase。

## 3. 标准生命周期

### A. 开发与预检

1. 从最新 main 创建清楚命名的 codex/<scope> 工作分支。
2. 代码、测试、文档与新 migration 在同一分支完成；已经进入远端历史的 migration 永不修改。
3. 提交前执行 npm run check。涉及数据库时，补充对应 RLS、RPC 与权限测试。
4. 创建 codex/<scope> → main 的 PR。GitHub CI 必须同时通过 application 与 migration-integrity。

migration-integrity 会在 GitHub 临时 runner 上从零启动 Supabase，并顺序重放 supabase/migrations 的全部历史。它不读取任何真实项目密钥，也不接触生产数据。

### B. 合入 main

1. 项目负责人确认 PR 范围、CI 结果和迁移风险后合入 main。
2. 合入本身绝不触发数据库变更。迁移历史恢复的过渡期内，既有 Vercel Git 集成仍可能为 main 生成部署；它不是正式 Release，也不会写入 Supabase。仅在 Deploy Hook 已验证且历史恢复完成后，才合入关闭 Git 自动部署的 vercel.json。
3. 若 migration 包含删除、重写、大批量回填或权限放宽，先按 OPERATIONS.md 完成 Owner 数据导出，并在发布记录中说明影响和向前修复方式。

### C. 正式发布

1. 项目负责人在 GitHub Actions 中从 main 手动运行 Release production。
2. 在确认框精确填写 DEPLOY_PRODUCTION。该操作是本方案替代 staging 验收和 GitHub Environment 审批的最终人工门槛。
3. workflow 会重新运行应用检查和干净数据库 migration 重放，然后严格按以下顺序执行：

~~~text
migration dry-run → production db push → production Edge Functions → Vercel Production Deploy Hook
~~~

4. 在 Vercel 与 /api/health 完成生产确认，并记录版本、验收、限制和下一步。

生产 migration 或 Edge Function 失败时，Vercel Hook 不会被调用，旧应用继续运行。Vercel 构建失败时，回退应用到已验证部署；数据库只通过新的向前 migration 修复，不删除 migration history 或对生产执行 reset。

## 4. 数据库规则

1. 所有 schema、RLS、RPC、索引、权限与数据回填都由 supabase/migrations/<UTC 时间戳>_<说明>.sql 管理。
2. 先新增或扩展，再在后续发布中清理旧字段或旧路径；不可逆删除、批量数据处理或权限放宽必须写进 Spec 和发布检查。
3. 不使用 supabase db push --include-all 修复历史。先运行只读 supabase migration list，核对对象后才可对明确版本执行 migration repair。
4. 不在 production SQL Editor 粘贴常规 migration。紧急故障如必须例外：先冻结发布、记录执行 SQL 与对象影响、在仓库新增等价 migration/说明、完成 history 对账，并经项目负责人确认后恢复流程。
5. Supabase Free 没有自动备份。高风险 migration 必须先按 OPERATIONS.md 导出 Owner 数据；没有独立测试项目时，不在生产环境演练恢复。

## 5. 密钥与权限边界

| 存放位置 | 允许内容 | 禁止内容 |
| --- | --- | --- |
| Git 仓库 | migration、workflow、变量名、脱敏 SOP | token、数据库密码、Deploy Hook URL、Service Role Key、真实数据 |
| GitHub Repository Actions secrets | production 的发布凭据 | 聊天、代码或文档中的明文密钥 |
| GitHub repository variable | RELEASE_AUTOMATION_ENABLED=true，仅在完整配置后启用 | 密钥、数据库密码或 Hook URL |
| Vercel Production | production 应用变量与 Service Role Key（仅受控服务端任务） | 测试或本机凭据 |
| Supabase Edge Function Secrets | 高德 Key、APP_ALLOWED_ORIGINS、必要服务端凭据 | GitHub/聊天中明文出现的密钥 |

GitHub Repository Actions secrets 使用以下固定名称：

- SUPABASE_ACCESS_TOKEN
- SUPABASE_PROJECT_ID
- SUPABASE_DB_PASSWORD
- VERCEL_DEPLOY_HOOK

采用仓库级 Actions secrets 和手动 workflow，是为了在 GitHub Free 的私有仓库中也能执行，不依赖可能不可用的 Environment 审批功能。

## 6. Vercel 固定配置

一次性配置完成后，在 vercel.json 关闭 Git 自动部署，保留 Git 仓库连接和一个指向 main 的 Production Deploy Hook：

~~~json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": {
    "deploymentEnabled": false
  }
}
~~~

- Production 环境变量只使用 production Supabase URL、Publishable Key 与受控的 Service Role Key。
- 不为此单生产方案配置会写入真实数据的 Preview 环境。
- production Edge Function 的 APP_ALLOWED_ORIGINS 只包含正式域名和明确需要的本地开发来源。

在 Hook、Actions secrets 和迁移历史审计完成前，不合入上述 vercel.json；否则会停止现有 Git 自动部署，却没有替代触发器。

## 7. GitHub 与本机网络

本机只负责把变更推到 GitHub。之后 GitHub Actions、Supabase、Vercel 三者之间的发布是云端到云端通信，不经过本机 Wi-Fi 或 VPN。

- Git remote 使用 SSH；默认配置 Keychain，必要时经 ssh.github.com:443，避免部分网络封锁 22 端口。
- gh 只负责 PR/API，采用浏览器登录一次；它失效不应成为 Git push 的唯一依赖。
- 当前 Mac 已实测 GitHub、Vercel、Supabase HTTPS 可达，GitHub SSH 443 可达，且 HTTPS Git push dry-run 成功。网络变化后，先运行发布前检查，而不是重试多套登录方式。
- 大陆用户访问 Vercel/Supabase 的稳定性是产品运行环境问题，与开发电脑的 VPN 是两件事；V2 的腾讯云/备案切流仍按既有 Spec 与 OPERATIONS.md 单独推进。

## 8. 失败时唯一正确动作

| 失败位置 | 应做什么 | 不得做什么 |
| --- | --- | --- |
| GitHub CI 或 release 验证 | 修正分支中的代码或 migration，重新推送或重新发 PR | 直接在生产修改、删改已上线 migration |
| production db push | workflow 停在 Vercel 前；审查错误后新增向前修复 | 使用 --include-all、reset 或盲目 repair |
| Vercel 构建 | 保留或 Promote 上一版已验证部署，修复后再次手动发 workflow | 用本机 vercel --prod 跳过 workflow |
| 手动确认错误 | 不输入 DEPLOY_PRODUCTION；检查 main 是否为要发布的提交 | 从其他分支或旧提交发布 |

## 9. 一次性启用清单

项目负责人只在浏览器完成账户与密钥操作；Codex 负责生成、核对和验证，但不索取任何 secret：

1. 在 GitHub Actions 从 main 手动运行 Audit production migration history；它只读取并列出本地与远端 migration history。若本地有、远端 history 没有的旧版本，先运行 Verify legacy migration state；它只导出 public schema 到临时 runner，并通过 PostgreSQL catalog 核对触发器，绝不写入数据、schema 或 history。只有两项审计都通过后，才可逐条批准 repair 为 applied，不重放 SQL。
   - 如核对明确报告 `group_places_normalize_archive_metadata` 缺失，停止重跑核对器，改从 main 手动运行 **Reconcile legacy archive trigger**，并精确输入 `RECONCILE_LEGACY_TRIGGER`。该一次性恢复只执行仓库中已审阅的 SQL：事务内重建这一个触发器，随后自动完成全部旧迁移核对；不调用 Vercel Deploy Hook、不改 migration history。过渡期已有的 Vercel Git 自动部署仍按本节前述规则处理。
   - 在三份旧 migration 的对象均确认存在后，从 main 手动运行 **Repair legacy migration history**，并精确输入 `REPAIR_LEGACY_HISTORY`。它只向 Supabase 的 migration history 登记 `20260731100000`、`20260731110000`、`20260801100000` 为已应用，不重新执行这三份 SQL、不改业务数据、不触发 Vercel。
2. 在 GitHub Repository Actions secrets 添加四个固定名称的生产凭据；不要发送给 Codex。
3. 在 Vercel 创建一个指向 main 的 Production Deploy Hook，并核对 Production 环境变量。
4. 在 Supabase 配置 production Edge Function secrets 与 Origin 白名单。
5. 完成 SSH public key 配置，验证后将 Git remote 切换至 SSH；单独恢复 gh 的浏览器登录。
6. 完成前五项后，才由 Codex 合入 vercel.json 的自动部署关闭设置；该提交不应包含任何 schema 或产品功能变更。
7. 确认 Vercel 的 Production Deploy Hook 已可用后，将 GitHub repository variable RELEASE_AUTOMATION_ENABLED 设为 true，并手动运行一次 Release production 完成全链路演练。

完成后，日常工作不再需要在终端登录 GitHub、把 SQL 粘贴到 Supabase，或手动在 Vercel 点击部署。
