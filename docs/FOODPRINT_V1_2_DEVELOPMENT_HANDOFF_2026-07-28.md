# 食迹 Foodprint｜V1.2 开发交接与验收清单

> 日期：2026-07-28
> 状态：代码与数据库迁移完成，等待 Preview 与项目负责人验收
> 工作分支：`codex/v1-2-discovery-try-list`
> 对应规格：[V1.2｜发现与去试试](./specs/2026-07-v1-2-discovery-try-list.md)

## 本轮已完成

- 原“地图”主入口调整为“发现”，默认打开小组推荐列表；原地图保留在 `/map`，可从发现页切换查看。
- 新增“去试试”一级入口：仅可从高德确认 POI 后加入，来源与一句期待均可选。
- 候选仅限本小组的待验证地点；创建者可编辑或删除自己的 pending 候选。
- 候选卡提供“我去试过了”流转：必须确认真实体验，再选择“值得推荐”或“暂不推荐”。
- 值得推荐时，事务化创建或复用一个 `group_place` 并进入发现；不编造评分、照片或长评。后续可在“记一顿”补充完整体验。
- 暂不推荐时，候选转为受保护的 `dismissed` 后台记录，不在发现、动态、候选列表或普通前台查询中展示。
- 同组 pending 候选由数据库唯一索引去重；已 dismissed 的地点当前采用不允许再次加入的中性提示，避免公开或暗示负面结论。
- 新增 RLS、审计事件与 RPC，所有候选写入和验证均在数据库事务内完成。

## 关键交付文件

- [候选生命周期迁移](../supabase/migrations/20260728130000_v1_2_place_candidates.sql)
- [去试试页面](../src/app/try/page.tsx) 与 [交互组件](../src/components/try/try-list.tsx)
- [候选 Server Actions](../src/app/try/actions.ts)
- [发现页](../src/app/discover/page.tsx)、[地图保留页](../src/app/map/page.tsx)
- [生命周期 ADR](./decisions/2026-07-01-place-lifecycle-recommendation-model.md)
- [迁移约束测试](../tests/v1-2-candidate-migration.test.ts)

## 已完成的自动检查

- `npm run typecheck`
- `npm run lint`
- `npm run build`（Next.js 16 Production build 成功；18 个路由生成完成）

## 待本机确认的一项自动检查

此工作区的 Vitest 在启动运行器后未进入任何测试用例，因此没有将它标记为通过。请在你的本地终端只运行一次：

```bash
npm test -- --maxWorkers=1 --reporter=verbose
```

预期会执行既有测试及 [V1.2 迁移约束测试](../tests/v1-2-candidate-migration.test.ts)。若再次停在 `RUN` 而没有输出用例结果，请停止命令并把终端输出发给我；不需要继续反复重试。

## 数据库迁移记录

项目负责人已于 2026-07-28 在 Supabase 应用 migration，并确认五项对象核验均为 `true`，两条候选 RLS 策略均存在。

## 接下来需要做的事

### 1. 在 Supabase 应用 migration（已完成）

应用 [20260728130000_v1_2_place_candidates.sql](../supabase/migrations/20260728130000_v1_2_place_candidates.sql)。必须使用项目既有的 Supabase migration 流程；不要修改任何历史 migration，也不要手动删除候选数据。

应用后可先执行以下只读核验：

```sql
select
  to_regclass('public.place_candidates') is not null as candidate_table_ready,
  to_regprocedure('public.create_place_candidate(uuid,text,text,text,text,text,numeric,numeric,text,text)') is not null as create_ready,
  to_regprocedure('public.resolve_place_candidate(uuid,boolean,boolean)') is not null as resolve_ready,
  to_regprocedure('public.update_place_candidate(uuid,text,text)') is not null as update_ready,
  to_regprocedure('public.delete_place_candidate(uuid)') is not null as delete_ready;

select policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('place_candidates', 'places')
  and policyname ilike '%candidate%'
order by tablename, policyname;
```

第一条查询的五列应全部为 `true`；第二条应至少返回 `members read pending place candidates` 与 `members read places in pending candidates`。

### 2. Preview 验收（Owner、Admin、Member）

使用两个不同的小组及至少两个同组账号，按以下顺序验收：

1. Member 打开“去试试”，确认顶部加号入口可见；选择高德 POI、不填两个文本字段即可加入。
2. 同组另一成员对同一 POI 重复加入，确认只保留一张卡并收到清晰提示。
3. 创建者能编辑、删除自己的 pending 候选；非创建者不出现编辑/删除控制。
4. Owner、Admin、Member 都能看到本组候选，也都能完成真实体验验证；没有角色获得未批准的额外候选治理能力。
5. 在第二小组搜索或尝试访问第一小组候选，确认无法看到第一小组卡片、来源文本或任何状态。
6. 对一张候选勾选真实体验后选择“值得推荐”：卡片消失，发现页出现该地点且标为“新推荐”；它可以被加入“下回吃”，并可在“记一顿”补充完整评分。
7. 对另一张候选选择“暂不推荐”：它从候选列表消失，且不出现在发现、动态、下回吃或普通前台地点结果中；再搜索并尝试加入时，只应看到中性“暂时不能重复加入候选”提示。
8. 在手机宽度检查底部导航、去试试表单、验证确认框、发现到地图切换和网络/高德错误提示。

### 3. 发布决策

完成 Preview 人工验收后再创建 PR、合入 `main` 并做 Production 抽查。当前没有执行 Supabase、Vercel 或 GitHub 的外部写入，也没有发布。

## 回滚

若 Preview 或 Production 出现问题，先回退应用部署或隐藏“去试试”入口；**保留** `place_candidates`、RLS、RPC 和审计数据，不删除已产生候选。后续只用新的前向 migration 修复数据或权限问题。

## 已知边界

- V1.2 不实现重复到访、时间线、三级小碗或完整地点详情改版；这些仍归 V1.3。
- promoted 地点在没有完整真实标记前会显示“新推荐”，不会显示虚构评分。
- dismissed 地点的再次尝试政策暂定为禁止重新加入，且不向用户披露具体的历史验证内容；若产品希望允许重试，应先更新 Spec 和本 ADR，再通过新 migration 调整。
