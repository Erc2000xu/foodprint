# Foodprint V2.1｜低延迟与 PWA 用户体验验收清单

> 状态：代码与静态/公开入口检查已实现；完整 Node 工具链在当前工作区空转，腾讯云、真实手机网络和 7 天稳定观察待项目负责人执行。
> 日期：2026-08-06
> 范围：V2.1 P0/P1 应用、PWA、地图/搜索、性能记录和 Nginx 模板。

## 已由仓库实现

- [x] 公开 `/launch` 启动壳，不创建 Supabase client、不读取用户数据；manifest `start_url` 指向 `/launch`。
- [x] Service Worker 只预缓存公开启动/离线壳、图标和静态资源；导航超时后回退到启动壳，不缓存首页 HTML、RSC、API、签名照片、地图或 POI 结果。
- [x] 首次 Service Worker 接管不再无条件刷新；更新由用户点击“刷新更新”后触发。
- [x] proxy 对登录/找回密码/重置密码、启动/离线、manifest、Service Worker、健康检查和公开静态资源跳过 Supabase 会话刷新；受保护路径仍保留 SSR 会话刷新。
- [x] 首页一次读取用户/成员上下文；共同数据并行读取，有地点、标记、照片、标签和签名封面上限。
- [x] 首页不再触发行政区请求、批量商圈回填或 `router.refresh()`；行政区在打开菜单时按需请求。
- [x] AMap POI 搜索和静态地图有 8 秒超时；重复搜索可取消/忽略旧请求，列表可继续使用。
- [x] 底部导航关闭默认预取并显示即时 pending 状态；根 loading、路由 error 和地点卡片转场反馈已补齐。
- [x] 客户端 Web Vitals、导航、PWA 和 Service Worker 事件通过 `/api/metrics` 脱敏记录；服务端、发现读取和 proxy 分段耗时写入结构化日志。
- [x] Nginx 模板加入 request/upstream time、上游状态、静态缓存和页面/API/认证分离限速。

## 自动化检查

在仓库根目录执行：

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

本地应用启动后可采集公开入口基线：

```bash
PERFORMANCE_BASE_URL=http://127.0.0.1:3000 PERFORMANCE_SAMPLES=5 npm run perf:baseline
```

截至 2026-08-06，manifest/Service Worker/Owner 回填边界的静态契约检查已通过；`npm run lint`、`npm run typecheck`、`npm run test` 和 `npm run build` 在当前工作区均出现无输出空转，未将其记为通过。

生产/预发布 Nginx 改动必须在服务器执行 `nginx -t`，再访问 `/api/health`；不要把真实 Cookie、Authorization、邮箱、搜索词、坐标或照片 URL 放入日志或基线文件。

## 真实设备与中国大陆网络

| 设备/网络 | 状态 | 需要记录 |
| --- | --- | --- |
| iPhone Safari 普通标签页 | 待执行 | `/login` 可见、DNS/TLS/TTFB/FCP/LCP/INP/CLS |
| iPhone Safari PWA 冷/暖启动 | 待执行 | 启动壳、应用壳、首页数据、Service Worker 接管/重载 |
| Android Chrome PWA 冷/暖启动 | 待执行 | 同上 |
| 桌面 Chrome 未登录/已登录 | 待执行 | 首页与五个底部导航 pending、完成耗时 |
| 中国大陆蜂窝网络 | 待执行 | 首页、地点详情、地图、搜索 p50/p75/p95 |
| 中国大陆 Wi-Fi | 待执行 | 首页、地点详情、地图、搜索 p50/p75/p95 |

验收时同时检查 Cache Storage：不得出现首页/地点详情/饭后聊/我的/管理页 HTML、RSC、`/api/*`、Supabase Auth 响应、签名照片 URL、地图图片或 POI 搜索结果。

## 未在本地可证明的项目

- 腾讯云真实 Nginx 语法、5 Mbps 带宽、A/AAAA/IPv4/IPv6、TLS 和上游长尾需要服务器/真实网络执行。
- Supabase Auth、PostgreSQL、Storage、Edge Function 的线上 p75/p95 需要真实登录账户和服务端日志；V2.1 不迁移数据平面。
- iOS/Android PWA 冷启动和 7 天稳定观察需要项目负责人在真实设备上完成。
