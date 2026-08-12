# 食迹 Foodprint

由朋友共同维护、只收录真实体验和真实推荐的餐饮地点地图。V1 以北京为首发城市，提供列表优先的结构化检索；静态地图与列表共享 URL 筛选状态，并为未来互动地图保留 Adapter 接口。

项目的长期起源、产品目标、部署路线和不可忽略的约束见 [项目背景与长期约束](docs/PROJECT_CONTEXT.md)；当前 V1.1 的交接与发布状态见 [V1.1 状态交接](docs/FOODPRINT_V1_1_STATUS_HANDOFF_2026-07-24.md)。

V1.1.1 的邀请与成员治理需求、权限规则和验收标准见 [V1.1.1 开发文档](docs/FOODPRINT_V1_1_1_INVITATION_MEMBER_GOVERNANCE.md)。

本轮 V1.1.1 的发布、配置、验证记录与后续事项见 [V1.1.1 发布交接](docs/FOODPRINT_V1_1_1_RELEASE_HANDOFF_2026-07-27.md)。

V1.3.3“记一顿”表单故障修复、生产迁移、验收结果与后续运维注意事项见 [V1.3.3 表单故障修复交接](docs/FOODPRINT_V1_3_3_MARK_FORM_BUGFIX_HANDOFF_2026-08-03.md)。

V2-A 的大陆域名与腾讯云迁移文档、运行边界、切流/回滚顺序和负责人外部配置清单见 [V2 大陆域名与腾讯云迁移开发交接](docs/FOODPRINT_V2_MAINLAND_DOMAIN_MIGRATION_DEVELOPMENT_HANDOFF_2026-08-05.md)。V2-A 已完成 `foodprint.com.cn` 的腾讯云上线；当前进入稳定期，仍以交接文档中的剩余回归、监控和自动化发布事项为准。

本次上线记录见 [V2-A 腾讯云上线记录](docs/releases/2026-08-06-v2-tencent-cutover.md)。

从 V1.1.1 收口后，产品定位与当前版本基线以[产品总览](docs/PRODUCT.md)为准；版本方向、状态与进入条件以[产品路线图](docs/ROADMAP.md)为准；每次开发都遵循[产品开发工作流](docs/DEVELOPMENT_WORKFLOW.md)。

当前 MVP 已具备：邀请制邮箱注册/登录、共同小组与成员管理、高德地点搜索、真实体验标记、共同地图与列表、想去、组合筛选、私有照片画廊、PWA 安装、离线壳和数据导出。界面以 iPhone Air 宽度（420px）为优先移动端基线。

## 技术基线

- Next.js App Router + TypeScript + Tailwind CSS 4
- Node.js 22.22.2（见 `.nvmrc`）
- Vitest + Testing Library
- 生产运行：腾讯云轻量应用服务器 + Nginx + Docker Compose
- 后端数据平面：Supabase Auth / PostgreSQL / Storage / Edge Functions
- 过渡回滚：Vercel 保留旧生产部署，不作为当前正式入口

## 本地启动

```bash
cp .env.example .env.local
npm install
npm run dev
```

不要把 `.env.local`、高德安全密钥、Supabase Service Role Key 或数据库密码提交到 Git。当前骨架即使未填写真实密钥也可以启动；地图区域会显示明确的 Phase 0 占位说明。

## 质量检查

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## 环境变量

`.env.example` 是唯一可提交的模板。实际值请只填写在 `.env.local`、腾讯云 `/etc/foodprint/production.env` 或受控平台的私密环境变量中；真实配置文件不得进入 Git。

| 变量 | 用途 | 可见性 |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | 应用 URL 与认证回调基址 | 浏览器可见 |
| `NEXT_PUBLIC_MAP_PROVIDER` | 当前固定为 `amap` | 浏览器可见 |
| `NEXT_PUBLIC_AMAP_KEY` | 高德 Web JS Key | 浏览器可见，须绑定域名 |
| `AMAP_SECURITY_KEY` | 高德 JS 安全密钥 | 仅服务端 |
| `AMAP_WEBSERVICE_KEY` | 高德 Web 服务 Key，用于地点搜索 | 只保存于 Supabase Edge Function Secret；不设 `NEXT_PUBLIC_` |
| `INVITATION_TOKEN_ENCRYPTION_KEY` | 加密保存仍有效的邀请 token，便于 Owner/Admin 刷新后重新复制链接 | 仅 Vercel/受控服务端；随机值至少 32 字符，绝不提交 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | 浏览器可见 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable Key | 浏览器可见 |
| `SUPABASE_SERVICE_ROLE_KEY` | 仅用于受控服务端任务 | 仅服务端 |
| `STORAGE_PROVIDER` | 首发固定为 `supabase` | 仅服务端 |
| `DATABASE_URL` | migration 或受控服务端直连 | 仅服务端 |

## 架构边界

`src/lib/adapters/` 定义并隔离下列供应商接口：

- `AuthProvider`
- `PlaceRepository`
- `MarkRepository`
- `StorageProvider`
- `PoiSearchProvider`
- `MapProvider`

业务功能将在后续阶段依赖这些接口，不能直接在页面和组件中散落调用 Supabase、高德或存储服务。这样可在未来以腾讯云 COS、国内认证和其他地图适配器替换底层实现，而不重写业务组件。当前腾讯云生产容器、域名、回滚和后续运维清单见 [docs/OPERATIONS.md](docs/OPERATIONS.md)；数据库/Edge Function 发布顺序和未来腾讯云自动部署边界见 [docs/RELEASE_SOP.md](docs/RELEASE_SOP.md)。

## 高德免费版硬性约束

Foodprint 中长期只使用高德开放平台免费版在当前主体、用途和免费配额内明确允许的能力；不采购流量包、技术服务许可、增值套餐或高级服务。超出免费范围时必须停用/降级或改用其他合规方案，不能自动付费。具体能力清单、商圈数据策略、配额防线和合规前提见 [docs/AMAP_FREE_TIER_POLICY.md](docs/AMAP_FREE_TIER_POLICY.md)。

## 当前部署要点

1. 在腾讯云生产环境配置 Supabase 公共变量及高德 JS Key / JS 安全密钥；不要把高德 Web 服务 Key 放到浏览器。Vercel 仅作为过渡期回滚环境保留。
2. 在 Supabase Edge Function Secrets 中配置 `AMAP_WEBSERVICE_KEY` 与 `APP_ALLOWED_ORIGINS`，然后同时部署 `amap-poi-search` 和 `amap-static-map`。`APP_ALLOWED_ORIGINS` 只填写精确的生产/本地地址；地点搜索与静态地图均经这些函数调用高德，避免公开 Web 服务 Key。
3. 所有数据库结构、RLS 与 RPC 都通过 `supabase/migrations/` 管理。先提交 migration 并通过 CI；项目负责人手动批准后，GitHub Actions 才依序应用到 production。当前腾讯云应用发布仍是本轮迁移期间的人工例外，后续应由 GitHub Actions 接管；不得在生产 SQL Editor 粘贴常规 migration，也不得从本机临时执行 `db push`。
4. 首个 Owner 可由受控脚本初始化；邀请链接只由 Owner 生成。
5. PWA 不需要额外密钥：生产环境会自动注册 `/service-worker.js`。图标、manifest、离线页和安装引导已经内置。
6. Owner 的全量 JSON 导出需要受控生产环境中的 `SUPABASE_SERVICE_ROLE_KEY`；该 key 不会发送到浏览器。

## 数据库与回滚

所有 schema、RLS、RPC 与审计规则均位于 `supabase/migrations/`，按文件名时间顺序执行。生产恢复、导出内容、PWA 缓存边界与 Vercel 回滚步骤见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。
