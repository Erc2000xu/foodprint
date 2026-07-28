# P0｜高德连接可靠性与安全基线

> 状态：已关闭（2026-07-28）
> 优先级：P0，必须先于所有依赖地点检索的新功能
> 版本目标：恢复并持续保障当前 Vercel 阶段的地点检索、静态地图和导航相关链路。

## 1. 背景与问题

项目负责人已确认通过 `main` 触发的 Production 地址 `https://foodprint-nine.vercel.app` 可以登录并使用高德服务；这说明正式生产链路当前可用。此前从 Vercel Preview Deployment `https://foodprint-go4imq8gp-eric2000-s-projects.vercel.app` 打开时发生错误。

代码中两个 Supabase Edge Function 的允许来源仅包含 `https://foodprint-nine.vercel.app` 和 `http://localhost:3000`：

- amap-poi-search：地点搜索。
- amap-static-map：静态地图。

因此该 Preview URL 调用时会先被 Edge Function 以 403 拒绝，再也不会到达高德。这解释了“`main` 可以使用、某个 Deployment 不能使用”的差异：不是高德整体失效，而是来源配置漂移。P0 仍然需要完成，以消除硬编码、统一两个函数的安全边界，并建立每次发布的可验证流程；它不应为了让所有临时 Preview 都可用而放宽为通配符。

此外，高德 JavaScript API 的 Key 域名白名单也可能未包含当前受控地址。该问题与 Edge Function 的 CORS 白名单是两层不同配置，必须分别核验。

## 2. 目标

1. 使当前受控生产域名、开发本地地址和必要 Preview 地址能够稳定使用地点检索与静态地图。
2. 保持精确 Origin 校验，不使用通配符，不把高德服务密钥暴露到浏览器。
3. 用户遇到失败时看到可理解的降级提示，而非空白或无反馈。
4. 建立部署后验证、配额观察、错误分类和事件处理手册。

## 3. 范围

### 包含

- 将两个 Edge Function 的 Origin 规则抽为受控环境配置，例如 APP_ALLOWED_ORIGINS，使用精确 URL 的逗号列表。
- 同时更新地点搜索与静态地图函数，避免两个入口行为不一致。
- 核验并配置高德 JavaScript Key 的域名白名单；服务端 Web Service Key 继续仅在 Secret 中使用。
- 为前端增加统一错误状态：无网络、来源未授权、上游超时、配额/高德错误、无结果。
- 在不记录原始搜索词、精确经纬度或密钥的前提下，记录匿名成功率、错误码和耗时。
- 建立发布后冒烟测试、有限频率健康检查、配额复核及回退步骤。

### 不包含

- 动态交互地图、地图点位聚合或地图列表联动。
- 新的地点生命周期、去试试、重复到访、评价体系或视觉改版。
- 购买高德付费服务、抓取或沉淀高德 POI 数据。

## 4. 技术设计

### 4.1 来源与密钥边界

| 层级 | 设计 | 禁止事项 |
| --- | --- | --- |
| 浏览器 | 可加载受域名白名单限制的高德 JavaScript Key；请求 Foodprint 自有接口 | 不出现 Web Service Key、安全密钥或 Service Role Key |
| Next.js 路由 | 仅作为高德 JavaScript 安全代理，校验请求 Origin/Referer | 不转发任意路径或任意来源 |
| Supabase Edge Function | 用 Secret 中的 Web Service Key 调高德；按 APP_ALLOWED_ORIGINS 返回 CORS | 不写死不断变化的部署 URL；不允许星号 Origin |
| 配置 | Vercel、Supabase、AMap 控制台中的地址列表同步维护 | 不把 Secret 或配置快照提交 Git |

正式受控地址应使用稳定自定义域名或稳定 Vercel Production Alias。短期 Preview 若确有验收需要，可临时列入精确白名单并设置移除日期；不允许放行所有 vercel.app 子域。

### 4.2 错误与降级

| 场景 | 用户提示 | 产品行为 | 运行记录 |
| --- | --- | --- |
| 网络不可达 | 网络有点忙，稍后再试 | 保留输入、提供重试 | network_failure |
| Origin 未授权 | 地图服务正在更新，请稍后重试 | 不泄露配置细节，提供页面刷新/回到列表 | origin_rejected |
| 高德超时或 5xx | 地点服务暂时没响应 | 保留查询、允许重试 | provider_timeout |
| Key/白名单错误 | 地图服务配置需要处理 | 隐藏技术错误码，仅展示降级入口 | provider_auth_failure |
| 无搜索结果 | 没找到这个地方，换个关键词试试 | 允许改词与清空 | no_result |

### 4.3 观测与日常检查

- 发布后由维护者手动执行一次地点搜索、静态地图和导航检查。
- 非交互健康检查最多每日 4 次，使用固定测试词；不得高频探测或消耗免费配额。
- 指标按天聚合：请求量、成功率、P95 耗时、CORS 拒绝数、高德 infocode 类别；日志不保存完整关键词、用户身份、精确坐标和响应正文。
- 连续两次健康检查失败或当天成功率显著异常时，创建故障记录并切换到列表优先降级界面。

## 5. 实施顺序与回滚

1. 盘点当前 Vercel 实际访问 URL、Supabase Edge Function 部署版本、环境变量和 AMap 两类 Key 白名单。
2. 在测试/Preview 用精确新 Origin 验证两个 Edge Function，再配置稳定 Production Alias。
3. 部署代码与受控配置；执行发布后冒烟测试和真实手机测试。
4. 更新运行手册、配置所有者和下一次配额复核日期。
5. 若错误率上升，立即回退应用/函数到上一个已验证版本，并保留列表与手动输入的降级提示；数据库不参与本 P0。

## 6. 验收标准

- 受控生产地址可成功使用地点搜索；浏览器网络中不出现 403 Origin 拒绝。
- 静态地图成功或在失败时展示明确的非技术性提示；页面不崩溃。
- 非受控 Origin 被拒绝，且响应不回显密钥、内部 URL 或高德完整错误。
- 浏览器包、Git 历史和客户端变量中均没有 Web Service Key 或安全密钥。
- 新旧允许地址、AMap Key 白名单、验证时间和负责人已记录在 AMAP_OPERATIONS_RUNBOOK.md。
- 类型检查、Lint、构建、部署后桌面与真机主路径验收通过。

## 7. 未决项

- 长期 Production Alias 保持 `https://foodprint-nine.vercel.app`，直至自定义域名/大陆切流另行批准。
- 是否需要授权某一个 Preview：默认不授权；若需要，必须列出精确地址、验收负责人和移除日期。
- 当前高德控制台 Key 的生产域名白名单仍需由控制台维护者核验。

## 8. 实施与正式验收记录

- 两个 Edge Function 已改为从 `APP_ALLOWED_ORIGINS` Secret 读取精确来源；缺失或错误配置会失败关闭，不会隐式回退到硬编码域名。
- 函数响应不再把高德 `infocode` 或上游详情发送到浏览器；仅记录不含关键词、坐标、用户 ID 或密钥的匿名 `amap_event`。
- 搜索和静态地图均提供统一的非技术性错误信息；静态地图新增显式重试入口和列表降级。
- 移除了未被使用、却可能要求 Vercel 保存 Web Service Key 的 Server Action 调用；该 Key 只保留在 Supabase Edge Function Secret。
- Supabase 已配置精确的 `APP_ALLOWED_ORIGINS`；`amap-poi-search` 与 `amap-static-map` 已于 2026-07-28 部署至 Production 项目。
- 高德 JavaScript API Key 的生产域名白名单已按运行手册核验；Web Service Key 未进入 Vercel 或浏览器配置。
- GitHub PR #8 已合入 `main`，Vercel Production 部署 `469272b` 状态为 Ready。
- 项目负责人已完成并确认正式验收：登录、标记页地点搜索、首页“王府井”地点建议、地图入口与错误降级均符合验收要求。
- P0 已关闭；V1.2 现在可以在其自身 Spec 明确批准后进入开发。
