# 食迹 Foodprint MVP｜项目交接与开发回顾

> 更新日期：2026-07-23  
> 基线提交：`70bac83`（`main` / `origin/main`）  
> 本文用于新一轮需求讨论与开发文档编写。密钥、密码、数据库连接串不写入本文。

## 1. 产品定位与 MVP 范围

**食迹 Foodprint** 是一个邀请制的共同餐饮地图：只收录朋友亲自体验过、愿意推荐的地点，并把地点、评分、体验、照片与成员活动组织在一个共同小组里。

本轮 MVP 的移动端设计基线为 **iPhone Air 宽度 420px**。已上线版本的核心闭环是：

```text
Owner 建立共同小组 → 生成邀请链接 → 新成员邮箱注册/验证 →
搜索高德地点 → 填写真实体验 → 保存为共同地点 →
地图/列表、发现、动态、我的中查看与管理
```

## 2. 项目与线上资源

| 项目 | 当前信息 |
| --- | --- |
| GitHub 仓库 | `https://github.com/Erc2000xu/foodprint` |
| 主分支 | `main` |
| Vercel 生产地址 | `https://foodprint-nine.vercel.app/` |
| Vercel | GitHub 已关联；推送 `main` 自动生产部署 |
| Supabase 项目 ref | `kwlzzwnwicvkdtxnrcyh` |
| Supabase Edge Functions | `amap-poi-search`、`amap-static-map` |
| Owner 邮箱 | `1036424767@qq.com` |
| 当前技术栈 | Next.js 16 App Router、TypeScript、Tailwind CSS 4、Supabase、AMap、高德静态地图、Vercel、Vitest |

## 3. 开发阶段回顾

### Phase 0｜工程骨架与产品基线（完成）

- 建立 Next.js + TypeScript 项目、移动优先 App Shell、五项底部导航。
- 定义供应商适配器边界：认证、地点、标记、存储、POI 搜索、地图。
- 建立环境变量模板、README 与基础质量检查。
- 初始主页以「共同地图 + 欢迎引导」形式呈现；其中欢迎卡片在当时属于 Phase 0 引导内容，后续应按新版需求改为真实摘要/内容区。

### Phase 1｜账户、共同小组与邀请（完成）

- Supabase Email/Password 注册、登录、邮箱验证回调、找回密码、重设密码。
- Owner 初始化、共同小组、成员角色（Owner/Admin/Member）、邀请链接。
- 邀请链接支持有效期和最大使用次数；邀请 token 仅在生成时展示明文。
- `/admin` 已提供成员管理、邀请、个人标记/想去列表、数据导出入口。
- 所有主要表均有 RLS；权限判断在数据库/RPC 与服务端共同执行。

### Phase 2｜地点、真实标记与共同地图（完成，地图为静态图方案）

- 高德地点搜索：通过 `amap-poi-search` Supabase Edge Function 代理，避免在浏览器或 Vercel 中泄露高德 Web 服务 Key。
- 搜索结果支持定位排序、距离显示、城市标签。
- 新地点须和第一条真实标记一同创建；保存表单包含到访确认、综合评分、维度评分、是否愿意再去、日期、人均、推荐菜、体验文字、场景标签。
- 地图页支持地图/列表切换、咖啡馆、约会、评分 4+ 等快捷筛选。
- 为规避高德 JS 地图在 Vercel/境外运行环境的加载不稳定，地图底图最终改由 `amap-static-map` Supabase Edge Function 生成静态图片，再在网页显示地点标记。

### Phase 3｜发现、动态、想去与照片（完成）

- `/discover`：按小组平均分展示地点，支持主类型、城市、场景、评分、环境分、想去等组合筛选。
- `/activity`：展示小组真实标记动态。
- 想去（wishlist）：不计入评分，也不代表已到访。
- 私有照片画廊：上传前压缩、数量/体积限制、私有 Storage bucket、签名 URL、删除权限与审计边界。
- 地点详情：成员标记、评分、场景、照片等信息展示。

### Phase 4｜PWA、数据导出与运行加固（完成）

- PWA manifest、Service Worker、离线页、安装引导、更新提示。
- Service Worker **只缓存公开应用壳、图标和静态 bundle**；不缓存 API、搜索结果、签名照片 URL、共同地图数据。
- `/api/health` 健康检查。
- `/api/export`：成员导出个人数据；Owner 在配置了 `SUPABASE_SERVICE_ROLE_KEY` 后可导出全组 JSON，并记录审计事件。
- 运行、恢复、备份和 Vercel 回滚说明位于 `docs/OPERATIONS.md`。

## 4. 关键界面与代码入口

| 用户界面/能力 | 代码入口 |
| --- | --- |
| 共同地图主页 | `src/app/page.tsx`、`src/components/map/map-browser.tsx`、`static-amap-map.tsx` |
| 地点标记 | `src/app/mark/page.tsx`、`src/components/mark/mark-flow.tsx`、`src/app/mark/actions.ts` |
| 发现与筛选 | `src/app/discover/page.tsx`、`src/components/discover/discover-filters.tsx` |
| 动态 | `src/app/activity/page.tsx` |
| 地点详情/照片 | `src/app/place/[id]/page.tsx`、`src/components/mark/photo-picker.tsx` |
| 我的/成员/邀请/导出 | `src/app/admin/page.tsx`、`src/components/admin/` |
| Auth | `src/app/(auth)/`、`src/app/auth/callback/route.ts` |
| PWA | `src/app/manifest.ts`、`src/app/service-worker.js/route.ts`、`src/app/offline/page.tsx` |
| 高德服务端代理 | `supabase/functions/amap-poi-search/`、`supabase/functions/amap-static-map/` |
| 全局视觉与移动布局 | `src/app/globals.css`、`src/components/shell/app-shell.tsx` |

## 5. 数据库迁移状态

以下 migration 已按时间顺序推送至 Supabase Production：

1. `20260722130000_phase1_auth_groups.sql`
2. `20260722140000_fix_invitation_token_generation.sql`
3. `20260722141000_fix_invitation_hash_schema.sql`
4. `20260722142000_add_invitation_management_list.sql`
5. `20260722143000_phase2_places_and_marks.sql`
6. `20260722151500_fix_save_place_mark_place_id_ambiguity.sql`
7. `20260722155500_resolve_save_place_mark_column_conflicts.sql`
8. `20260722161000_phase3_wishlist.sql`
9. `20260723100000_phase2_scene_tags.sql`
10. `20260723113000_phase3_private_photos.sql`
11. `20260723114000_harden_photo_limits.sql`
12. `20260723120000_phase4_export_audit.sql`

后续变更必须新增 migration，**不要修改已在 Production 执行的旧 migration**。

## 6. 环境变量与第三方配置边界

| 变量 | 保存位置 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `.env.local` / Vercel | 当前生产地址；用于认证/邀请回调 |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` / Vercel | 可公开 Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local` / Vercel | 可公开 Publishable Key |
| `NEXT_PUBLIC_AMAP_KEY` | `.env.local` / Vercel | 高德 Web JS Key；需设置域名白名单 |
| `AMAP_SECURITY_KEY` | `.env.local` / Vercel | 高德 JS 安全密钥；仅服务端 |
| `AMAP_WEBSERVICE_KEY` | **Supabase Edge Function Secret** | 高德 Web 服务 Key；绝不能写入浏览器/Vercel 公共变量 |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel Production / 本地受控脚本 | 仅 Owner 全组导出和初始化脚本；绝不公开 |
| `FOODPRINT_OWNER_*` | 仅本地初始化脚本 | 初始化 Owner/小组临时使用；不提交 |

高德配置要点：

- JS Key 与 Web 服务 Key 是不同类型；曾出现 `USERKEY_PLAT_NOMATCH (10009)`，原因即为 Key 类型不匹配。
- 高德 JS Key 的域名白名单应包含生产域名；改白名单通常不会改变 Key 字符串，但需等待平台配置生效。
- POI/静态图使用 Web 服务 Key，经 Supabase Edge Function 调用，以规避 Vercel 出网与国内高德服务的可用性问题。

## 7. 已解决的关键技术问题

| 问题 | 原因与处理 |
| --- | --- |
| GitHub CLI 设备授权超时 | VPN/网络路径导致 GitHub 设备授权请求超时；后续使用已授权的本地 Git 连接推送。 |
| Supabase `db push` 提示 Docker 不可用 | Docker 仅用于 CLI migration catalog 缓存；终端出现 `Finished supabase db push` 时远程 migration 已成功执行。 |
| 邀请生成报 `gen_random_bytes` / `digest` 不存在 | PostgreSQL 扩展与函数调用边界问题；通过后续 migration 修复邀请 token/hash 生成。 |
| 保存标记报 `column reference "place_id" is ambiguous` | RPC 中同名列/参数歧义；通过两条修复 migration 显式限定字段，现已可保存。 |
| Vercel 调高德 POI 不稳定 | Vercel 运行区和高德国内接口路径/Key 类型产生问题；改为 Supabase Edge Function 代理。 |
| Edge Function 报 `tip.location.split is not a function` | 高德返回的 location 有多种类型；函数已兼容字符串/数组坐标。 |
| 互动式高德 JS 地图底图空白 | 在当前部署链路中加载不稳定；当前采用已验证可用的高德静态地图图片方案。 |
| 评分下拉框体验机械、星形显示错位 | 改为圆润评分控件、清除状态和必填/可选标记；用户已验收可保存。 |
| Profile 页底部导航消失 | `/admin` 重新纳入 `AppShell`；已修复。 |
| PWA 初版图标不符合产品视觉 | 用 ImageGen 生成腊肠狗资产组，替换 PWA 图标、欢迎、空状态、保存成功、离线页。 |
| 导航图标黑色边框 | 生成图裁切尺寸超过源图造成黑色填充；已按源图尺寸重裁切并加入圆角。 |

## 8. 当前已知限制与下一轮建议

这些不是本轮已承诺的“已完成”项，应由新开发文档明确优先级、交互规则与验收标准。

### 8.1 地图与首页

- 当前地图是**静态地图图片**，不是可平移、缩放、点按的互动式 Web 地图。
- 主页快捷筛选已计算 `visiblePlaces` 并把结果传给静态图函数，但当筛选没有结果时，页面没有足够显著的「当前无匹配地点」反馈；在少量测试数据下，用户容易认为按钮无效。
- 首页下半区仍保留 Phase 0 的欢迎/引导文案，缺少与真实地点、成员、推荐、活动关联的摘要模块。
- 新一轮可考虑：真实地图交互方案、静态图与列表联动反馈、地图摘要卡片、个性化/推荐内容。

### 8.2 地理筛选（用户已提出，待新版需求确认）

当前数据库 `places` 已有 `city` 与 `district`；没有标准化的 `business_district`（商圈）和 `metro_station`（地铁站）字段。

建议的新一轮层级结构：

```text
地点列表筛选
├─ 区域
│  ├─ 全城
│  ├─ 行政区（朝阳区、海淀区……）
│  └─ 商圈（望京、三里屯、国贸……）
├─ 地铁
│  ├─ 线路
│  └─ 站点
└─ 其他（品类、场景、评分、距离、想去）
```

实施前应确认：数据来源（高德返回、人工维护还是第三方地理数据）、首发城市、同一地点的多商圈/多地铁站规则、排序优先级、空状态和是否支持多人共享筛选链接。

### 8.3 视觉资产与导航

- 当前腊肠狗资产组已接入，底部导航为 ImageGen 生成的五张位图图标。
- 最新提交 `70bac83` 已将普通图标放大为 38px、标记图标为 46px，并设定浅鼠尾草绿/浅珊瑚粉圆角底色。
- 应在真机上继续验收图标的对比度、尺寸、PWA 缓存更新与 iPhone 安全区表现；如要长期扩展多色状态或深色模式，下一轮建议评估是否转为可控 SVG 图标系统。

### 8.4 当前未完成的截图归档

用户希望为全部界面生成一套截图，作为下一轮讨论素材。尝试使用 Chrome 自动化抓取线上站点时，受企业网络策略阻止，未能自动保存截图。

建议人工按 iPhone Air 尺寸截图下列状态：

1. 首页地图模式、首页列表模式；
2. 发现页与筛选展开状态；
3. 标记搜索结果、评分表单、保存成功；
4. 动态；
5. 我的/成员管理；
6. 地点详情与照片；
7. 登录、注册、找回/重设密码；
8. 离线页/PWA 安装引导。

## 9. 视觉资产清单

| 用途 | 项目路径 |
| --- | --- |
| PWA / 品牌图标 | `public/mascot/icon-192.png`、`icon-512.png`、`apple-touch-icon.png` |
| 首页欢迎插画 | `public/mascot/welcome.jpg` |
| 地图空状态 | `public/mascot/empty-map.jpg` |
| 标记成功页 | `public/mascot/mark-success.jpg` |
| 离线页 | `public/mascot/offline.jpg` |
| 底部导航 | `public/nav-icons/map.png`、`discover.png`、`mark.png`、`activity.png`、`profile.png` |

这些资产均通过 ImageGen 生成，角色设定为：暖棕色腊肠狗、深色耳朵、珊瑚橙项圈/点位、青绿配件；整体配色与 Foodprint 相同。

## 10. 本地开发、验证与发布

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

当前自动化测试：`tests/app-shell.test.tsx`、`tests/env.test.ts`。提交前至少运行 lint、typecheck、test、build。

本地 Supabase CLI 在 VPN 下可使用：

```bash
HTTPS_PROXY=http://127.0.0.1:5780 HTTP_PROXY=http://127.0.0.1:5780 npx supabase db push
```

发布流程：提交并推送 `main` → Vercel 自动生产部署 → 用 Owner 与普通成员各完成核心回归 → 在 Vercel Logs 与 Supabase Edge Function Logs 检查异常。

## 11. 交接时必须遵守的安全与数据规则

- 不提交 `.env.local`、高德 Web 服务 Key、Supabase Service Role Key、数据库密码或用户密码。
- 永远通过新增 migration 更新数据库；不要篡改已上线 migration。
- 不将私有照片 bucket 改为 public；签名 URL 不应进入 PWA 长期缓存。
- 地图/POI 的服务端代理不能绕过用户认证或泄露 Key。
- Owner 全组导出必须继续保留服务端角色校验与审计记录。
- Production 数据恢复采用向前修复 migration；不要在生产环境做破坏性回滚演练。

## 12. 最新提交脉络

| 提交 | 内容 |
| --- | --- |
| `70bac83` | 放大导航图标并使用区别于导航栏的圆角底色 |
| `14737f1` | 修复图标裁切产生的黑色边框，统一圆角 |
| `16a9aa8` | 接入五张底部导航图标与离线缓存 |
| `2ea5184` | 接入腊肠狗资产组与 PWA 图标 |
| `32f30df` | 完成 Phase 4：PWA、导出、运行加固 |
| `97938ac` | Phase 3：照片上传压缩优化 |
| `83f3c69` | Phase 3：私有照片画廊 |
| `93a4db2` | Phase 2：场景标签与地图/列表浏览 |
| `d3cb69b` | 修复高德地图安全加载与评分反馈 |

---

下一轮工作开始前，请以本文为现状基线，另行确认新版目标用户、首发城市、地图交互方案、区域数据来源、首页信息架构、视觉系统是否继续使用位图资产，以及每项功能的验收口径。
