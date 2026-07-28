# 高德连接运行手册

> 适用：当前 Vercel 阶段及后续腾讯云迁移
> 关联：P0 高德连接可靠性与安全基线、AMAP_FREE_TIER_POLICY.md

## 配置清单

| 项目 | 所在位置 | 维护规则 |
| --- | --- | --- |
| JavaScript API Key 域名白名单 | 高德控制台 | 仅稳定生产域名与必要临时 Preview；每次变更记录日期和负责人 |
| Web Service Key | Supabase Edge Function Secret | 仅服务端使用；不可打印、不可提交 |
| JS 安全密钥 | Vercel 服务端环境变量/代理 | 仅服务端；固定受控代理路径 |
| APP_ALLOWED_ORIGINS | Supabase Edge Function Secret/配置 | 精确 scheme + host + port 列表；不使用通配符 |
| 地图免费额度 | 高德控制台 | 每月复核，超限先降级，不自动付费 |

## 当前故障排查

1. 记录用户访问的精确页面地址、时间、网络与操作，不索要账户密码或完整精确位置。
2. 浏览器网络面板检查 Foodprint 请求：若为 403，先比对 Origin 与 APP_ALLOWED_ORIGINS；若高德返回鉴权类 infocode，检查对应 Key 白名单。
3. 分别检查地点搜索、静态地图、导航，因为它们是不同调用链。
4. 检查 Supabase Edge Function 日志中的匿名错误类别和部署版本；不得复制或分享 Secret。
5. 若无法在十分钟内恢复，启用列表优先提示并创建故障记录，说明影响、时间、临时处理和后续修复。

## 每次发布检查

- 确认发布 URL 是否为受控 Origin；若不是，不发布或先添加精确授权。
- 核对 Edge Function 允许地址、Vercel 运行变量与高德 JS 域名白名单。
- 在桌面和手机分别测试：输入地点、选择 POI、查看静态地图、打开导航。
- 检查错误状态、控制台无密钥泄漏、日志无原始用户敏感数据。
- 记录验收人、时间、发布版本、成功/失败与回滚决定。

## P0 发布命令与配置顺序

1. 在 Supabase Edge Function Secrets 设置 `APP_ALLOWED_ORIGINS`。当前默认值为：

   ```text
   https://foodprint-nine.vercel.app,http://localhost:3000
   ```

   不要加入 `*.vercel.app`。如必须验收某个 Preview，只能临时追加该完整 URL，并在记录中写明负责人和移除日期；验收后立即删掉。
2. 确认 `AMAP_WEBSERVICE_KEY` 仍只存在于 Supabase Secret；不要把它填入 Vercel 的环境变量。
3. 从已登录且已链接正确 Supabase 项目的终端执行：

   ```bash
   supabase functions deploy amap-poi-search
   supabase functions deploy amap-static-map
   ```

4. 在高德控制台确认 JavaScript API Key 的域名白名单至少含 `foodprint-nine.vercel.app`。它与 `APP_ALLOWED_ORIGINS` 是两项独立设置。
5. 记录函数部署时间、Production URL、允许 Preview（如有）、验收人和结果；不得将 Secret 值或控制台截图中的敏感信息写入仓库。

## 配额与安全

- 健康检查使用固定测试词，每天不超过 4 次；不可用爬虫模拟全城搜索。
- 只保留按日聚合的成功率、耗时和错误类别；关键词、用户、精确坐标不进入常规日志。
- 发生 Key 泄漏怀疑时：立即禁用/轮换 Key、审查日志和访问记录、更新受影响服务配置，再验证恢复。
- 切换腾讯云或 .com.cn 前，按本手册重新完整验收，不沿用旧域名假设。
