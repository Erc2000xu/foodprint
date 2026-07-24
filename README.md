# 食迹 Foodprint

由朋友共同维护、只收录真实体验和真实推荐的餐饮地点地图。V1 以北京为首发城市，提供列表优先的结构化检索；静态地图与列表共享 URL 筛选状态，并为未来互动地图保留 Adapter 接口。

当前 MVP 已具备：邀请制邮箱注册/登录、共同小组与成员管理、高德地点搜索、真实体验标记、共同地图与列表、想去、组合筛选、私有照片画廊、PWA 安装、离线壳和数据导出。界面以 iPhone Air 宽度（420px）为优先移动端基线。

## 技术基线

- Next.js App Router + TypeScript + Tailwind CSS 4
- Node.js 22.22.2（见 `.nvmrc`）
- Vitest + Testing Library
- 后续首发：Supabase Auth / PostgreSQL / Storage、 高德 JS API 2.0、Vercel

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

`.env.example` 是唯一可提交的模板。实际值请只填写在 `.env.local` 和 Vercel 的私密环境变量中。

| 变量 | 用途 | 可见性 |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | 应用 URL 与认证回调基址 | 浏览器可见 |
| `NEXT_PUBLIC_MAP_PROVIDER` | 当前固定为 `amap` | 浏览器可见 |
| `NEXT_PUBLIC_AMAP_KEY` | 高德 Web JS Key | 浏览器可见，须绑定域名 |
| `AMAP_SECURITY_KEY` | 高德 JS 安全密钥 | 仅服务端 |
| `AMAP_WEBSERVICE_KEY` | 高德 Web 服务 Key，用于地点搜索 | 只保存于 Supabase Edge Function Secret；不设 `NEXT_PUBLIC_` |
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

业务功能将在后续阶段依赖这些接口，不能直接在页面和组件中散落调用 Supabase、高德或存储服务。这样可在未来以腾讯云 COS、国内认证和其他地图适配器替换底层实现，而不重写业务组件。V1 的生产容器、迁移步骤及备案后腾讯云切流清单见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。

## 高德免费版硬性约束

Foodprint 中长期只使用高德开放平台免费版在当前主体、用途和免费配额内明确允许的能力；不采购流量包、技术服务许可、增值套餐或高级服务。超出免费范围时必须停用/降级或改用其他合规方案，不能自动付费。具体能力清单、商圈数据策略、配额防线和合规前提见 [docs/AMAP_FREE_TIER_POLICY.md](docs/AMAP_FREE_TIER_POLICY.md)。

## 当前部署要点

1. 在 Vercel 配置 Supabase 公共变量及高德 JS Key / JS 安全密钥；不要把高德 Web 服务 Key 放到 Vercel 或浏览器。
2. 在 Supabase Edge Function Secrets 中配置 `AMAP_WEBSERVICE_KEY`，然后部署 `amap-poi-search`。地点搜索经该函数调用高德，避免公开 Web 服务 Key。
3. 所有数据库结构、RLS 与 RPC 都通过 `supabase/migrations/` 管理。执行 `supabase db push` 后再提交对应 migration；Docker 的本地 migration-cache 警告不代表远程迁移失败。
4. 首个 Owner 可由受控脚本初始化；邀请链接只由 Owner 生成。
5. PWA 不需要额外密钥：生产环境会自动注册 `/service-worker.js`。图标、manifest、离线页和安装引导已经内置。
6. Owner 的全量 JSON 导出需要 Vercel Production 中的 `SUPABASE_SERVICE_ROLE_KEY`；该 key 不会发送到浏览器。

## 数据库与回滚

所有 schema、RLS、RPC 与审计规则均位于 `supabase/migrations/`，按文件名时间顺序执行。生产恢复、导出内容、PWA 缓存边界与 Vercel 回滚步骤见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。
