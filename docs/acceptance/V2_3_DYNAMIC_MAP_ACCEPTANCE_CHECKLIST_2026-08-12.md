# Foodprint V2.3｜动态地图验收清单

> 版本：V2.3  
> 日期：2026-08-12  
> 状态：代码实现已落地，待 Preview / 生产逐项验收  
> 产品规格：[V2.3 动态地图与视野地点抽屉](../specs/2026-08-v2-3-dynamic-discovery-map.md)  
> 技术交接：[V2.3 动态地图开发交接](../FOODPRINT_V2_3_DYNAMIC_MAP_DEVELOPMENT_HANDOFF_2026-08-12.md)
> 正式 Pin 规范：[B「餐盘定位圆章」正式资产](../design/v2-3-map-pins/final/README.md)

## 1. 使用规则

- [ ] 每项填写环境、执行人、日期和证据链接 / 截图 / 日志摘要。
- [ ] “通过”必须来自生产构建；开发服务器只可作为前置检查。
- [ ] 涉及真实高德、真实 PWA、腾讯云 Nginx 或生产域名的项目，不能只用 jsdom / mock 代替。
- [ ] 涉及权限、数据完整性、配额和密钥的项目不得用“肉眼看起来正常”代替可复现证据。
- [ ] 任一 P0 阻塞项失败时不得发布；任一发布门禁未完成时不得把 V2.3 标为已关闭。
- [ ] 验收证据不得含 Secret、真实用户身份、地点私有内容、搜索词、签名图片 URL、精确位置或完整地图边界。

建议记录格式：

| 项目 | 结果 | 环境 / 设备 | 证据 | 验收人 / 日期 |
| --- | --- | --- | --- | --- |
| 示例 | 通过 / 失败 / 不适用 | Production / iPhone Safari | 脱敏截图或记录路径 | 姓名 / YYYY-MM-DD |

## 2. 发布前外部条件

- [ ] 高德 JavaScript API Key 当前有效。
- [ ] 高德 JS API Key 域名白名单精确包含 foodprint.com.cn。
- [ ] www.foodprint.com.cn 只跳转到主域，不作为第二个应用 Origin。
- [ ] AMAP_SECURITY_KEY 与当前 JS API Key 匹配。
- [ ] V2.3 使用服务端运行时 AMAP_JS_KEY；它只在地图功能开启时经 Server Component 作为页面配置下发，且没有混入 security key。
- [ ] public env schema、客户端源码、Docker build args、README 和生产环境中不再把 NEXT_PUBLIC_AMAP_KEY 作为长期真相源；发布窗口兼容逻辑已移除。
- [ ] AMAP_SECURITY_KEY 只存在腾讯云受控服务端环境，未进入浏览器 bundle、HTML、RSC、日志或 Git。
- [ ] NEXT_PUBLIC_APP_URL 为 https://foodprint.com.cn。
- [ ] APP_ALLOWED_ORIGINS 含 https://foodprint.com.cn，且不使用通配符。
- [ ] DISCOVERY_DYNAMIC_MAP_ENABLED 在生产模板中显式为 true。
- [ ] 已复核当前高德账户主体、项目用途、服务协议和控制台免费额度。
- [ ] 线上用户协议与隐私政策已明确第三方地图服务提供方、使用目的、处理的数据类型 / 方式 / 范围，并提供高德隐私规则入口。
- [ ] 页面中的精确定位只在用户主动操作后触发，且适用的单独 / 明示同意流程已由实际运营主体复核；政策文字与真实行为一致。
- [ ] 若第三方地图告知、定位同意或实际主体授权未通过，生产 DISCOVERY_DYNAMIC_MAP_ENABLED 保持 false。
- [ ] 未启用自动充值、余额自动扣费、流量包或付费升级。
- [ ] 已记录本周期 JS 地图初始化用量基线和 80% / 90% 动作负责人。
- [ ] 本地生产构建能通过同源安全代理完成地图初始化。

## 3. 数据集合与完整性

### 3.1 BaseSet

- [ ] 当前有效小组的 active 且至少有一份 current_opinion 的地点全部进入 BaseSet。
- [ ] pending “去试试”候选不进入 BaseSet。
- [ ] dismissed 候选不进入 BaseSet。
- [ ] archived 地点不进入 BaseSet。
- [ ] inactive_no_marks 地点不进入 BaseSet。
- [ ] 其他小组地点不进入 BaseSet。
- [ ] 已软删除 / 已治理隐藏且不再构成推荐的数据不被错误用作摘要或封面。
- [ ] 离开成员的既有 current_opinion 按既有隐私决议继续参与原小组汇总，但离开成员本人不能读取该小组。
- [ ] active 但没有 current_opinion 的历史异常数据有审计记录，不被静默画成 Pin。
- [ ] BaseSet 中任一地点坐标缺失、非法、坐标系未知或未转换时，数据状态为 invalid_coordinates，整张动态地图不初始化。
- [ ] invalid_coordinates 时完整列表仍包含全部 BaseSet 地点；问题行显示“位置待补充”，不会使用 0,0 或默认城市中心冒充坐标。

### 3.2 分页与完整性

- [ ] 新 V2.3 RPC 使用稳定游标 created_at + id。
- [ ] 单页上限受到数据库约束。
- [ ] 21 条地点读取无遗漏、无重复。
- [ ] 100 条地点读取无遗漏、无重复。
- [ ] 101 条地点读取无遗漏、无重复。
- [ ] 500 条地点读取无遗漏、无重复。
- [ ] 相同 created_at 的记录可依靠 UUID tie-break 正确翻页。
- [ ] 第二页或后续页 RPC 失败时 data status 不是 complete。
- [ ] 游标不前进或重复时能检测并阻止地图宣布就绪。
- [ ] 达到 2,000 条安全阀仍有下一页时返回 overflow，并默认列表。
- [ ] 当前 V2.2 最多 20 条的 RPC 没有被当成 V2.3 完整地图数据源。

### 3.3 三套视图一致

对无筛选、关键词、地区、菜系、人均、场景（若保留）、组合筛选分别验证：

- [ ] Map represented IDs 与 FilteredSet IDs 完全相同。
- [ ] 完整列表 IDs 与 FilteredSet IDs 完全相同。
- [ ] Map represented IDs 与完整列表 IDs 完全相同。
- [ ] 聚合点展开后其成员 ID 无漏、无重。
- [ ] 当前范围抽屉 IDs 等于 FilteredSet 与当前 bounds 的交集。
- [ ] 当前范围数量 N 等于抽屉实际行数。
- [ ] 地图拖动只改变 ViewportSet，不改变 FilteredSet。
- [ ] 切换排序只改变列表 / 抽屉顺序，不增删 Pin。
- [ ] 清除筛选后恢复完整 BaseSet。
- [ ] 生产集合不一致时只记录匿名计数，不输出私有 ID。

### 3.4 字段语义

- [ ] id 使用 group_places.id，不使用高德 POI ID 当详情主键。
- [ ] 推荐强度使用 bowlStrength，不恢复五分星 / 小数评分展示。
- [ ] friendCount 与现有 current_opinions 汇总一致。
- [ ] 菜系、推荐菜、人均、地址和商圈来源符合技术交接。
- [ ] “找灵感”场景筛选的数据来源已经确认；若数据不再采集，该筛选已隐藏或另有已批准方案。
- [ ] 四维“吃得香 / 坐得住 / 聊得开 / 花得值”没有被误当“约会 / 聚会”等场景。
- [ ] 地图索引不返回用户 ID、邮箱、昵称或图片 object key。

## 4. 数据库与权限

- [ ] V2.3 使用新向前 migration，没有编辑旧 migration。
- [ ] 干净数据库可以从头重放全部 migration。
- [ ] list_discovery_index_v2_3 固定 search_path。
- [ ] public 和 anon 没有 execute 权限。
- [ ] authenticated 只有所需 execute 权限。
- [ ] RPC 不接收 group_id。
- [ ] 未登录请求不能读取地点。
- [ ] active member 能读取自己的当前小组。
- [ ] active member 不能读取另一个小组。
- [ ] removed / left member 不能读取原小组。
- [ ] 会话过期后下一次读请求返回认证状态，不继续显示新私有数据。
- [ ] RLS / RPC / Storage 权限回归覆盖普通成员、管理员、Owner。
- [ ] 数据库错误不会被误报为 AMap 错误。
- [ ] 生产应用 migration 后，上一版本应用仍可回滚运行。

## 5. 默认入口与模式切换

- [ ] 访问 / 且没有 view 参数时默认显示动态地图。
- [ ] /?view=map 旧链接仍进入动态地图。
- [ ] /?view=list 明确进入完整列表。
- [ ] /map 旧入口重定向到默认 /，不再强制写 view=map。
- [ ] 用户切列表时 URL 保留全部筛选并加入 view=list。
- [ ] 用户切地图时删除 view=list，保留全部筛选。
- [ ] 从地点详情返回时恢复地图 / 列表模式和筛选。
- [ ] Pin 选择不触发 RSC 导航或完整文档刷新。
- [ ] 地图中心、缩放、bounds、抽屉高度和用户位置不进入 URL。
- [ ] 旧 ?place=id 仅作为受授权的一次性兼容输入，不允许跨组选择。
- [ ] 用户主动切列表时不显示地图故障提示。

## 6. 地图加载与生命周期

- [ ] mapEnabled=true、完整数据、至少一个地点、Key 有效时才加载 SDK。
- [ ] BaseSet 为空时不加载 SDK，并显示“共同地图里还没有地点”。
- [ ] view=list 时没有高德 SDK script、同源 _AMapService 请求或地图初始化。
- [ ] 同一次发现页生命周期只构造一个 AMap.Map。
- [ ] 连续改变 10 次筛选仍只构造一个 AMap.Map。
- [ ] 更新 signed photo URL 不更新 cluster data、不重建地图。
- [ ] loader resolve 后仍等待 map complete 才进入 ready。
- [ ] complete 后 center、zoom 和 bounds 均通过有限值校验。
- [ ] 8 秒内没有 complete 时进入 fatal 并切列表。
- [ ] unmount 时移除 cluster、事件和 timer，并调用 map.destroy()。
- [ ] 快速切 map / list 不留下重复实例、重复监听或控制台异常。
- [ ] 地图设置为 2D，关闭旋转、倾斜和 hotspot。
- [ ] 高德法定标识、比例尺和 Foodprint 控件不相互遮挡。
- [ ] 地图初次 fit 不把单点放大到不合理建筑级别。

## 7. 拖动、缩放与视野

- [ ] 单指拖动顺畅。
- [ ] 双指缩放顺畅。
- [ ] 桌面鼠标滚轮 / 触控板缩放符合预期。
- [ ] 地图拖动中不发 POI、周边搜索或逆地理请求。
- [ ] 地图拖动中不写 URL、数据库或浏览器持久存储。
- [ ] moveend / zoomend 在一次动作后合并为一次业务更新。
- [ ] 高频拖动没有明显长任务或持续 React 重渲染。
- [ ] 地图运动结束后当前范围数量正确更新。
- [ ] 已选 Pin 仍在视野时保持选择。
- [ ] 已选 Pin 被移出视野时清除选择并回到范围摘要。
- [ ] 筛选变化会 fit 新 FilteredSet。
- [ ] 只改变排序不重新 fit。
- [ ] 连续快速筛选只执行最后一次视野调整。
- [ ] 抽屉高度变化不会重建地图。
- [ ] 地图控件随着抽屉避让，始终可点。

## 8. Pin 与聚合

### 8.1 视觉门禁

- [x] 已生成 A–E 五套 Pin 方向稿并保留选择记录。
- [x] 产品负责人已于 2026-08-13 书面选定 B「餐盘定位圆章」。
- [x] 已用确定性 SVG 重绘 1 / 2 / 3 级推荐的默认与选中态。
- [x] 已制作聚合 default / active 与独立蓝色用户位置状态。
- [x] 正式资产已登记 `VISUAL_ASSET_REGISTRY.md`，并有 manifest、运行注册表和资产规范。
- [x] 已生成 24 / 28 / 32 / 40 / 48px 退化 QA 板；40px 正式默认尺寸可区分三级小碗。
- [ ] 真实运行 bundle 只使用 `/icons/map-pins/` v2.3.0 正式资产，未引用五张 ImageGen 方向 PNG 或旧临时 CSS Pin。
- [ ] 正式资产已放入真实高德地图 320 / 390 / 430px 场景比较。
- [ ] 正式资产覆盖街区、城区和全城缩放级别。
- [ ] 已在高德远山黛、月光银、草色青、马卡龙等实际可用官方底图检查道路、文字、绿地、水面和密集标签背景。
- [ ] 1× / 2× / 3× 屏幕和 iOS / Android / 桌面 / PWA 均无发糊、裁切或对比度问题。

### 8.2 功能

- [ ] 每个 FilteredSet 地点由一个单点或某个 cluster 代表。
- [ ] `bowlStrength=1 / 2 / 3` 分别显示一 / 二 / 三层小碗，并与“值得去 / 想再去 / 会专门去”一致。
- [ ] 默认 Pin 为 40 × 45 CSS px；选中 Pin 为 48 × 54 CSS px；聚合为 44 × 50 / 48 × 54 CSS px。
- [ ] 单点 / 聚合都以图形底部中心 `(0.5, 1)` 精确锚定，选择、缩放和聚合拆分时无位置跳动。
- [ ] 默认 Pin 和选中 Pin 形状 / 尺寸上可区分，不只靠颜色。
- [ ] 触控命中区域至少 44 × 44 CSS px。
- [ ] 聚合数字表示 Foodprint 地点数量。
- [ ] 聚合 2、9、12、99 正确显示，100 及以上显示 `100+`，不溢出也不被误认为推荐等级。
- [ ] 用户当前位置为独立蓝色圆点，不与三级推荐或橙红选中态混淆。
- [ ] 选中 Marker 的 zIndex 高于默认 Marker；底部卡片 / 抽屉不会遮住目标尖角。
- [ ] 按下态、键盘焦点和 `prefers-reduced-motion` 按正式规范工作。
- [ ] Marker 有精简可读的 `aria-label`，地图之外的同数据列表可完整键盘操作。
- [ ] 点击 cluster 会放大并显示成员范围。
- [ ] cluster 达到最大缩放时不无意义重复放大。
- [ ] 完全同坐标多地点都保留，并可从抽屉访问。
- [ ] 同坐标地点没有因 lng,lat 字符串 key 被覆盖。
- [ ] 筛选后 cluster.setData 正确更新，不重建 Map。
- [ ] 选中态更新不丢 click handler。
- [ ] 地图上不铺高德公开 POI 作为 Foodprint Pin。
- [ ] 地图底图 hotspot 已关闭或不会让用户误选公开 POI。

## 9. 点选与地点卡片

- [ ] 点击单点不会立即跳详情。
- [ ] 点击单点后 Pin 立即进入选中态。
- [ ] 点击单点后抽屉进入 card。
- [ ] 选中 Pin 被自动保持在未被顶栏 / 卡片遮挡的安全区。
- [ ] 卡片显示地点名称。
- [ ] 卡片显示区 / 商圈或简短地址。
- [ ] 卡片显示小碗推荐强度和朋友人数。
- [ ] 卡片按规则显示推荐菜或摘要。
- [ ] 卡片仅加载私有缩略图，不加载原图。
- [ ] 无图时显示现有品牌占位。
- [ ] 图片失败不导致地图失败。
- [ ] “查看详情”可进入正确 group_place。
- [ ] 详情 returnTo 保留筛选与 view，不带精确地图状态。
- [ ] 点另一个 Pin 原位替换卡片。
- [ ] 点地图空白清除选择并返回 peek。
- [ ] 被筛除的 selectedPlaceId 会清除。
- [ ] 地图卡片不暴露不适合该空间的管理操作。

## 10. 当前范围地点抽屉

### 10.1 始终可用

- [ ] 地图 ready 且未选 Pin 时也显示 peek。
- [ ] peek 文案为“当前范围 · N 家”。
- [ ] 点标题可打开 half。
- [ ] 上拉把手可打开 half / expanded。
- [ ] 下拉可按 expanded → half → card / peek 收起。
- [ ] 有可点击的展开 / 收起按钮，不只依赖手势。
- [ ] Escape 或等价键盘操作按预期收起。

### 10.2 列表内容

- [ ] half / expanded 只显示 ViewportSet。
- [ ] 视野列表使用当前发现排序规则。
- [ ] 当前范围 N 与实际地点行数一致。
- [ ] 点抽屉行会平移地图、选中 Pin 并进入 card。
- [ ] 已选地点在展开列表中高亮。
- [ ] 若实现临时置顶，明确标识“已选地点”且其他顺序可预测。
- [ ] N=0 显示“这个范围里还没有推荐地点”。
- [ ] N=0 提供“查看全部地点”或“清除筛选”。
- [ ] “查看全部地点”会 fit FilteredSet，不调用公开 POI 搜索。
- [ ] 地点很多时列表滚动稳定，不阻塞地图主线程。
- [ ] 抽屉只按需签名可见 / 即将可见的最多 20 张缩略图。

### 10.3 手势与布局

- [ ] 只有把手 / 标题区启动抽屉拖拽。
- [ ] 抽屉列表内滚动不会拖动抽屉或地图。
- [ ] 抽屉覆盖区域不会拖动地图。
- [ ] map 区域拖动不会意外拖抽屉。
- [ ] pointercancel 和快速手势后不会卡在中间位置。
- [ ] 抽屉吸附四个语义 detent。
- [ ] iOS 动态地址栏下高度正确。
- [ ] PWA standalone 下 safe area 正确。
- [ ] 底部导航不遮抽屉操作和内容。
- [ ] 320px 宽度无横向溢出。
- [ ] 长地点名、200% 字号和无图卡片不破版。

## 11. 搜索、筛选与排序

- [ ] 关键词在 map / list 产生相同 FilteredSet。
- [ ] 地区筛选在 map / list 产生相同 FilteredSet。
- [ ] 菜系筛选在 map / list 产生相同 FilteredSet。
- [ ] 场景筛选（若保留）在 map / list 产生相同 FilteredSet。
- [ ] 人均筛选在 map / list 产生相同 FilteredSet。
- [ ] 组合筛选在 map / list 产生相同 FilteredSet。
- [ ] 最值得去排序稳定。
- [ ] 最近体验排序稳定。
- [ ] 离我最近在取得位置后按正确坐标系排序。
- [ ] 搜索高德地点建议只改变已确认筛选，不直接形成推荐 Pin。
- [ ] FilteredSet=0 时保留地图并显示 0 家，不误判故障。
- [ ] 清除筛选恢复全部推荐地点。
- [ ] 快速连续提交搜索没有过期响应覆盖新响应。

## 12. 定位与隐私

- [ ] 初次进入不主动弹定位权限。
- [ ] 只有点定位或选“离我最近”才请求权限。
- [ ] 使用 AMap.Geolocation convert=true，或先把 WGS84 转 GCJ-02。
- [ ] 不存在 WGS84 用户坐标直接与 GCJ-02 地点计算的代码路径。
- [ ] 定位成功显示不同于推荐 Pin 的用户位置点。
- [ ] 定位成功不绕过抽屉安全边距。
- [ ] 定位拒绝时地图继续可用。
- [ ] 定位超时时地图继续可用。
- [ ] 桌面不支持 / 定位失败时文案友好。
- [ ] 精确位置不写数据库。
- [ ] 精确位置不写 URL。
- [ ] 精确位置不写 localStorage / sessionStorage。
- [ ] 精确位置不写日志 / metrics / error。
- [ ] 不采集位置轨迹或持续定位。
- [ ] 用户位置失败不触发整张地图 fallback。

## 13. 私有图片

- [ ] 初始地图索引不批量签名所有封面。
- [ ] 封面 object key 不下发。
- [ ] 选中地点按需签名其 photo ID。
- [ ] half / expanded 只签名可见 / 预取窗口内图片。
- [ ] /api/photos/sign 每批最多 20，按 ID 去重。
- [ ] 签名接口验证登录和 Storage / RLS 范围。
- [ ] 签名 URL 只在内存使用。
- [ ] 签名 URL 不被 Service Worker 缓存。
- [ ] 签名 URL 过期可通过现有 PrivatePhoto 重签。
- [ ] 无图、签名失败和图片加载失败均不破坏地点文字浏览。
- [ ] 地图拖动且抽屉 peek 时不会不断签名图片。

## 14. 动态地图故障与列表降级

对每种故障分别验证：

- [ ] AMAP_JS_KEY 缺失。
- [ ] AMAP_SECURITY_KEY 缺失。
- [ ] 错误 JS Key。
- [ ] foodprint.com.cn 不在测试 Key 白名单。
- [ ] 同源代理 403。
- [ ] 同源代理 429。
- [ ] 同源代理 503 / 5xx。
- [ ] SDK 网络拒绝。
- [ ] SDK 加载超过 8 秒。
- [ ] Map complete 超过 8 秒。
- [ ] 不可恢复 runtime / WebGL 错误。
- [ ] 数据 RPC 第 2 页失败。
- [ ] 数据 overflow。

每个适用场景必须同时满足：

- [ ] 自动切到完整列表。
- [ ] 已加载地点不丢失。
- [ ] 搜索、筛选和排序不丢失。
- [ ] 显示“地图暂时没打开，已为你切换到列表。”
- [ ] 没有静态地图。
- [ ] 没有空白死区或无限 loading。
- [ ] 没有自动循环重试。
- [ ] 地图实例 / timer 已清理。
- [ ] 只记录匿名失败阶段和错误类别。

重试：

- [ ] 可重试故障显示“重试地图”。
- [ ] 一次点击只生成一次新加载。
- [ ] 连续手动重试最多 2 次。
- [ ] 成功后清除 banner。
- [ ] 功能开关关闭 / 数据不完整不提供无效重试。
- [ ] 重试不使用 window.location.reload。

## 15. 功能开关

- [ ] DISCOVERY_DYNAMIC_MAP_ENABLED=true 时默认动态地图。
- [ ] false 后重启容器即可生效，不需重新构建。
- [ ] false 时发现页默认列表。
- [ ] false 时 RSC payload、HTML、客户端 props 与按需 chunk 均不含 JS API Key；地图开启时 JS Key 仍按公开 Key 对待并受正式域名白名单保护。
- [ ] false 时不向页面传入 AMap Key。
- [ ] false 时不下载 SDK。
- [ ] false 时不请求 _AMapService。
- [ ] false 时不调用静态地图。
- [ ] URL ?view=map 不能绕过 false。
- [ ] 重新 true 并重启后地图恢复。
- [ ] 开关演练有执行人、时间和恢复记录。

## 16. 高德代理、Nginx 与日志

- [ ] 代理只允许 /api/amap/_AMapService/...。
- [ ] 非法前缀返回 400。
- [ ] path traversal、编码路径和非法字符被拒绝。
- [ ] 只支持 GET。
- [ ] 客户端传入 jscode 会被服务端 secret 覆盖。
- [ ] 代理不转发 Cookie / Authorization。
- [ ] 上游请求有 12–15 秒 Abort 超时。
- [ ] 鉴权和错误响应 no-store。
- [ ] 正常公开底图配置缓存经过明确评审。
- [ ] 响应含 nosniff。
- [ ] foodprint_amap 独立限流在通用 /api/ location 前匹配。
- [ ] 冷启动真实瀑布无内部误伤 429。
- [ ] 异常压力能被独立限流产生 429。
- [ ] 最终 rate / burst 有 p99 突发依据。
- [ ] Nginx access log 仍只记 path，不记 query string。
- [ ] Next / Nginx / error log 不含 jscode。
- [ ] 日志不含 Cookie、Authorization、精确坐标、地点名或查询词。
- [ ] nginx -t 通过。
- [ ] 地点搜索 Edge Function 和导航回归未被地图代理改动破坏。

## 17. 静态地图退出

- [ ] V2.3 页面没有 StaticMapAdapter import。
- [ ] V2.3 页面没有 StaticAmapMap render。
- [ ] 浏览器网络中没有 amap-static-map 请求。
- [ ] 构建产物运行路径不包含静态地图 fallback。
- [ ] 旧手册不再把静态地图列为 V2.3 发布检查。
- [ ] 发布命令不再部署 amap-static-map 作为 V2.3 正常步骤。
- [ ] 7 天回滚窗口内远端旧函数调用量为 0。
- [ ] 7 天稳定后已确认不回滚旧镜像。
- [ ] 远端 amap-static-map 已退役，或有明确执行日期与负责人。
- [ ] 退役后从 Git 旧版本恢复的方式已记录。

## 18. 可访问性

- [ ] 地图 / 列表切换有正确 role 和可理解名称。
- [ ] 定位、重试、展开、收起和详情均可键盘操作。
- [ ] 抽屉按钮有 aria-expanded 和 aria-controls。
- [ ] 焦点顺序符合视觉顺序。
- [ ] 抽屉展开后焦点不会被困住或跳到页面顶部。
- [ ] 选中态不只靠颜色。
- [ ] 地点文字信息可从抽屉 / 完整列表获取，地图不是唯一信息载体。
- [ ] 所有核心触控目标至少 44 × 44 CSS px。
- [ ] prefers-reduced-motion 下不使用强烈抽屉 / 地图过渡。
- [ ] 200% 字号仍能完成切换、展开和进详情。
- [ ] 屏幕阅读器能读出“当前范围 N 家”和地点行。
- [ ] 地图 marker 不造成数百个重复、混乱的朗读节点。
- [ ] 色彩对比符合当前产品基线。

## 19. 设备与 PWA 矩阵

### 19.1 手机宽度

- [ ] 320px Safari / Chrome。
- [ ] 375px Safari / Chrome。
- [ ] 390px Safari / Chrome。
- [ ] 430px Safari / Chrome。

每个宽度验证：

- [ ] 顶部标题 / 搜索不压缩地图至不可用。
- [ ] 地图 / 列表切换可见。
- [ ] 定位按钮不被抽屉遮挡。
- [ ] 抽屉四态可达。
- [ ] 底部导航不遮挡。
- [ ] 无横向滚动。

### 19.2 浏览器 / 模式

- [ ] iPhone Safari。
- [ ] iPhone PWA standalone。
- [ ] Android Chrome。
- [ ] Android PWA standalone（若当前正式支持）。
- [ ] macOS Chrome。
- [ ] macOS Safari。
- [ ] 桌面窄屏应用容器。
- [ ] iOS 动态地址栏展开 / 收起。
- [ ] 横竖屏切换后不崩溃、不重复初始化。

### 19.3 PWA

- [ ] Service Worker 不缓存私有 HTML / RSC / API / 照片 / 地图代理。
- [ ] Service Worker 不缓存 AMap security proxy 响应。
- [ ] 冷启动地图失败可切列表。
- [ ] PWA 回到前台不会创建第二个地图实例。
- [ ] PWA 更新后旧 chunk / 新页面不会造成无限 loading。
- [ ] 离线时不显示虚假旧地图。

## 20. 性能

在同设备、同网络、同账号数据量下记录至少 5 次冷 / 5 次暖：

- [ ] 地图冷启动可交互 p75 <=5 秒。
- [ ] 地图暖启动可交互 p75 <=2.5 秒。
- [ ] Pin 选择视觉反馈 <=100ms。
- [ ] 500 点 bounds 计算目标 <=50ms。
- [ ] 已知 403 / 429 / 5xx 后列表交互目标 <=500ms。
- [ ] 未知 SDK / complete 超时后列表 <=8 秒。
- [ ] 同一页面 map init 次数 =1。
- [ ] list 模式 AMap 下载 =0。
- [ ] 拖图 POI / geocode 请求 =0。
- [ ] 拖图图片签名请求在 peek 状态 =0。
- [ ] 500 点拖动 / 缩放没有可感知掉帧或长任务。
- [ ] 页面没有因地图加入而破坏 V2.2 已有启动 / 导航 / 图片预算。
- [ ] 性能报告注明设备、系统、浏览器、网络、地点数、冷 / 暖定义。
- [ ] 若门槛调整，有前后数据和产品负责人批准，不是静默放宽。

## 21. 指标、告警与隐私

- [ ] 地图 load、ready、failure、fallback、retry 指标已接入。
- [ ] Pin、cluster、sheet 指标只记匿名事件。
- [ ] map stage / failure / count bucket 使用枚举白名单。
- [ ] metrics schema 拒绝自由文本和未知维度。
- [ ] 事件不含 user_id、group_id、place_id。
- [ ] 事件不含地点名、搜索词、经纬度、bounds。
- [ ] 事件不含完整 URL、签名图片 URL或第三方 response body。
- [ ] map ready 成功率和 p75 / p95 可查询。
- [ ] 代理 403 / 429 / 5xx 可查询。
- [ ] 5 分钟成功率告警或小样本人工巡检方案已建立。
- [ ] 高德控制台额度有每月复核记录。
- [ ] 80% 告警和 90% 关图动作可执行。

## 22. 自动化质量门禁

- [ ] npm run lint 通过。
- [ ] npm run typecheck 通过。
- [ ] npm run test 通过。
- [ ] npm run build 通过。
- [ ] npm run check 通过。
- [ ] git diff --check 通过。
- [ ] 新测试不依赖真实生产 Secret。
- [ ] FakeAMap 测试无不稳定 timer / race。
- [ ] 现有发现、地点详情、记一顿、去试试、饭后聊测试无回归。
- [ ] 新 migration 静态安全测试通过。
- [ ] 干净数据库重放通过。
- [ ] 没有跳过 / only / 临时 debug 测试。
- [ ] 没有 console 输出 Secret 或私有数据。
- [ ] 最终 git diff 与已批准范围一致。

## 23. 生产发布与回滚

- [ ] PR 已经项目负责人批准。
- [x] 最终 B「餐盘定位圆章」视觉与正式资产已批准。
- [ ] 正式 B Pin 已在真实高德地图和目标设备完成接入验收，无视觉偏移。
- [ ] 发布版本 / commit 已记录。
- [ ] 先应用向前 migration。
- [ ] migration 后 active / removed member RPC 冒烟通过。
- [ ] production.env 已更新并保持 0600。
- [ ] Nginx 配置 nginx -t 通过后 reload。
- [ ] 新容器健康检查通过。
- [ ] foodprint.com.cn 登录后默认地图通过。
- [ ] 真实地图 Pin / cluster / sheet / list 通过。
- [ ] 地点搜索、记一顿、详情、图片、导航、去试试、饭后聊回归通过。
- [ ] 人工切 DISCOVERY_DYNAMIC_MAP_ENABLED=false 的止血演练通过。
- [ ] 恢复 true 后地图恢复。
- [ ] 上一应用镜像仍可回滚。
- [ ] 新数据库函数不做破坏性 down migration。
- [ ] 发布后 30 分钟错误率、健康检查和代理状态正常。

## 24. 七天稳定观察

每天记录：

- [ ] 健康检查。
- [ ] map ready 成功率。
- [ ] map ready p75 / p95。
- [ ] fallback 率与失败类别。
- [ ] 代理 403 / 429 / 5xx。
- [ ] 高德初始化用量。
- [ ] 用户反馈：地图空白、Pin 难点、抽屉手势、列表不一致。
- [ ] 静态地图远端调用量 =0。
- [ ] 无新增密钥 / 位置 / 私有数据日志问题。

第 7 天：

- [ ] 稳定期结论已归档。
- [ ] 阻塞缺陷为 0。
- [ ] 是否长期保持地图默认已记录，默认仍按本 Spec。
- [ ] 已确认是否退役远端 amap-static-map。
- [ ] 如退役，执行和恢复记录已归档。
- [ ] ROADMAP / SPEC_INDEX / release note 状态已更新。

## 25. 阻塞项与签字

以下任一项失败必须阻止发布：

- [ ] 地图 / 列表 ID 集合不一致。
- [ ] 读取到其他小组、候选或归档地点。
- [ ] 超过 20 条后出现静默漏点。
- [ ] 地图失败不能进入完整列表。
- [ ] security key 或精确位置泄漏。
- [ ] list 模式仍加载地图 SDK。
- [ ] 动态地图反复初始化。
- [ ] 正式 Pin 未经批准。
- [ ] 关图开关无效。
- [ ] 生产域名 / 高德许可或配额未复核。
- [ ] 第三方地图隐私告知、定位同意流程或实际运营主体授权未复核。

最终签字：

| 角色 | 结论 | 姓名 | 日期 | 备注 |
| --- | --- | --- | --- | --- |
| 产品负责人 | 通过 / 不通过 |  |  |  |
| 开发实施 | 通过 / 不通过 |  |  |  |
| 数据 / 权限复核 | 通过 / 不通过 |  |  |  |
| 生产发布 | 通过 / 不通过 |  |  |  |
| 七天稳定观察 | 通过 / 不通过 |  |  |  |
