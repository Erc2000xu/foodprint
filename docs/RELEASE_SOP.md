# 食迹 Foodprint｜免费版单生产环境与应用发布 SOP

> 状态：已确认采用方案 B；V2-A 应用已运行在腾讯云，腾讯云自动发布仍待实现
> 生效范围：任何需要进入 GitHub 的代码、测试、migration、Edge Function 或正式开发文档
> 关联决策：[免费版单生产环境发布管道](decisions/2026-08-03-free-tier-release-pipeline.md)

## 1. 一句话规则

**GitHub 是代码源；GitHub Actions 是唯一可以写入远端 Supabase、部署 Edge Function 和触发受控生产发布的执行者。V2-A 当前正式应用运行在腾讯云，本轮因自动化尚未完成使用了人工部署例外；项目负责人通过手动启动 Production workflow 作出最后发布决定。**

合入 main 只更新代码仓库，绝不会自动改动 Supabase 或腾讯云。任何 Codex 对话都不得改用本机 supabase db push、生产 SQL Editor、vercel --prod 或直接修改腾讯云源码来临时发布。失败时停在 workflow 的错误处处理，不能复制 SQL 绕过。

## 2. 环境与分支

| 层级 | Git 分支 | Supabase / 应用运行时 | 允许的数据与用途 |
| --- | --- | --- | --- |
| 本地开发 | codex/<scope> | 本机、GitHub CI 的临时 Supabase 容器；不部署 | 合成测试数据与开发验证 |
| 代码审核 | codex/<scope> → main 的 PR | GitHub CI；不连接真实 Supabase | 应用检查与全部 migration 的干净重放 |
| 正式生产 | main | 当前 production Supabase、腾讯云 Lighthouse；Vercel 仅作稳定期回滚 | 真实受控数据 |

当前免费额度已被两个既有 Supabase 项目占用，因此不再依赖第三个 staging 项目。也不让任意 Preview 连接 production Supabase；Vercel 旧部署只作为回滚落点。

## 3. 标准生命周期

### A. 开发与预检

1. 从最新 main 创建清楚命名的 codex/<scope> 工作分支。
2. 代码、测试、文档与新 migration 在同一分支完成；已经进入远端历史的 migration 永不修改。
3. 提交前执行 npm run check。涉及数据库时，补充对应 RLS、RPC 与权限测试。
4. 创建 codex/<scope> → main 的 PR。GitHub CI 必须同时通过 application 与 migration-integrity。

migration-integrity 会在 GitHub 临时 runner 上从零启动 Supabase，并顺序重放 supabase/migrations 的全部历史。它不读取任何真实项目密钥，也不接触生产数据。

### B. 合入 main

1. 项目负责人确认 PR 范围、CI 结果和迁移风险后合入 main。
2. 合入本身不触发数据库变更或腾讯云部署。
3. 若 migration 包含删除、重写、大批量回填或权限放宽，先按 OPERATIONS.md 完成 Owner 数据导出，并在发布记录中说明影响和向前修复方式。

### C. 正式发布

1. 项目负责人在 GitHub Actions 中从 main 手动运行 Release production。
2. 在确认框精确填写 DEPLOY_PRODUCTION。该操作是本方案替代 staging 验收和 GitHub Environment 审批的最终人工门槛。
3. workflow 会重新运行应用检查和干净数据库 migration 重放，然后严格按以下顺序执行：

~~~text
migration dry-run → production db push → production Edge Functions → 腾讯云不可变镜像构建/部署 → 健康检查
~~~

4. 在腾讯云正式域名与 `/api/health` 完成生产确认，并记录版本、验收、限制和下一步；Vercel 仅在回滚场景使用。

生产 migration 或 Edge Function 失败时，腾讯云应用不会切换。腾讯云构建或健康检查失败时，保留上一条已验证 release；必要时再切换到 Vercel 回滚落点。数据库只通过新的向前 migration 修复，不删除 migration history 或对生产执行 reset。

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
| 腾讯云生产环境 | production 应用变量与 Service Role Key（仅受控服务端任务） | 测试或本机凭据 |
| Supabase Edge Function Secrets | 高德 Key、APP_ALLOWED_ORIGINS、必要服务端凭据 | GitHub/聊天中明文出现的密钥 |

GitHub Repository Actions secrets 使用以下固定名称：

- SUPABASE_ACCESS_TOKEN
- SUPABASE_PROJECT_ID
- SUPABASE_DB_PASSWORD
- VERCEL_DEPLOY_HOOK

采用仓库级 Actions secrets 和手动 workflow，是为了在 GitHub Free 的私有仓库中也能执行，不依赖可能不可用的 Environment 审批功能。

## 6. Vercel 过渡回滚配置

Vercel 不再是 V2-A 正式运行时。稳定期内保留旧 Production 部署和必要的回滚配置；若未来继续使用 Deploy Hook，仍须确保它不会连接会写入 production 的 Preview 环境。

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

本机只负责把变更推到 GitHub。之后 GitHub Actions、Supabase 和腾讯云之间的发布是云端到云端通信，不经过本机 Wi-Fi 或 VPN；Vercel 仅作为稳定期回滚环境。

- Git remote 使用 SSH；默认配置 Keychain，必要时经 ssh.github.com:443，避免部分网络封锁 22 端口。
- gh 只负责 PR/API，采用浏览器登录一次；它失效不应成为 Git push 的唯一依赖。
- 当前 Mac 已实测 GitHub、Vercel、Supabase HTTPS 可达，GitHub SSH 443 可达，且 HTTPS Git push dry-run 成功。网络变化后，先运行发布前检查，而不是重试多套登录方式。
- 大陆用户访问 Vercel/Supabase 的稳定性是产品运行环境问题，与开发电脑的 VPN 是两件事；V2 的腾讯云/备案切流已经完成，后续按 Spec 与 OPERATIONS.md 进行稳定期运维。

## 8. 失败时唯一正确动作

| 失败位置 | 应做什么 | 不得做什么 |
| --- | --- | --- |
| GitHub CI 或 release 验证 | 修正分支中的代码或 migration，重新推送或重新发 PR | 直接在生产修改、删改已上线 migration |
| production db push | workflow 停在应用发布前；审查错误后新增向前修复 | 使用 --include-all、reset 或盲目 repair |
| 腾讯云构建/健康检查 | 保留上一条已验证 release，修复后重新从 GitHub 发布；必要时切换 Vercel 回滚点 | 直接在服务器改源码或用未审查镜像覆盖生产 |
| 手动确认错误 | 不输入 DEPLOY_PRODUCTION；检查 main 是否为要发布的提交 | 从其他分支或旧提交发布 |

## 9. 一次性启用清单

项目负责人只在浏览器完成账户与密钥操作；Codex 负责生成、核对和验证，但不索取任何 secret：

1. 在 GitHub Actions 从 main 手动运行 Audit production migration history；它只读取并列出本地与远端 migration history。若本地有、远端 history 没有的旧版本，先运行 Verify legacy migration state；它只导出 public schema 到临时 runner 并核对旧迁移留下的对象，绝不写入数据、schema 或 history。只有两项审计都通过后，才可逐条批准 repair 为 applied，不重放 SQL。
2. 在 GitHub Repository Actions secrets 添加 Supabase 生产凭据，以及腾讯云发布 workflow 所需的受控凭据；名称以最终 workflow 为准，不要发送给 Codex。
3. 核对 Vercel 旧 Production 部署可回滚，并核对 Production 环境变量。
4. 在 Supabase 配置 production Edge Function secrets 与 Origin 白名单。
5. 完成 SSH public key 配置，验证后将 Git remote 切换至 SSH；单独恢复 gh 的浏览器登录。
6. 完成前五项后，新增腾讯云发布 workflow；该提交不应包含任何 schema 或产品功能变更。
7. 完成腾讯云 workflow 的 dry-run、预检、健康检查和回滚演练后，将对应的 GitHub repository variable 设为 true，并手动运行一次 Release production 完成全链路演练。

完成后，日常工作不再需要在终端登录 GitHub、把 SQL 粘贴到 Supabase，或直接 SSH 到腾讯云上传应用；GitHub 仍是代码源，腾讯云只是运行环境。
