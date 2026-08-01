# 食迹 Foodprint｜V1.3.2 开发交接

> 开发日期：2026-07-30  
> 分支：`codex/v1-3-2-try-flow`  
> 状态：代码完成，待 Supabase 发布、Preview 验收与合并 main。

## 已完成

- 去试试候选卡显示市/区、真实高德商圈（缓存存在才显示）、地址、来源与期待。
- 新增带 SVG 的“导航去这里”，用已保存的高德坐标打开高德第三方导航。
- “按当前位置找”只在用户点击后请求浏览器定位；结果使用高德周边检索并显示城市和距离。拒绝定位仍可正常关键词搜索。
- “我去过了 → 值得推荐，记下这顿”预选地点进入完整记一顿表单；保存成功后才进入发现。
- 从记一顿直接保存相同高德 POI，也会在同一数据库事务中将同组 pending 候选转为 promoted。
- “这次先不推荐”仅将候选标记为 dismissed，不创建公开负面评价。
- 新表单移除 `street_food`；前向 migration 将历史值统一为 `restaurant`，`quick_bite` 菜系保持不变。
- 候选地点加入高德商圈缓存刷新队列；缓存失败不会阻止候选保存。

## 数据库与函数发布

发布新增 migration：

`supabase/migrations/20260730113000_v1_3_2_try_flow_completion.sql`

它包含：分类前向迁移、候选商圈队列、拒绝候选 RPC，以及原子化的 `save_candidate_promotion_mark` RPC。高德 Edge Function `amap-poi-search` 也新增了按候选 place 刷新缓存的能力，必须和 migration 一起部署。

## 验证记录

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm test -- --run`：14 个文件、41 个测试通过。
- `next build`：代码构建待在正常项目工作区/Preview 部署执行；当前隔离工作区的依赖复制被临时环境中断，未发现应用代码错误。

## 受控范围

- 不重做 V3 视觉方向，仅调整去试试功能区域。
- 不删除既有候选、地点、到访或历史分类数据。
- 不把浏览器定位保存到用户资料、URL 或数据库。
