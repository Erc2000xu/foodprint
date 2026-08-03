# ADR 2026-08-03｜免费版单生产环境发布管道

> 状态：已确认采用方案 B；待一次性外部配置、迁移历史对账和低风险演练通过后启用
> 适用范围：GitHub 提交与 PR、Supabase schema/RLS/RPC/Edge Function、Vercel Production 部署

## 背景

Foodprint 的代码、产品文档和 Supabase migration 已经位于 GitHub，但发布仍可能依赖本机的 GitHub CLI 登录、手动 supabase db push 或在 Supabase SQL Editor 粘贴 SQL。这样会产生三个问题：

1. 不同对话或不同执行者会尝试不同发布路径，难以复现和交接；
2. Vercel 的代码部署与数据库迁移没有固定先后关系；
3. 历史上有手动执行的迁移未完整登记到远端 migration history，继续混用路径可能重放 SQL 或导致同步错误。

项目使用 Supabase Free，且两个活跃项目额度已经被占用。Free 没有数据库 Branching、自动备份或额外 staging 项目额度，因此不能假设存在一套独立线上测试库。

## 决策

1. **Git 使用 SSH，不以 GitHub CLI token 作为 push 的唯一凭据。** 本机使用带口令的 Ed25519 key，存入 macOS Keychain；若 22 端口不可用，GitHub 连接固定走 ssh.github.com:443。gh 只用于 PR/API，并单独完成一次浏览器登录。
2. **只保留 main 和临时 codex/<scope> 工作分支。** 常规工作分支从最新 main 创建，经 PR、应用 CI 和 migration-integrity 后合入 main；不新建或挪用 Supabase staging 项目。
3. **GitHub Actions 是唯一的远端数据库部署执行者。** ci.yml 在 PR 上从零启动临时 Supabase 数据库并重放全部 migration；release.yml 只可从 main 手动启动，会重新验证代码和 migration 完整性，再执行 db push --dry-run、应用 migration、部署 Edge Functions，最后触发 Vercel Deploy Hook。
4. **main 合入不自动部署。** 项目负责人必须在 GitHub Actions 手动运行 Release production，并精确输入 DEPLOY_PRODUCTION；该动作是生产发布的明确批准点。
5. **Vercel 的 Git 自动部署在启用发布管道后关闭。** Release workflow 只在数据库成功后触发 Production Deploy Hook，避免新应用先于新 schema/RLS/RPC 上线。Vercel 仍保持与 GitHub 仓库关联，以便 Hook 从 main 构建。
6. **生产数据库不再使用 SQL Editor 进行普通变更。** 所有变更先进入新的、按时间排序的 migration 文件；已上线 migration 永不修改。出现紧急例外时，必须补充 migration、记录原因并完成 history 对账后，才能恢复标准流程。

## 标准顺序

~~~text
codex/<scope> → PR 到 main → CI（应用 + 干净数据库重放）
  → 项目负责人合入 main（无云端副作用）
  → 项目负责人手动运行 Release production 并输入 DEPLOY_PRODUCTION
  → GitHub Actions：production DB / Edge Functions → Vercel Production
  → 健康检查、生产验收与发布记录
~~~

数据库或 Edge Function 部署失败时，workflow 在触发 Vercel 前结束；不要求也不允许用人工粘贴 SQL 绕过失败。Vercel 构建失败时，旧生产部署仍保留，数据库以新的向前修复 migration 处理，而不是试图回滚已发布 migration。

## 后果与约束

### 获得的能力

- 本机网络、VPN 和登录状态不会参与云端的数据库与部署执行；GitHub runner 会直接连接 Supabase 和 Vercel。
- 每个 migration 至少经过一次干净环境的完整顺序重放，避免只在当前生产状态可运行的 SQL。
- main 合入和生产写入之间有一个人工、可追溯的分界点；没有人手动确认就不会发布。
- GitHub Free 私有仓库也可用：使用 repository secrets 与手动 workflow，不依赖仅对公开仓库可用的 Environment 审批规则。

### 代价

- 没有独立线上 staging，因此不能在真实 Supabase 副本中演练登录、文件和写入流程。
- 发布前验证依赖本地合成数据、PR CI 的干净数据库重放和代码审查；生产发布后仍需立即完成功能验收。
- Free 没有自动数据库备份。高风险 migration 前必须按 OPERATIONS.md 导出 Owner 数据；没有独立测试库时，恢复演练不在生产执行。

## 被否决的路径

| 路径 | 不采用原因 |
| --- | --- |
| 再创建 staging Supabase 项目 | 免费版最多两个活跃项目，当前额度已用完。 |
| 每次从本机执行 supabase db push | 依赖当前终端登录、网络和执行者判断，容易再次出现手动 SQL 绕过。 |
| 直接在生产 SQL Editor 运行 migration | 绕过 migration history，已被现有历史问题证明不可持续。 |
| Vercel 在 main push 时立即自动生产部署 | 无法保证数据库变更先完成，存在不兼容窗口。 |
| Supabase Pro Branching | 功能合适但当前订阅未开通。 |
| 让任意 Vercel Preview 连接 production Supabase | Preview 测试可能写入真实用户数据，且无法验证新 migration。 |

## 启用前置条件

1. 从 main 手动运行 Audit production migration history，对当前 production migration history 完成只读核对；逐条确认需要 migration repair --status applied 的历史项，不得使用 --include-all。
2. 在 GitHub Repository Actions secrets 添加生产 Supabase 与 Vercel 凭据；在 repository variable 中保留 RELEASE_AUTOMATION_ENABLED=false。
3. 在 Vercel 创建指向 main 的 Production Deploy Hook，核对 Production 环境变量、Origin 与 Edge Function secrets。
4. 完成 SSH key 配置并验证真实 git push；再将仓库 remote 从 HTTPS 切换至 SSH。
5. 完成前四项后，先以不含 schema 或产品功能变更的提交关闭 Vercel Git 自动部署；确认 Production Deploy Hook 可用后，再将 RELEASE_AUTOMATION_ENABLED 改为 true，并完成一次手动全链路演练。

## 复核条件

在以下情况重新评估本决策：有一个既有项目可安全专用于 staging、升级到 Supabase Pro、团队出现并行开发需求、迁移包含不可逆数据操作、或 Vercel/Supabase 的部署接口发生重大变化。
