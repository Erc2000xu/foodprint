# 食迹 Foodprint｜P0 高德可靠性与安全基线发布交接

> 发布：2026-07-28
> 状态：已关闭
> Production：<https://foodprint-nine.vercel.app>
> GitHub：PR #8，Vercel Production `469272b`

## 已交付

- 两个高德 Supabase Edge Function 使用 `APP_ALLOWED_ORIGINS` 的精确 Origin 白名单；不允许通配符或随部署变化的 Preview URL。
- 高德 Web Service Key 仅保存在 Supabase Edge Function Secret；不在浏览器或 Vercel 运行变量中使用。
- 首页的高德地点建议已改由 Edge Function 提供，避免 Vercel 服务端直连高德造成的环境漂移。
- 高德错误不再向用户暴露供应商 `infocode` 或内部详情；地图失败可显示非技术性提示并保留列表浏览与重试入口。
- Edge Function 记录不含关键词、坐标、用户身份或密钥的匿名 `amap_event` 运行事件。

## 发布配置与验证

- Supabase Secret 已配置 `APP_ALLOWED_ORIGINS`，包含 Production 与本地开发地址；Preview 默认不被授权。
- `amap-poi-search` 与 `amap-static-map` 已发布。
- 项目负责人已确认 Production 的登录、标记页地点搜索、首页“王府井”地点建议、地图入口和错误降级通过。

## 运维与回滚

- 每次地图、域名或部署来源调整，按 [AMAP_OPERATIONS_RUNBOOK.md](./AMAP_OPERATIONS_RUNBOOK.md) 复核 Origin、Key 白名单、配额和桌面/手机路径。
- 若地图调用错误率显著上升，先保留列表优先体验，再在 Vercel 将 Production 回退至上一个已验证部署；数据库不参与本版本回滚。
- 需要验收某一 Preview 时，只能临时加入其完整 Origin、重新部署两个 Edge Function，并在验收后立即移除。

## 后续

P0 没有未完成的产品能力。下一阶段仅在项目负责人批准 [V1.2 Spec](./specs/2026-07-v1-2-discovery-try-list.md) 后开始。
