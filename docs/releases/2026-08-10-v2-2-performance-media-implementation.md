# V2.2 启动、导航与私有图片性能实现记录

日期：2026-08-10  
状态：仓库实现已落地；本地验收与真实生产验收未完成，不宣称 V2.2 已通过。

## 已落地

- `/launch` 使用 `router.prefetch + startTransition + router.replace`，保留启动壳；2.5 秒慢提示、6 秒重试/离线提示和显式用户重连保留。
- Service Worker 只缓存公开启动壳、静态资源、图标和字体；文档导航网络等待上限 3 秒，不缓存 HTML/RSC/API/私有照片/签名 URL。
- 根级 `NavigationCoordinator`、意图预取、路由 loading/error、content-ready marker、10 秒安全超时和批量客户端指标上报。
- 请求级 active group context、首页/活动/地点详情新增读 RPC；主列表首批分别限制为发现 20、活动 20、候选 30、图库 12、时间线 20，管理个人摘要 10。
- `photos` 仅新增可空 thumbnail 元数据；canonical 不改写。新上传服务端校验 WebP 魔数/尺寸/像素/字节，生成稳定 photo ID，双尺寸对象路径，最多两组并发并做失败清理。
- 私有 `PrivatePhoto` 组件覆盖发现卡片、活动、地点图库/时间线，使用批量签名、固定尺寸、占位/加载失败/重试和最多一次 photo-ID 重签。
- UI 思源黑体子集：714 个固定 UI 字符，约 150KiB；保留全量字库作为生成输入/回滚资产，CSS 不再引用全量文件。
- 新增 `scripts/backfill-photo-thumbnails.mjs`（默认 dry-run）和 `scripts/audit-photo-thumbnail-orphans.mjs`，不输出密钥、签名 URL 或完整 object key。

## 必须由验收者完成

1. 在干净 Supabase 测试库按历史 migration 顺序重放，再重放 `20260810120000_v2_2_read_models_and_photo_thumbnails.sql`；验证历史 migration hash 不变，并执行匿名、跨组、removed/suspended、Member/Admin/Owner 权限回归。
2. 先用 `.env.local` 执行 `npm run photos:backfill` dry-run；只对测试小组小批量执行 `npm run photos:backfill -- --execute`，确认失败率不超过 1% 后才考虑全量。生产 Docker/腾讯云目标架构需先验证 `sharp` 安装、构建、内存和 9 图压力。
3. 运行 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build`、`npm run perf:resources`；逐项记录结果。当前工作区的 lint/typecheck/test 在本机均出现无输出长时间不退出，不能当作通过。
4. 用 iPhone Safari PWA、Android Chrome、中国大陆 Wi-Fi/蜂窝网络分别做冷启动、暖启动、更新、断网、页面切换、照片上传/删除/重签；每个核心场景至少 20 次，并保留网络瀑布与性能批次数据。

## 回滚边界

应用可回滚到上一个代码 release；新 migration 不做破坏性回滚。旧 canonical 对象和旧字段保留，thumbnail 回填停止即可让应用继续显示占位。孤儿审计脚本只报告，不自动删除对象。
