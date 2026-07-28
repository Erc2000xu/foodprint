# 食迹 Foodprint｜V1.2 发布交接

> 发布提交：`30ee8da`；日期：2026-07-28
> 状态：已推送 `main`，等待 Production 人工验收
> 对应规格：[V1.2｜发现与去试试](./specs/2026-07-v1-2-discovery-try-list.md)

## 已发布范围

- 原主页面正式命名为“发现”，保留原有的图文地点卡、真实照片、行政区、筛选与列表优先体验。
- 地图是发现页内的切换视图；`/discover` 与 `/map` 仅兼容旧链接，不再是第二套主页面。
- “想去”统一更名为“下回吃”：只收藏发现中的已推荐地点，并在发现卡片和“我的”中可见。
- 新增“去试试”候选清单：仅接受高德确认 POI；来源与期待为可选字段。
- 候选经成员确认真实体验后，只会进入发现，或转为受权限保护的 dismissed 记录；不公开负面评价。
- 候选表、RLS、去重约束、受控 RPC 与审计事件已在 Supabase migration 中交付并由项目负责人确认应用。

## 数据库与验证

- 已应用 migration：[20260728130000_v1_2_place_candidates.sql](../supabase/migrations/20260728130000_v1_2_place_candidates.sql)
- Supabase 已核验 `place_candidates`、四个候选 RPC 与两条候选 RLS 策略存在。
- 已通过：`npm run typecheck`、`npm run lint`、`npm run build`。
- Vitest 能发现 9 个文件但在本机执行前卡住，未作为通过项；此问题不应以重复重试替代诊断。

## Production 验收

在 Vercel Production 部署完成后，只需核对：

1. 首页底部左侧显示“发现”，进入原有图文卡片；图片与行政区仍正常显示。
2. “列表 / 地图”在同一发现页内切换；访问旧 `/discover` 与 `/map` 不会出现重复主页面。
3. 发现卡片和“我的”均显示“下回吃”，没有遗留的“想去”用户文案。
4. 去试试可从高德 POI 加入；同组重复 pending 候选只有一张卡。
5. 候选选择“值得推荐”后进入发现；选择“暂不推荐”后不出现在任何普通前台列表。

## 回滚

若发现发布问题，先在 Vercel 将 Production 回退到 `07f0176` 的前一版本。数据库 migration 与已有候选记录保留，不删除；后续仅通过新的前向 migration 修复。

项目负责人完成上述 Production 验收后，将本文件、V1.2 Spec 和路线图状态从“待验收”更新为“已关闭”。
