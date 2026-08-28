# Foodprint V2.4.2 实施记录｜附近优先、管理中心与本次人均

日期：2026-08-28  
Spec：`docs/specs/2026-08-v2-4-2-nearby-management-price.md`  
状态：已合入 main 并完成正式发布；代码、向前兼容 migration、数据库 schema lint、类型检查、完整测试、生产构建、PR 官方 CI、生产 migration history 审计、生产回填审计与线上健康检查均通过；待真实设备/PWA 验收与生产观察

## M0 与基线

- 已通读本版本 Spec、`docs/PRODUCT.md`、`docs/ROADMAP.md`、`docs/DEVELOPMENT_WORKFLOW.md`、`docs/RELEASE_SOP.md`、`docs/SECURITY_COMPLIANCE_BASELINE.md`，以及 V2.4/V2.4.1 地图、照片上传恢复和证据交接文档。
- 开始时分支为 `codex/fix-release-transfer`，HEAD 为 `d914dc0`。仓库已有用户改动；实现只在目标文件追加/修改，没有覆盖既有改动，也没有修改已发布 migration。PR #44 已整合远端 main 的照片/发布修复，并于正式发布前合入 main；当前线上 commit 为 `812482f716e8eacc2604c82c624306bed902ee85`。工作分支保留，未删除。
- M0 根因：定位只由手动入口触发且与距离排序耦合；定位回调/后续 fit 可能争抢镜头；管理页把有上限的旧列表直接堆叠；预览态固定 `190px` 且操作区在滚动内容内；V1.3 `visit_records` 没有价格字段，读模型取最新价而非有效到访平均。
- 仓库分支检查还发现 Git 有一个既存的异常 ref 名称警告：`refs/heads/codex/v1-4-typography-copy 2`。本次未触碰该 ref。

## 实际改动

### 定位、搜索与地图状态机

- 新增 `src/lib/discovery/location-session.ts`：首次应用内说明、设备/登录用户作用域的布尔偏好、拒绝后不循环请求；不写入坐标。
- 新增退出登录入口：退出前清除当前用户的定位偏好并清空本页内存位置状态，随后复用既有服务端 `signOut`。
- 新增 `src/lib/discovery/map-camera.ts` 与 `src/lib/amap/location-options.ts`：明确 provider fallback、fit all、return state、explicit search、manual locate、manual drag/zoom 的优先级；使用一次性高德定位参数，不使用 `watchPosition`。
- `src/components/map/map-browser.tsx`：自动定位与距离排序解耦；定位点只驻留本次 React 内存；返回视野仅使用内存缓存；选中的 POI URL 只保留身份，不保留原始经纬度；拒绝、超时、不可用、附近为空分别反馈；增加隐私与位置开关入口。
- `src/components/map/map-adapter.tsx`：增加请求代次、相机请求 ID 和手势失效保护，迟到定位不会抢走用户镜头；保持 V2.4.1 pin/photo 行为。
- `src/lib/performance/metrics.ts`：登记首次定位说明的接受/拒绝事件，修复 typecheck 漏洞；事件不携带坐标或金额。
- V2.4.2 migration 末尾对既有 `delete_my_visit_record` 与 `restore_group_place` 做同签名的列名限定，消除 schema lint 歧义；不改已发布 migration，不改变旧 RPC 调用路径。

### 独立管理中心

- 新增 `/admin/content` 与 `src/components/admin/content-management-center.tsx`。
- `src/app/admin/page.tsx` 的“我的”页只保留真实摘要与入口；旧的长列表不再作为四类管理列表渲染，保留既有地点信息补全/照片维护面板。
- 新增 Owner/Admin 当前 group 作用域的真实计数、状态筛选、地点名/地址搜索、稳定 `(sort_at,id)` keyset 分页、空态、加载态、可重试错误态和恢复操作；每页默认 20、上限 50，SQL 不返回正文或照片内容。

### Bottom Sheet

- 地点预览改为动态 `clamp` 高度与 `max-height`，信息区独立滚动，操作区固定在滚动区外；按钮至少 44px，考虑底部导航与 safe-area。
- 0 个附近结果时把次操作替换成“查看全部地点”，不渲染无效按钮。

### 本次人均与全端展示

- 新增 `supabase/migrations/20260827090000_v2_4_2_nearby_management_price.sql`，新增 `visit_records.price_per_person numeric(10,2)`、约束、有效记录索引、版本化写入/发现/详情/导出/管理 RPC 和 grants；旧 RPC 保留。
- 首次标记与重复到访表单均加入“本次人均（可选）”，服务端严格校验 1–99999 元、最多两位小数，空值合法。
- 只有 `legacy_visit_id = visits.id` 且旧价格有效的确定性一一对应关系才回填；不覆盖新值、不猜测无法证明的历史值。回填块执行时用 PostgreSQL `NOTICE` 输出实际更新行数。
- 发现列表、地图卡片、详情摘要都使用有效、非隐藏、非删除且已填写价格的算术平均和样本数；列表/地图四舍五入到整元，时间线保留最多两位小数；个人导出包含授权用户自己的 `price_per_person`。
- 精确金额不进入审计 metadata、指标、公共缓存或共享筛选状态；按已批准 Spec，它仅作为授权范围内 `visit_records` 与个人/小组可见时间线、导出的权威业务数据保留。
- V2.4.1 Worker/WASM、FormData、照片缩略图和 9 张上限链路未改写。

## 数据迁移与回填

- 新 migration 是 forward-only，未改写 29 个已发布 migration。
- GitHub 生产 migration history audit run `33159484029` 已通过：本地和生产均到 `20260818100000`，未发现缺失或漂移的历史版本；正式发布 run `33159851861` 的 dry-run 列出且随后成功应用 `20260827090000_v2_4_2_nearby_management_price.sql`。
- 计划中的确定性回填 SQL 已加入；本地干净 `--no-seed` 库查询到 `visit_records_total=0|price_nonnull=0|legacy_links=0`，所以本地本次回填候选为 0。正式发布日志没有保留 migration 内 `RAISE NOTICE` 的回填行数，但随后在 GitHub Actions 生产只读审计 run `33166779531` 中取得了不输出金额/坐标的聚合结果：`deterministic_backfill_candidates=1`、`deterministic_backfill_applied=1`、`deterministic_backfill_missing=0`、`priced_visit_records_total=1`。由于新列在本 migration 中新增、统计限定为 migration 开始前已存在且唯一 `legacy_visit_id` 的有效关系，这 1 条是本次确定性回填的实际数量。
- 没有执行任何破坏性 down migration，也没有物理删除旧字段、旧 RPC 或照片数据。

## 自动化验证证据

| 检查 | 结果 | 证据/原因 |
| --- | --- | --- |
| 改动相关 TypeScript 转译语法检查 | 通过 | Node `typescript.transpileModule` 最终检查 33 个 TS/TSX 文件，输出 `transpile syntax OK: 33 files` |
| `git diff --check` | 通过 | 目标改动文件无空白错误 |
| `npm run lint` / PR 官方 lint | 通过 | PR CI final run `33159635422` 的 application job 通过；本机直接 ESLint 仍会无输出卡住，不能作为本地 lint 证据 |
| `npm run typecheck` | 通过 | 修复定位说明 metric 名称联合类型后，`npm run typecheck` exit 0 |
| `npm test` | 通过 | 使用工作区 bundled Node v24.19.0 按项目默认配置运行，47 个文件、151 条测试全部通过 |
| V2.4.2 纯合同/逻辑定向测试 | 通过 | 5 个文件、14 条测试通过：价格、定位偏好、地图镜头、SQL/隐私合同、移动视口 |
| `npm run build` | 通过 | bundled Node + 受控本机权限；Turbopack 编译成功、TypeScript 成功、20/20 静态页生成、路由优化完成，含 `/admin/content` |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase status` | 通过 | Docker Desktop 恢复后，本地 DB/API/Studio 容器均可用 |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase db reset --local --no-seed` | 通过 | 全部历史 migration 与 `20260827090000_v2_4_2_nearby_management_price.sql` clean replay 成功 |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local` | 通过 | 二次 clean replay 后返回 `No schema errors found` |
| 本地只读 SQL 合同检查 | 通过 | migration 登记 `1`；价格约束 `1`；核心表 RLS 全部 `true`；V2.4.2 RPC `9` 个、旧关键 RPC `6` 个均共存 |
| GitHub PR CI | 通过 | final run `33159635422`：application 与 migration-integrity 均成功；官方 application 包含 lint、typecheck、全量测试、production build 与 ICP build check |
| Production migration history audit | 通过 | run `33159484029`：production history 与 main 本地 history 均到 `20260818100000` |
| Production V2.4.2 backfill audit | 通过 | run `33166779531`：应回填 `1`、已回填 `1`、缺失 `0`、当前有价格到访记录 `1`；仅输出聚合数量 |
| 正式生产发布 | 通过 | run `33159851861`；三道预检、production migration、POI Edge Function、不可变镜像、94,327,855 字节发布包上传、腾讯云安装与公网 `/api/health` 校验均成功 |
| 发布后公网健康检查 | 通过 | `https://foodprint.com.cn/api/health` 返回 `status=ok`、版本 `812482f716e8eacc2604c82c624306bed902ee85`；首页 HTTP 200 |
| 线上页面冒烟 | 部分通过 | 正式发现页加载并显示首次附近定位说明、可访问地点 marker；`/admin/content` 加载并显示 Owner/Admin 管理中心及真实计数；本机浏览器的移动尺寸覆盖未生效且第三方统计请求超时，未将其当作真机证据 |

已新增的合同覆盖：价格边界/平均、定位偏好、相机优先级与过期回调、原始坐标不进入共享状态、SQL/RPC/grant/旧 RPC 保留、审计不带金额、Owner/Admin 管理分页与重试、表单字段、Bottom Sheet 动态布局、移动最小点击区及照片链路保护。

## 外部门禁与已知限制

- 本地 clean replay、SQL/RLS/RPC 结构检查、完整测试、生产构建、PR 官方 lint/构建、正式发布和生产回填审计均通过；本地使用 `--no-seed` 空库没有产生可代表生产的回填样本，但生产实际回填数量已由 `33166779531` 补证为 1。
- 本机 ESLint 仍会无输出卡住，但同一候选提交的 GitHub 官方 application job 已通过 lint；本地卡住是开发机工具表现，不再阻塞候选发布。
- 正式发布 workflow 已通过 Chromium/WebKit 实际浏览器上传和 PWA gates；仍没有完成 iOS Safari、Android Chrome、已安装 PWA、北京定位/上海数据情景和 200% 字体的物理真机验收，也没有完成生产 canary、回滚演练与 24 小时观察。
- 正式 migration 步骤曾出现一次 Supabase CLI 的非阻断警告：`failed to cache migrations catalog`，根因是 `pg-delta` 连接超时；CLI 随后记录 `Finished supabase db push`，后续 POI 部署、应用安装、公网健康检查和生产只读回填审计均成功。该警告不改变已成功发布的结论，但应在后续运维窗口检查连接稳定性。
- AMap 选中的商圈/地铁 POI 的半径匹配锚点只保存在本次页面内存；分享/刷新后只保留 POI 身份与文本，不能在无 provider 锚点时复现精确半径，退回身份字段匹配。这是隐私边界下的已知限制。
- 发现 RPC 复用 V2.4.1 的 V2.3 读模型并仅追加价格聚合；清理历史 RPC/生成类型仍应另版进行。

## 精确回滚步骤

1. 若腾讯云安装器的服务重启、本机健康检查或 Nginx reload 失败，安装器会自动恢复 `/opt/foodprint/previous` 指向的上一份 release；先以 `/api/health` 和页面访问确认，不要手工改源码或覆盖镜像。
2. 若发布后发现功能问题，先暂停继续发布并保留当前证据；通过 PR 做一个向前的 `git revert`/修复提交，把 main 恢复到上一份已验收版本，再按同一 `Release production` 流程发布。不要直接在生产服务器执行临时切换。
3. 可先设置 `DISCOVERY_LOCATION_ON_ENTRY_ENABLED=false`，关闭自动进入定位；手动定位入口保持可用。地图、管理、价格也可以按修复提交分阶段回退。
4. 应用回退后可继续使用旧 `list_discovery_index_v2_3`、`get_group_place_detail_v2`、旧写入 RPC、旧导出 RPC 和旧管理入口；新 migration 创建的列与 RPC 保留，不做破坏性 down migration。旧客户端不识别新字段时仅忽略它。
5. 数据库不执行 reset、删列、删函数或删除回填数据；如果发现数据问题，先冻结相关新写入，备份并通过新的 forward-only migration 修正，完成审计和验证后再恢复流量。
6. 保持 V2.4.1 照片 Worker/WASM、缩略图与私有 Storage 边界原样，不通过回滚本版本去删除或重建照片数据；腾讯云不可用时才按 RELEASE_SOP 使用保留的 Vercel 旧 Production 入口作为人工应急落点。

生产部署和 main 合并已执行，工作分支未删除；下一步是由负责人在正式站点完成真实设备/PWA 验收，并观察 24 小时。精确生产回填行数已补入本记录。
