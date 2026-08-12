# Foodprint｜V2.1 低延迟与 PWA 用户体验实现记录

> 实现日期：2026-08-06
> 状态：仓库内 P0/P1 开发完成，待腾讯云/真实设备验收与稳定观察
> 正式入口：`https://foodprint.com.cn`

## 本次实现

- 公开启动壳 `/launch` 与 manifest `start_url`，提供慢网重试和离线入口。
- 版本化 Service Worker：公开壳可预缓存，导航 8 秒超时回退；首次接管不自动刷新，更新由用户确认。
- 收窄 Supabase proxy 会话刷新范围；健康检查、认证表单和公开静态资源不再等待远程会话检查。
- 首页复用一次认证/成员上下文，成员、地点、统计、评价、菜系、照片、愿望单和缓存数据并行读取并设上限；仅首屏地点生成短期签名封面 URL。
- 移除首页行政区加载和批量商圈回填；行政区改为打开菜单时按需加载。
- POI 搜索与静态地图增加超时、取消/过期请求保护和列表降级。
- 底部导航关闭默认预取并显示 pending 状态；增加根 loading、路由错误重试和地点卡片链接反馈。
- 增加脱敏性能记录 API、浏览器 Web Vitals/PWA 事件记录、Next/发现读取/proxy 结构化耗时日志，以及本地公开入口基线脚本。
- Nginx 模板加入 request/upstream time 日志字段、静态缓存和页面/API/认证分离限速。

## 自动化结果

| 检查 | 结果 |
| --- | --- |
| `npm run lint` | 未完成：当前工作区 ESLint 进程无输出空转，已安全停止 |
| `npm run typecheck` | 未完成：当前工作区 TypeScript 进程无输出空转，已安全停止 |
| `npm run test` | 未完成：Vitest 单文件串行运行仍无输出空转，已安全停止 |
| `npm run build` | 未完成：此前 Next 构建进程无输出空转，已安全停止 |
| Node/TS/TSX 语法检查与 manifest/SW 契约 | 已通过 |
| `npm run perf:baseline`（无服务端口的失败采样） | 已通过：脚本正常输出，HTTP 状态为 0 |
| 生产 Docker standalone | 待腾讯云/CI 复跑 |
| 真机 PWA 与中国大陆网络 | 待负责人执行 |

验收清单见 [`docs/acceptance/V2_1_PERFORMANCE_UX_ACCEPTANCE_CHECKLIST_2026-08-06.md`](../acceptance/V2_1_PERFORMANCE_UX_ACCEPTANCE_CHECKLIST_2026-08-06.md)。

## 安全与回滚边界

- 未新增数据库 migration，未迁移真实 Supabase 数据，也未改变 RLS、邀请制、角色权限或地点推荐逻辑。
- Service Worker 不缓存私有页面、API、RSC、Auth、签名 URL、照片、地图或搜索结果。
- 应用回滚前先发布可接管的旧/修复 Service Worker，再恢复上一条镜像；不使用 `Clear-Site-Data` 清理用户会话。
- Nginx 发布前执行 `nginx -t`，发布后检查 `/api/health`；异常时恢复上一条已验证镜像并重启 `foodprint-compose.service`。

## 已知限制

- 当前工作区只能证明代码、自动化检查和本地公开入口；无法代替腾讯云真实指标、iOS/Android 真机和 7 天稳定观察。
- 若 V2.1 P0/P1 后 Supabase Auth、数据库、Storage 或 Edge Function 的 p95 仍超过页面预算，另立 V2-B 数据平面 ADR/Spec，不在本版本继续迁移。
