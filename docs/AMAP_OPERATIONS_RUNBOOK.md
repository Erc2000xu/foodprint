# 高德连接运行手册

> 适用：当前腾讯云 + foodprint.com.cn 生产环境
> 更新：2026-08-12；V2.3 动态地图默认进入，失败直接切列表，不再使用静态地图
> 关联：P0 高德连接可靠性与安全基线、AMAP_FREE_TIER_POLICY.md、FOODPRINT_V2_3_DYNAMIC_MAP_DEVELOPMENT_HANDOFF_2026-08-12.md

## 配置清单

| 项目 | 所在位置 | 维护规则 |
| --- | --- | --- |
| JavaScript API Key 域名白名单 | 高德控制台 | 仅稳定生产域名与必要临时 Preview；每次变更记录日期和负责人 |
| Web Service Key | Supabase Edge Function Secret | 仅服务端使用；不可打印、不可提交 |
| JS 安全密钥 | 腾讯云服务端环境变量 / Next.js 同源代理 | 仅服务端；固定 /api/amap/_AMapService 路径 |
| APP_ALLOWED_ORIGINS | Supabase Edge Function Secret/配置 | 精确 scheme + host + port 列表；不使用通配符 |
| DISCOVERY_DYNAMIC_MAP_ENABLED | 腾讯云 production.env | 正常为 true；故障或额度风险时 false，重启容器后列表默认 |
| 地图免费额度 | 高德控制台 | 动态地图上线后每周看趋势、每月归档；80% 告警、预计超额或 90% 前关图，不自动付费 |

## 当前故障排查

1. 记录用户访问的精确页面地址、时间、网络与操作，不索要账户密码或完整精确位置。
2. 浏览器网络面板检查 Foodprint 请求：若为 403，先比对 Origin 与 APP_ALLOWED_ORIGINS；若高德返回鉴权类 infocode，检查对应 Key 白名单。
3. 分别检查动态地图、地点搜索和导航，因为它们是不同调用链：动态地图走 JS Key + 腾讯云同源安全代理；地点搜索走 Supabase Edge Function + Web Service Key；导航走 URI。
4. 动态地图先检查浏览器对 /api/amap/_AMapService/ 的状态：403 核对域名 / Origin，429 核对专用限流和异常流量，5xx 核对腾讯云服务端变量及高德上游；不得复制带查询串的 URL。
5. 检查腾讯云应用 / Nginx 与 Supabase Edge Function 日志中的匿名错误类别和部署版本；不得复制或分享 Secret、查询词或坐标。
6. 动态地图达到故障止血条件时将 DISCOVERY_DYNAMIC_MAP_ENABLED=false 并滚动重启；确认发现页直接进入列表且不再产生 JS API 请求。
7. 若无法在十分钟内恢复，保持列表模式并创建故障记录，说明影响、时间、临时处理和后续修复；不要启用静态地图。

## 每次发布检查

- 确认发布 URL 是否为受控 Origin；若不是，不发布或先添加精确授权。
- 核对 Edge Function 允许地址、腾讯云 production.env、同源安全代理与高德 JS 域名白名单。
- 在桌面和手机分别测试：输入地点、选择 POI、动态地图拖拽 / 缩放 / Pin / 聚合 / 当前范围抽屉、切换完整列表和打开导航。
- 人为将动态地图开关设为 false 做止血演练；确认列表可用、不下载 SDK、不调用静态地图，再恢复 true。
- 检查错误状态、控制台无密钥泄漏、日志无原始用户敏感数据。
- 检查 JS 地图初始化用量和预计月末用量；有超额风险时不发布默认地图。
- 记录验收人、时间、发布版本、成功/失败与回滚决定。

## P0 历史发布命令与配置顺序（仅归档，不作为 V2.3 操作）

1. 在 Supabase Edge Function Secrets 设置 `APP_ALLOWED_ORIGINS`。当前默认值为：

   ```text
   https://foodprint-nine.vercel.app,http://localhost:3000
   ```

   不要加入 `*.vercel.app`。如必须验收某个 Preview，只能临时追加该完整 URL，并在记录中写明负责人和移除日期；验收后立即删掉。
2. 确认 `AMAP_WEBSERVICE_KEY` 仍只存在于 Supabase Secret；不要把它填入 Vercel 的环境变量。
3. 历史上从已登录且已链接正确 Supabase 项目的终端执行：

   ```bash
   supabase functions deploy amap-poi-search
   supabase functions deploy amap-static-map
   ```

4. 在高德控制台确认 JavaScript API Key 的域名白名单至少含 `foodprint-nine.vercel.app`。它与 `APP_ALLOWED_ORIGINS` 是两项独立设置。
5. 记录函数部署时间、Production URL、允许 Preview（如有）、验收人和结果；不得将 Secret 值或控制台截图中的敏感信息写入仓库。

上述 Vercel Origin 与 amap-static-map 只用于解释 P0 历史记录。当前地点搜索的 APP_ALLOWED_ORIGINS 必须含 https://foodprint.com.cn；V2.3 不部署、调用或恢复静态地图。

## V2.3 动态地图发布顺序

1. 在高德控制台确认 JS API Key 白名单含 foodprint.com.cn，并复核当前账户许可与月配额。
2. 确认腾讯云 production.env 中 V2.3 目标变量 AMAP_JS_KEY、AMAP_SECURITY_KEY、NEXT_PUBLIC_APP_URL 和 DISCOVERY_DYNAMIC_MAP_ENABLED；不得展示值。若发布前仍是 NEXT_PUBLIC_AMAP_KEY，按 V2.3 交接单的一次性兼容顺序迁移，验收后删除旧变量，不能长期双写。
3. 确认 window._AMapSecurityConfig 在 JS API 加载前指向同源 /api/amap/_AMapService。
4. 为 /api/amap/_AMapService/ 使用独立 Nginx 限流；以冷启动网络瀑布校准 rate / burst，执行 nginx -t 后才 reload。
5. 先完成向前 V2.3 发现索引 migration 和权限冒烟，再发布应用容器。
6. 在 foodprint.com.cn 以真实 active member 验证默认地图、拖拽、缩放、聚合、Pin 卡片、当前范围抽屉、列表一致与定位拒绝路径。
7. 核对运行时只请求 `/icons/map-pins/` v2.3.0 正式 SVG；1 / 2 / 3 级小碗、选中锚点、聚合 2 / 9 / 12 / 99 / 100+ 和蓝色用户位置符合 `docs/design/v2-3-map-pins/final/README.md`，概念 PNG 与旧临时 Pin 不进入 bundle。
8. 做缺 Key / 代理 403 或受控开关故障演练，确认自动切列表、筛选保留、无静态地图和无自动循环重试。
9. 发布后至少观察 30 分钟地图 ready、403 / 429 / 5xx、健康检查与初始化用量，再进入 7 天观察。

## P0 发布记录（2026-07-28）

- Production 地址：`https://foodprint-nine.vercel.app`。
- Edge Function：`amap-poi-search`、`amap-static-map` 已发布；允许来源仅为 Production 与本地开发地址。
- GitHub PR #8 已合入 `main`；Vercel Production 部署 `469272b` 为 Ready。
- 项目负责人已确认登录、地点搜索、首页地点建议、地图入口和降级提示通过正式验收。

## 配额与安全

- 健康检查使用固定测试词，每天不超过 4 次；不可用爬虫模拟全城搜索。
- 只保留按日聚合的成功率、耗时和错误类别；关键词、用户、精确坐标不进入常规日志。
- 动态地图初始化、筛选和拖拽不得触发公开 POI 搜索；同一次发现页只创建一个 AMap.Map。
- Nginx access log 只记 URI path，不记 query string，避免把 jscode 或地图参数写入日志。
- 发生 Key 泄漏怀疑时：立即禁用/轮换 Key、审查日志和访问记录、更新受影响服务配置，再验证恢复。
- 高德用量达到 80% 时告警和复核增长；预计会超额或达到 90% 前先关闭动态地图，不等待扣费发生。

## V2.3 故障动作表

| 现象 | 先检查 | 立即动作 | 恢复条件 |
| --- | --- | --- | --- |
| 大面积地图空白 / complete 超时 | map ready 指标、浏览器 /api/amap 状态 | 关动态地图，确认列表默认 | 根因修复，真实手机连续冒烟通过 |
| 403 | JS Key 白名单、主域、security key 配对 | 关动态地图，不改成明文 secret | foodprint.com.cn 同源代理成功 |
| 429 | Nginx amap zone、请求突发、异常来源 | 关图或调整经证据支持的专用阈值 | 正常冷启动 0 误伤，异常流量仍受限 |
| 5xx | 腾讯云变量、Next route、上游状态 | 关动态图，保留地点列表 | proxy 健康且无 Secret 泄漏 |
| 月额度风险 | 高德控制台实际用量、增长预测 | 90% 前关图 | 新周期 / 用量方案经负责人确认 |
| 单用户定位失败 | 权限、HTTPS、设备能力 | 不关地图；提示继续浏览 | 不属于全图故障 |
| 图片失败 | /api/photos/sign、Storage | 保留文字卡片 / 图片重试 | 不属于全图故障 |
