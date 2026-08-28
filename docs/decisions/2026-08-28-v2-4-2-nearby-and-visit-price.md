# V2.4.2 附近定位与到访人均决策

> 日期：2026-08-28
> 状态：已批准实施；不代表已发布或已关闭

## 背景

2026-08-27 的真实使用反馈对应四个根因：发现页没有在系统权限前解释用途，地图初始化和 padding 变化会把镜头重新适配到全部 Pin，管理页把有限条数的列表长度当成总数，地点预览把操作区放进固定高度内容里；V1.3 的 `visit_records` 又没有承接旧的 `price_per_person`。

## 决策

1. 发现页首次只显示非阻塞说明卡，用户同意后才调用高德一次性前台定位；后续同意会话最多一次自动定位。原始当前经纬度只在当前组件内存存在，不能进入 URL、Cookie、Web Storage、日志、指标或服务端。
2. 镜头使用 `manual > manual_locate > explicit_search > return_state > auto_location > fit_all > provider_fallback` 的确定性优先级；异步定位回调必须同时通过请求代次和镜头优先级检查。
3. 管理读模型使用版本化 RPC、当前小组 Owner/Admin 检查、真实计数和 `(sort_at, id)` keyset 游标；旧管理/治理 RPC 保留为回滚路径。
4. `visit_records.price_per_person numeric(10,2)` 是 V2.4.2 聚合的唯一权威字段。有效到访的算术平均排除空值、删除和隐藏记录；具体金额只在有权限的权威到访记录、个人导出和单次时间线中出现，不写入审计/分析事件。
5. 只新增向前兼容 migration；历史价格只有在 `legacy_visit_id = visits.id` 且满足边界时回填，无法证明的一律保持空值。V2.4.1 照片 Worker/WASM、FormData、补传与 9 张限制不改写。

## 回滚

先回滚应用 bundle 到 V2.4.1/V2.4 兼容版本，保持新增列和 RPC 不动；旧 RPC 仍可执行。确认观察期结束后，如需清理只能另行审批新的破坏性 migration，不能修改或删除已发布 migration。

## 未关闭门禁

自动化 lint/typecheck/test/build、干净本地数据库重放、真实高德、iPhone/Android、PWA 更新与生产发布均需以实现记录中的实际证据为准。未经负责人另行批准，不部署生产、不合并 `main`、不删除分支。
