# 食迹 Foodprint｜V2 大陆域名与腾讯云迁移开发交接

> 状态：**V2-A 已发布（2026-08-06）；当前进入稳定期，V2-B 待立项**
> 日期：2026-08-06（初版 2026-08-05）
> 当前任务：`codex/v2-domain-migration-docs`（已扩展为 V2 域名迁移实施）
> 当前边界：腾讯云应用运行环境、HTTPS、DNS、ICP 展示和第三方新域名配置已完成；Supabase 数据平面继续保留，完整业务回归、7 天稳定观察、恢复演练和腾讯云自动发布仍待完成。真实凭据仍不写入仓库。
> 正式唯一入口：`https://foodprint.com.cn`
> 部署目标：腾讯云轻量应用服务器（Lighthouse）+ Nginx + Docker Compose（本文中历史性的“CVM”均按腾讯云服务器实例理解）
> 关联规格：[V2 大陆部署与地图体验](./specs/2026-07-v2-mainland-maps-compliance.md)
> 架构决定：[V2 域名运行环境与数据平面边界](./decisions/2026-08-05-v2-domain-runtime-and-data-plane-boundary.md)

## 0. 本次文档任务交付

本任务最初以 V2-A 域名迁移文档为交付物，现已按负责人明确的目标扩展为“可在 `foodprint.com.cn` 使用 V2 网站”的实施任务。文档与部署产物共同组成当前交付：

- 本交接单：V2-A 的唯一开发顺序、范围、里程碑、编码包、外部配置、验收和回滚依据；
- `docs/specs/2026-07-v2-mainland-maps-compliance.md`：产品范围、动态地图的非阻塞边界和大陆发布门槛；
- `docs/decisions/2026-08-05-v2-domain-runtime-and-data-plane-boundary.md`：先迁应用运行环境、暂不迁 Supabase 数据平面的架构决定；
- `docs/OPERATIONS.md`、`docs/AMAP_OPERATIONS_RUNBOOK.md`、`docs/SECURITY_COMPLIANCE_BASELINE.md`：运行、地图、隐私与安全检查的交叉引用；
- `docs/ROADMAP.md`、`docs/SPEC_INDEX.md`、`docs/PROJECT_CONTEXT.md`：版本状态、文档索引和备案/切流事实的统一入口。

当前已完成服务器基线、Docker 构建、容器健康检查、Nginx TLS 反向代理、DNS 切流、真实域名 HTTPS 验收和 ICP 页尾展示。当前线上只代表核心入口与健康检查已发布，不等同于所有角色化业务路径和稳定期工作已经关闭。

### 0.1 当前下一步

当前优先级依次为：把本次线上代码提交到 GitHub；补齐 GitHub Actions 的腾讯云不可变 release 发布流程；完成 Owner/Admin/Member 登录、邀请、地图、照片、PWA 和数据导出回归；完成 7 天观察与非生产恢复演练。生产密钥继续只留在腾讯云受控环境和第三方平台。

### 0.1.1 已确认的腾讯云实例基线

项目负责人已购置并启动实例 `foodprint-prod-01`；以下信息已由负责人在腾讯云控制台确认，公网 IP、密码和密钥不写入仓库：

| 项目 | 已确认信息 | 迁移判断 |
| --- | --- | --- | --- |
| 产品 | 腾讯云轻量应用服务器（Lighthouse） | 可作为本次 V2-A 的应用运行环境，无需另购 CVM |
| 地域/可用区 | 北京 / 北京三区 | 已确认 |
| 操作系统 | Ubuntu Server 24.04 LTS 64-bit | 满足 Docker + Nginx 部署前提 |
| 规格 | 2 vCPU、4 GB 内存、60 GB 系统盘、5 Mbps 公网带宽、支持 IPv6 | 适合当前小规模私域应用；后续按监控结果扩容 |
| 实例状态 | 运行中 | 已满足连接前置条件 |
| 公网 IPv4 | 已有；具体地址不记录在 Git | 需确认发布期间地址保持不变 |
| 快照 | 控制台显示支持；迁移前快照与系统加固后基线快照均已由负责人创建 | 后续重大系统变更前继续创建命名快照 |
| SSH 密钥 | 已在线绑定至实例；`ubuntu` 与非 root `deploy` 均已用公钥完成登录验证 | 后续按发布方式配置 `deploy` 的最小 Docker 权限 |
| 防火墙 | `22` 已限制为负责人当前公网 IPv4 的 `/32`；`80`、`443`、ICMP 仍按现有规则开放 | 已完成基础收口；负责人网络变化或后续发布方式变化时需重新评估来源 |

已完成的外部动作：负责人已创建迁移前快照，完成 Ubuntu 默认用户与非 root `deploy` 的 SSH 登录验证，并将 22 端口收口为负责人当前公网 IPv4 `/32`。系统更新、Docker、Nginx、TLS、生产配置和 systemd 服务均已完成。

当前系统基线：Ubuntu 软件包列表已刷新，29 个系统更新已完成安装并已重启实例；Docker `29.7.1`、Docker Compose `v5.4.0` 已安装并运行；Nginx `1.24.0` 已安装并启动；发行版默认站点已移出 `sites-enabled`；应用容器仅绑定 `127.0.0.1:3000`，未开放应用、数据库或 Docker TCP 端口。

域名证书前置：腾讯云免费 DV 证书已完成域名验证并签发；证书 SAN 已确认同时包含 `www.foodprint.com.cn` 与 `foodprint.com.cn`；证书与私钥已上传至服务器并分别按 `0644`/`0600` 保护在 `/etc/nginx/ssl/foodprint/`，DNSPod 的 `_dnsauth` TXT 记录暂不删除。正式 Nginx 配置已接入并通过语法检查，`www` 统一 `308` 到裸域。

HTTPS 与生产验收：使用强制解析和真实 DNS 分别验证，`https://foodprint.com.cn/` 未登录时返回正常的 `307 /login`，`https://www.foodprint.com.cn/` 返回到裸域的 `308`，`/api/health` 返回 `200`；证书、HTTP→HTTPS 和 canonical redirect 均通过。

HTTP 预发布验收：`http://foodprint.com.cn/` 已通过 `curl --resolve` 验证为 `308` 跳转至 `https://foodprint.com.cn/`；正式 Nginx 反向代理已生效。

### 0.2 文档内事实约束

- ICP 备案已完成，正式流量已通过 DNS 指向腾讯云；Vercel 仍保留为稳定期回滚落点；
- V2-A 保留 Supabase Auth、PostgreSQL、Storage、RLS、RPC 和 Edge Functions，不搬运真实用户数据；
- `https://foodprint.com.cn` 已成为公众正式入口；`www` 通过 308 统一到裸域；
- 所有真实值、控制台截图、备案材料、证书私钥和用户数据只保留在受控本地/平台，不进入 Git。

### 0.3 当前卡点分层

以下事项不是本分支可以代替负责人完成的代码工作，已在第 5 节展开为操作顺序：

| 层级 | 卡点 | 影响 |
| --- | --- | --- |
| 必须先有 | 腾讯云轻量应用服务器的 Linux、公网 IPv4、受限 `deploy` 用户和已验证的 SSH 公钥登录 | 已完成；`deploy` 不加入 Docker 组，仅获得受限 systemd 操作权限 |
| 必须先有 | Security Group、TLS 证书/续期责任、DNSPod 记录和预发布访问限制 | 已完成；监控和证书续期责任仍需定期复核 |
| 必须先有 | 生产 Supabase/高德/邀请加密环境变量、Supabase Auth/Edge Function 的新域名配置、高德 JS Key 白名单和精确 Origin | 已完成基础配置；完整登录、邀请、搜索、地图和照片回归待补 |
| 必须先有 | DNSPod 裸域 A 记录与 `www` CNAME | 已完成并通过公网解析与 HTTPS 验收 |
| 必须先有 | GitHub Actions 发布凭据、Vercel 回滚点、现网配置/备份记录 | Vercel 回滚点和快照已保留；腾讯云自动发布凭据/流程待实现 |
| 必须先有 | Owner、Admin、Member 合成测试账户与负责人验收窗口 | 待完成角色化业务回归 |
| 非阻塞 | CLS、COS、CDN、CLB、WAF、腾讯云数据库等增强服务 | V2-A 小规模私域切流不依赖，另行评估即可 |

密钥、证书私钥、数据库密码、CVM IP 及真实用户数据不需要发送给 Codex；只需由负责人在对应控制台或服务器受控配置中完成，并向交接记录提供脱敏的“已完成/待完成”结论。

## 1. 本版本的决定与边界

V2 的首要目标是把 Foodprint 的 **Next.js 应用运行环境和正式访问入口** 从 Vercel 迁到腾讯云，并以 `foodprint.com.cn` 作为唯一正式域名；该目标已在本轮完成。

Foodprint 的定位在本版本保持不变：这是一个由熟人邀请进入、以真实美食记录为主的小圈子产品，不是开放餐厅目录、公开内容流或陌生人社交网络。

### 1.1 V2-A：本次必须完成

- `https://foodprint.com.cn` 成为唯一正式入口；`www` 和旧 Vercel 地址只作重定向或回滚用途。
- Next.js、PWA、Server Actions、图片上传、健康检查和高德调用从腾讯云 CVM 提供服务。
- 腾讯云的 TLS、反向代理、访问边界、备份、监控和可回滚发布流程落地。
- 所有第三方回调/白名单改为新域名：Supabase Auth、Supabase Edge Functions、高德 JS Key、PWA 与应用 URL。
- 把“只在 UI 上显示邀请入口”升级为可验证的私域用户管理：不开放任意注册、不保留多人通用邀请链接、成员移除立即失去数据访问权。

### 1.2 V2-B：不自动混入本次切流的数据后端迁移

当前应用广泛使用 Supabase 的 PostgreSQL、Auth、Storage、RLS、RPC 和 Edge Functions。将网页部署到腾讯云，**不等于**数据库、认证和照片已经迁到腾讯云。

本次 V2-A 默认保留当前 Supabase 作为后端依赖，只迁移应用运行环境和正式域名；因此不在 DNS 切换时导出、重建或搬运真实用户数据。若项目负责人决定把数据平面也迁入腾讯云，应另立 V2-B 技术决策，选择“自建 Supabase”或“重写到腾讯云数据库/COS/自有认证”。这是一项独立的高风险工作，不能与域名切流合并执行。

### 1.3 明确不做

- 不新增公开注册、公开内容页、公开分享链接、成员搜索、关注、评论、点赞、热榜或推荐算法。
- 不新增手机号、身份证、人脸或其他新的身份信息采集。
- 不购买或依赖 CDN、负载均衡、WAF、腾讯云数据库、对象存储或日志服务作为 V2-A 的上线前提；如后续需要，可单独评估。
- 不在本次迁移中改变地点生命周期、推荐逻辑、RLS 的小组数据边界或现有地图免费版约束。
- 动态地图体验不阻塞域名迁移；只在 V2-A 稳定期结束后，再按独立小任务实施。

## 2. 当前事实与目标架构

当前代码具备 Docker standalone 输出、`/api/health`、Supabase SSR、受控高德 Edge Function 和邀请/Owner/Admin/Member 模型。腾讯云已成为正式应用运行时；Vercel 仅保留为稳定期回滚落点。邀请与角色治理仍需通过真实环境完成完整回归，不能仅以页面入口隐藏作为安全证明。

```mermaid
flowchart LR
  U["受邀成员浏览器 / PWA"] --> D["DNSPod: foodprint.com.cn"]
  D --> N["腾讯云 Lighthouse: Nginx / TLS / 限流"]
  N --> A["Docker: Next.js Foodprint"]
  A --> S["Supabase: Auth / PostgreSQL / RLS / Storage"]
  A --> M["高德 JS API / Edge Functions"]
  N --> L["受控访问日志与告警"]
  O["Owner"] --> T["腾讯云控制台 / GitHub 手动发布"]
```

### 2.1 域名与运行环境的唯一事实来源

| 场景 | 值 | 规则 |
| --- | --- | --- |
| 正式入口 | `https://foodprint.com.cn` | 唯一可被用户分享和用于认证回调的地址 |
| `www` | `https://www.foodprint.com.cn` | 308 跳转到正式入口，不承载独立会话 |
| 旧 Vercel 地址 | 旧 `*.vercel.app` 地址 | 在稳定期保留部署以供回滚；非正式入口一律跳转正式域名 |
| 预发布 | `preprod.foodprint.com.cn`（如启用） | 仅用于负责人验收；Nginx 以 IP 白名单或 Basic Auth 限制，不能成为公开入口 |
| 本地 | `http://localhost:3000` | 仅本机开发；不得写入正式应用环境变量 |

`NEXT_PUBLIC_APP_URL` 在浏览器构建时会进入客户端 bundle；腾讯云生产镜像构建时必须已是 `https://foodprint.com.cn`。不要以“容器启动后再覆盖”来替换它。

## 3. V2 里程碑与完成条件

| 里程碑 | 交付物 | 通过条件 | 当前状态 |
| --- | --- | --- | --- |
| M0｜迁移冻结与盘点 | 配置台账、现网备份、回滚点 | 当前 Vercel 部署、Supabase schema、Edge Function 版本和域名配置均已记录；无未审查的生产 migration | 已完成；快照、Vercel 回滚点和 Supabase 边界已记录 |
| M1｜代码与镜像基础 | 安全 Docker 产物、Nginx/Compose 模板、统一环境配置 | 同一提交可在本机和腾讯云构建，镜像中不含 `.env*`、Git 元数据或私有文档 | 已完成；腾讯云构建通过 |
| M2｜私域用户治理 | 命名邀请、注册拦截、角色与审计权限 migration | 外部直接注册失败；错误邮箱、过期邀请、重复邀请和已移除成员均不能获得小组数据 | 既有产品治理范围，需在真实 Supabase 环境回归 |
| M3｜腾讯云预发布 | Lighthouse、Security Group、TLS、Nginx、监控、快照 | `preprod` 仅负责人可访问，HTTPS、健康检查、邮件回调、地图、上传均成功 | 基础设施、HTTPS、快照和健康检查已完成；完整业务回归待补 |
| M4｜第三方配置切换 | Supabase/Auth/Storage/Edge Function/高德白名单更新 | 新域名通过完整登录、邀请、搜索、图片和 PWA 验收；旧域名仍可回滚 | 新域名基础配置已完成；角色化业务验收待补 |
| M5｜正式 DNS 切流 | DNS、镜像发布、回滚记录 | `foodprint.com.cn` 主路径稳定，错误率/资源指标正常，旧入口不再作为正式入口 | 已完成；线上 API、HTTPS、canonical redirect 和 ICP 页尾已验收 |
| M6｜稳定期收口 | 7 天观察记录、恢复演练、文档更新 | 无 P0/P1 迁移问题；已验证应用回退、DNS 回退和成员权限回归 | 进行中 |

## 4. 编码工作包

### 4.1 运行配置与域名收束

新增一层明确的运行时配置，禁止页面、Server Action 和部署脚本自行拼接不同域名。

| 文件 | 改动 |
| --- | --- |
| `.env.example` | 增加脱敏的 `APP_CANONICAL_HOST`、`APP_TRUSTED_ORIGINS`、`DEPLOYMENT_VERSION` 样例；生产值只写入腾讯云受控环境文件和 GitHub Secrets |
| `src/lib/env.ts` | 校验正式环境必须为 HTTPS、无路径、无尾随 `/`；将可信 Origin 解析为精确集合，拒绝 `*` 和 Vercel Preview 通配符 |
| `src/lib/runtime/app-url.ts`（新增） | 提供 `getCanonicalAppUrl()`、`getAuthRedirectUrl(path)`、`isCanonicalHost(host)`；所有认证、邀请、重设密码链接改走该文件 |
| `src/app/(auth)/actions.ts`、`src/app/join/[token]/page.tsx`、`src/app/admin/actions.ts`、`src/app/admin/page.tsx` | 删除散落的 `process.env.NEXT_PUBLIC_APP_URL` 字符串处理，统一使用运行时配置 |
| `src/proxy.ts` | 非正式 Host（旧 Vercel、`www`）使用 308 跳转到正式入口；保留 `/api/health` 作为无认证的最小存活检查；不得按 Host 绕过认证 |
| `src/app/robots.ts`（新增）和根布局 Metadata | 添加 `noindex,nofollow` 与全站 `Disallow`；这不是访问控制，但避免私域内容被搜索引擎索引 |
| `next.config.ts` | 保留 `16mb` Server Action 上限；增加安全响应头配置。Server Action 默认同源校验足够时不额外放宽 `allowedOrigins`；若未来接入不同域名的反向代理，才以精确 Host 增加白名单，绝不使用通配符 |

安全响应头先在预发布以 Content-Security-Policy Report-Only 验证，再切换为强制模式。最低包含：`X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`X-Frame-Options: DENY`、`Permissions-Policy`（默认关闭不需要的相机、麦克风、定位），以及经实际地图/图片域名验证后的 CSP。

### 4.2 私域用户管理：必须从 UI 限制升级为后台限制

当前 `/join/[token]` 调用 `supabase.auth.signUp()`，而 Supabase 项目若允许公开注册，外部人仍可能直接调用 Auth API。V2 必须以以下原则重做邀请入口：

1. Supabase Auth 后台关闭 **Allow new users to sign up** 和匿名登录；保留受控的邮箱邀请流程。
2. Owner 在管理页填写受邀人的邮箱和显示名；不再生成可复制、可多次使用的通用邀请链接。
3. 服务器端先验证 Owner 身份和小组权限，再用 Service Role 发起受控邀请；Service Role 永不进入浏览器。
4. Foodprint 邀请记录绑定特定 `recipient_user_id`；认证后的 `accept_invitation` 必须验证 `auth.uid()` 与该受邀人匹配，且只允许一次成功加入。
5. 已有 Foodprint 账户由 Owner 按邮箱加入指定小组；新用户通过受控邮箱邀请完成密码设置后再加入。两条路径都不经过公开 `signUp`。
6. 现有多人通用邀请在切流前全部撤销或到期；历史记录保留，但不再能使用。

建议新增 migration（实际时间戳在编码时生成）：

```text
v2_private_invitation_enforcement.sql
  - invitations 增加 recipient_user_id、delivery_status、consumed_at
  - 旧 generic invitation 统一 revoked_at（不删除审计历史）
  - accept_invitation 校验受邀人、活跃小组、一次性使用和事务性 use_count
  - 新建 Owner-only 的 create_named_invitation / resend / revoke RPC
  - 取消普通 authenticated 直接创建通用 invitation 的执行权限

v2_audit_privacy_and_member_access.sql
  - 删除“所有小组成员可读 audit_logs”的策略
  - audit_logs 只允许 Owner 通过受控查询读取；普通成员只能看产品层的饭后聊内容
  - invitation 列表不再返回 token_ciphertext 或任何可复用 token
  - suspend / removed 状态在所有 RLS、Storage、RPC 中再次回归测试
```

若 Supabase Admin 邀请流程在预发布环境无法满足“新用户创建、邮件跳转、指定小组加入”的完整链路，则备用方案是使用 Supabase 的 **Before User Created Auth Hook** 校验受邀人专属邀请；两种方案只能选择一种并完整测试，不能只靠前端隐藏注册按钮。Supabase 官方支持关闭新用户注册和在用户创建前拒绝不符合策略的注册。([Supabase Auth 配置](https://supabase.com/docs/guides/auth/general-configuration), [Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook))

### 4.3 网络与应用安全

本版本不增加新的个人信息字段；网络安全工作只围绕已有邮箱、昵称、小组、餐饮记录和照片进行最小化保护。

- Nginx 仅对外暴露 80/443；Docker 端口使用 `127.0.0.1:3000:3000`，不得继续用 `0.0.0.0:3000:3000` 暴露 Next.js。
- Security Group 仅允许 80/443 公网入站；SSH 22 只允许负责人固定 IP 或受控运维入口；禁止数据库、Docker 和 Next.js 端口公网入站。
- Nginx 对登录、找回密码、邀请接受、上传和地图代理设置单独限速；所有错误页不泄露 Supabase、密钥、主机路径或堆栈。
- 自定义访问日志不记录 Cookie、Authorization、请求体、完整查询串或 Referer。`/join/<token>` 必须在 Nginx 日志中脱敏为 `/join/:token`，应用审计只写 invitation ID 或哈希，不写原始 token。
- 日志由受控运维账户读取，按轮转策略保留；小组成员不能从 Supabase API 读取运维审计日志。
- 图片 bucket 继续私有化；只保存 object key，读取仍使用短期签名 URL；不要把签名 URL 写入数据库、日志或页面缓存。
- 部署用户、Nginx、应用容器和备份目录使用最小权限。Docker 镜像以非 root 用户运行，生产环境文件权限为 `0600` 或更严格。

### 4.4 Docker、Nginx 与发布产物

本轮新增但不提交真实环境值的目录：

```text
deploy/
  compose.production.yml
  nginx/foodprint-http.conf
  nginx/foodprint.conf
  systemd/foodprint-compose.service
  systemd/foodprint-deploy.sudoers
  production.env.example
  README.md
```

当前已在服务器验证的实施结果：

- Docker 镜像 `foodprint:v2-prod-20260806-icp-footer-fix` 已在腾讯云服务器构建并发布；远端 Next.js 编译、TypeScript 检查和页面生成通过。
- 容器以非 root 用户运行，Compose 只绑定 `127.0.0.1:3000`，健康检查为 `healthy`；Nginx 只对外提供 80/443。
- 正式 Nginx 模板已安装并通过 `nginx -t`；HTTP→HTTPS、`www`→裸域和 `/api/health` 已用 `curl --resolve` 验收。
- `deploy` 用户没有 Docker socket 权限，也没有加入 Docker 组；只允许通过 `/etc/sudoers.d/foodprint-deploy` 操作 `foodprint-compose.service` 的 restart/status/is-active。
- Supabase 中间件已增加缺少公共配置时的安全放行路径，避免健康检查因未配置环境而返回 500；业务登录与数据页面仍需真实 Supabase 环境配置。
- 当前生产环境使用 `/etc/foodprint/production.env`（权限 `0600`），真实密钥不进入镜像、代码库或文档；Supabase 继续作为数据平面。

实现要求：

1. 新增 `.dockerignore`，至少排除 `.env*`（保留 `.env.example` 也不复制）、`.git`、`node_modules`、`.next`、`docs/private`、`docs/evidence`、测试输出和本地 Supabase 临时目录。当前 Dockerfile 的 `COPY . .` 没有 `.dockerignore`，这是 V2 前必须修复的密钥泄漏风险。
2. Dockerfile 使用非 root 用户运行；加入仅访问 `127.0.0.1:3000/api/health` 的健康检查；收到 `SIGTERM` 后允许 Next.js 完成在途请求再退出。
3. `compose.production.yml` 固定镜像标签为 Git commit SHA，不使用 `latest`；应用容器使用只读根文件系统（需要写入的临时目录显式挂载）；端口只绑定 loopback。
4. Nginx 负责 TLS、HTTP→HTTPS、`www`→正式域名跳转、Host 透传、`X-Forwarded-*`、请求体上限、限速、响应头和脱敏日志；不得缓存登录后 HTML、API、签名照片 URL 或 Server Action 响应。
5. 使用 `DEPLOYMENT_VERSION=$GITHUB_SHA` 构建镜像并写入 Next.js deployment ID，避免 PWA/浏览器持有旧 bundle 时出现 Server Action 版本错配。

Next.js 官方建议自建时用 Nginx 等反向代理保护 Node 进程；正式容器无需改为静态导出，因为本项目依赖 Server Actions、认证和 Route Handlers。([Next.js 自建指引](https://nextjs.org/docs/app/guides/self-hosting))

### 4.5 发布管道改造

当前 `release.yml` 仍描述 Supabase/Vercel 旧发布链路；本轮没有把它误改成腾讯云自动部署。下一步应新增独立的腾讯云发布 workflow，完成构建、传输、预检、健康检查、切换和回滚后，再将腾讯云自动发布设为正式入口。

```text
PR → CI（应用检查 + 全量 migration 重放）
  → 项目负责人批准并合入 main
  → 手动 Release Tencent Cloud
      1. 再跑 npm run check
      2. 按既有受控流程应用向前兼容 Supabase migration / Edge Function
      3. 构建 foodprint:<git-sha> Docker 镜像
      4. 以受限 deploy 用户将镜像部署至 CVM
      5. 容器健康检查 + 预发布/正式域名 smoke test
      6. 记录镜像 SHA、时间、验收和回滚镜像
```

部署凭据只保存在 GitHub Actions Secrets 和腾讯云服务器受控账户中。代码库只保存变量名、模板和脱敏命令；禁止把 SSH 私钥、CVM IP、证书私钥、Service Role Key、数据库密码或 Docker registry token 写入文档和 Git。

## 5. 腾讯云控制台与外部配置清单

### 5.1 切流前由项目负责人完成

| 项目 | 操作 | 当前状态 |
| --- | --- | --- |
| Lighthouse | 确认 Linux、磁盘、公网 IPv4；建立非 root `deploy` 用户和 SSH Key 登录 | 已完成 |
| 防火墙 | 只开放 80/443；22 仅负责人受控来源；关闭 3000、数据库和 Docker 端口公网访问 | 已完成；负责人公网 IP 变化时需更新 22 规则 |
| DNSPod | 配置正式 `@`/`www` 记录并观察解析与 TTL | 已完成；公网解析和 HTTPS 已验收 |
| SSL 证书 | 为 `foodprint.com.cn` 与 `www.foodprint.com.cn` 部署有效证书并记录续期责任 | 已完成；续期提醒仍需纳入运维 |
| 云监控 | 设置 CPU、内存、磁盘、带宽和实例不可达告警 | 待补齐 |
| 云硬盘快照 | 在重大发布前创建命名快照，并制定保留周期 | 已完成迁移快照；定期策略待补齐 |
| 应用配置 | 在服务器创建 `/etc/foodprint/production.env`，权限 `0600`；填入真实 Supabase/高德/应用变量 | 已完成 |
| GitHub Actions | 配置构建、传输、预检、切换、健康检查和回滚所需的受控凭据 | 待实现 |
| CLS / COS | 小规模阶段可选。先用受控 Nginx 日志轮转和云硬盘快照；日志量、排障需求增加后再接 CLS，媒体后端迁移后再接 COS | 非阻塞 |
| CDN / CLB / WAF / 腾讯云数据库 | 不是当前私域小圈子的切流前提 | 不需要先购买 |

腾讯云云监控默认可用于 CVM 指标与告警配置；云硬盘支持定期快照，官方对核心业务建议每日快照并设置保留期。([CVM 监控与告警](https://cloud.tencent.com/document/product/213/5165), [定期快照](https://cloud.tencent.com/document/product/362/8191))

### 5.2 第三方控制台配置顺序

1. **Supabase Auth**：Site URL 与 Redirect URLs 已加入 `https://foodprint.com.cn`；旧 Vercel 地址在稳定期保留；完整登录、邀请和重设密码回归待补。
2. **Supabase Edge Function Secrets**：`APP_ALLOWED_ORIGINS` 已加入精确的 `https://foodprint.com.cn`；不加 `*.vercel.app`、`*` 或路径；地图完整回归待补。
3. **高德控制台**：JS API Key 已配置 `foodprint.com.cn` 相关白名单；Web Service Key 仍保持服务端 Secret 边界。
4. **腾讯云 SSL / Nginx**：证书、强制 HTTPS 和 canonical redirect 已验收。
5. **DNSPod**：`foodprint.com.cn` 已指向腾讯云；`www` 已统一跳转到裸域。

## 6. 切流、验证与回滚

### 6.1 已完成的切流前检查

- M0–M4 的基础检查已通过；完整 Owner/Admin/Member 业务回归仍需补做，不在生产用删除/隐藏操作试验。
- 记录当前 Vercel Deployment ID、当前 DNS 记录、当前 Supabase/Edge Function 版本、Docker 镜像 SHA 和最近可用云硬盘快照。
- 新域名已在腾讯云完成 HTTPS，且 Nginx 不暴露 3000 端口。
- 项目负责人已完成入口和健康检查验收；Owner/Admin/Member 的邀请、登录、地点搜索、记一顿、私有照片、下回吃、导出和退出小组测试仍是稳定期待办。
- 验证旧 Vercel Host 会跳转正式域名；不要依赖浏览器 Cookie 跨域迁移，用户在新域名重新登录是预期且更安全的行为。

### 6.2 本轮已执行的正式切流步骤

1. 使用已确认的生产配置构建并发布腾讯云 Docker release。
2. 先用临时容器和 `127.0.0.1:3001` 验证 `/api/health`，再切换生产容器。
3. 从外网访问 `https://foodprint.com.cn/api/health`，确认 HTTP 200 和通用 `status: ok`。
4. 配置 DNS 记录到腾讯云并观察解析与证书链路。
5. 验证 `www` canonical redirect、ICP 页尾和首页登录跳转。
6. 保留旧 Vercel 部署与腾讯云上一版 release，进入 7 天稳定期。

### 6.3 回滚原则

- 应用问题：恢复上一枚已验证腾讯云 Docker release；当前人工版本标签仍需在后续自动化中改为 Docker image/Git commit SHA，数据库只用新的向前兼容 migration 修复，绝不 reset 真实数据库。
- 腾讯云不可用：DNS 恢复到已记录的旧 Vercel 入口；旧部署必须保持可运行至稳定期结束。
- 认证/地图配置问题：先收紧为旧的精确白名单或临时关闭受影响功能，不把 Origin 放宽为 `*`。
- 用户数据、照片、邀请或权限异常：停止相关写操作，保留最小证据，恢复最近备份并完成 RLS/Storage 复测；不直接在生产库执行无条件删除。

## 7. 验收清单

### 域名与运行

- [x] `http://foodprint.com.cn` 308 到 HTTPS；`www` 308 到唯一正式域名。
- [x] Lighthouse 仅暴露 80/443；直接访问 `:3000`、数据库和 Docker API 均失败。
- [x] `/api/health` 正常；错误响应不泄露栈、密钥、Supabase 项目地址或服务器路径。
- [ ] PWA 新域名可安装、更新、离线壳可用，且不缓存登录后页面/API/签名图片。
- [ ] 第三方回调、高德搜索、静态地图、图片上传和短期签名图片读取全部通过。

### 私域用户与数据

- [ ] 未登录用户不能看任何地点、成员、照片、饭后聊或导出数据。
- [ ] 直接调用 Supabase 新用户注册被拒绝；匿名登录关闭。
- [ ] 指定受邀人可完成加入；错误账户、过期/撤销邀请、重复接受和旧通用链接均被拒绝且不暴露原因细节。
- [ ] Owner/Admin/Member 三角色按批准的权限测试；被暂停或移除者刷新后无法再读取小组表、Storage 对象、RPC 和导出。
- [ ] 普通成员无法读取邀请 token、其他成员邮箱、运维审计日志或其他小组数据。
- [ ] 审计日志不含 Cookie、认证头、原始邀请 token、签名图片 URL 或完整查询串。

### 发布与恢复

- [ ] `npm run check`、`git diff --check`、新增 migration 的本地/CI 重放通过。
- [x] 已记录本次 Docker image 标签、发布时间、配置变更和回滚 release 边界；下一轮应补充 Git commit SHA。
- [ ] Lighthouse 快照策略和最近一次手动快照可见；已完成一次非生产恢复演练。
- [ ] 7 天稳定期后，旧 Vercel 入口不再作为正常入口，但保留脱敏发布记录与可恢复版本。

## 8. 开发顺序与提交拆分

为了避免域名、权限、部署和数据库迁移互相掩盖问题，按以下小提交推进：

1. `codex/v2-runtime-config`：统一 URL/Origin 配置、canonical redirect、robots 与配置测试。
2. `codex/v2-private-invites`：命名邀请、Auth 注册关闭、RLS/审计权限 migration、角色化测试。
3. `codex/v2-container-security`：`.dockerignore`、非 root Docker、健康检查、Compose/Nginx 模板与部署说明。
4. `codex/v2-tencent-release`：GitHub 手动发布 workflow、镜像版本、服务器部署与回滚脚本；不含真实凭据。
5. `codex/v2-cutover-validation`：预发布验收、第三方新域名配置、DNS 切流和稳定期发布记录。

每一项合入前都必须通过现有质量门槛。M0–M5 已在本轮完成；M6 稳定期和腾讯云自动发布 workflow 是当前剩余工作，未来不得绕过 GitHub 直接修改线上源码。

## 9. V2-B 的后续入口

如果后续决定把 Supabase 数据平面也迁到腾讯云，必须新建 ADR 和独立 Spec，至少回答：数据库/认证/Storage 的目标形态、数据导出与校验、RLS/RPC 兼容性、照片对象迁移、密钥轮换、备份恢复、停机窗口、数据完整性比对和回滚。V2-A 稳定前不启动这项工作。
