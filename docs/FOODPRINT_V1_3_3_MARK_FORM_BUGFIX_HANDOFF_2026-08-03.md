# 食迹 Foodprint｜V1.3.3「记一顿」表单故障修复交接

> 交接日期：2026-08-03
> 状态：生产修复已应用，移动端人工验收通过
> 当前 `main`：`6218981 fix: restore visit record photo insert permission`
> 生产部署：代码已推送 `main`；数据库迁移已直接应用到当前 Supabase 项目
> 本文不记录任何密钥、密码、token 或用户私密数据。

## 1. 交接结论

本轮针对手机端“记一顿”表单的连续故障已经完成闭环。负责人已验证以下场景均可提交：

1. 只填写必填项，不上传照片；
2. 必填项加推荐菜品，不上传照片；
3. 必填项加推荐菜品，上传一张照片。

当前完整链路为：

```text
移动端表单
  → Next.js Server Action
  → save_candidate_promotion_mark RPC
  → place mark / cuisine / visit record
  → Supabase Storage 上传 WebP
  → photos 表 RLS 写入
  → discovery metadata 刷新
```

## 2. 本轮处理过的问题

### 2.1 Server Action 白屏/无法返回表单错误

照片是 multipart Server Action 请求的一部分。Next.js 默认 Server Action body 限制不足以覆盖压缩后的照片 payload，异常可能直接表现为白色的 “This page couldn’t load” 页面，而不是表单内联错误。

已处理：

- `next.config.ts` 将 `experimental.serverActions.bodySizeLimit` 设置为 `16mb`；
- `PhotoPicker` 在压缩 WebP 完成前阻止提交；
- 表单提交按钮显示“正在处理照片…”并禁用重复提交；
- Server Action 增加统一异常兜底和可读的校验错误映射。

对应代码/测试：

- `next.config.ts`
- `src/components/mark/photo-picker.tsx`
- `src/components/mark/mark-flow.tsx`
- `src/components/mark/meal-record-form.tsx`
- `src/app/mark/actions.ts`
- `tests/next-config.test.ts`
- `tests/mark-actions.test.ts`

### 2.2 “好在哪儿”字段序列化不稳定

移动端 React 控制的 checkbox 在 Server Action 提交时可能出现字段丢失或重复读取。此前服务端使用 `formData.getAll("opinion_tags")`，但可见 checkbox 的状态和原生 FormData 序列化存在竞态。

已处理：

- 用隐藏 input 作为服务端的 canonical values；
- 可见 checkbox 改用 `opinion_tags__ui` / `tags__ui`，避免和服务端字段冲突；
- 保持服务端字段名 `opinion_tags` / `tags` 不变。

对应代码/测试：

- `src/components/mark/opinion-picker.tsx`
- `tests/opinion-picker.test.tsx`

### 2.3 `column reference "place_id" is ambiguous`

首条真实标记使用的 `save_candidate_promotion_mark` RPC 返回字段中包含 `place_id`。函数内部更新 `place_candidates` 时使用了未限定的 `place_id`：

```sql
where group_id = p_group_id
  and place_id = v_mark.place_id
```

在 PL/pgSQL 作用域中，返回字段 `place_id` 与表字段 `place_candidates.place_id` 发生歧义，导致不论是否填写照片、推荐菜品或其他选填项，RPC 都会失败。

已处理：

- 将更新目标改为 `public.place_candidates as candidate`；
- 所有相关字段改为 `candidate.group_id`、`candidate.place_id`、`candidate.status`；
- 线上函数定义已只读验证为已修复。

迁移与测试：

- [`supabase/migrations/20260803100000_v1_3_3_fix_save_candidate_place_id_ambiguity.sql`](../supabase/migrations/20260803100000_v1_3_3_fix_save_candidate_place_id_ambiguity.sql)
- [`tests/v1-3-3-save-mark-migration.test.ts`](../tests/v1-3-3-save-mark-migration.test.ts)

对应提交：`59b9edb fix: qualify candidate place id in save mark rpc`

### 2.4 `permission denied for table visit_records`

前一问题修复后，地点标记和到访记录已经保存，失败进入照片登记阶段。照片的 INSERT RLS policy 需要查询 `public.visit_records`，用来确认：

- 到访记录属于当前登录用户；
- 到访记录属于当前小组地点；
- 照片的 `group_id` 与 `group_place_id` 匹配。

但 V1.3 visit-record migration 最后执行了：

```sql
revoke all on table public.opinion_tags, public.current_opinions, public.visit_records
from anon, authenticated;
```

随后只恢复了 `opinion_tags` 的 SELECT，没有恢复 `authenticated` 对 `visit_records` 的 SELECT。RLS policy 本身存在并不等于角色拥有表级 SELECT 权限，因此 `photos.insert` 触发 policy 子查询时被 PostgreSQL 拒绝。

已处理：

```sql
grant select on table public.visit_records to authenticated;
```

该权限仍受现有 `visit_records` RLS policy 限制，不会让普通成员读取其他小组或不应可见的记录。

迁移与测试：

- [`supabase/migrations/20260803110000_v1_3_3_grant_visit_record_select_for_photo_policy.sql`](../supabase/migrations/20260803110000_v1_3_3_grant_visit_record_select_for_photo_policy.sql)
- [`tests/v1-3-3-photo-policy-grant.test.ts`](../tests/v1-3-3-photo-policy-grant.test.ts)

对应提交：`6218981 fix: restore visit record photo insert permission`

## 3. 生产应用与验证记录

### Supabase

两条修复迁移均已通过受控 CLI 直接应用到当前生产 Supabase 项目，并登记为 `applied`：

- `20260803100000_v1_3_3_fix_save_candidate_place_id_ambiguity.sql`
- `20260803110000_v1_3_3_grant_visit_record_select_for_photo_policy.sql`

已执行的只读验证信号：

```text
save_candidate_promotion_mark 修复字段：fixed = true
visit_records_select_granted = true
photos_insert_granted = true
```

### Git / Vercel

- `origin/main` 当前为 `6218981`；
- 本轮新增的迁移和测试已提交；
- 本轮没有带入以下已有的用户文档改动：
  - `docs/ROADMAP.md`
  - `docs/SPEC_INDEX.md`
  - `docs/design/v1-4-typography/`
  - `docs/specs/2026-07-v1-4-typography-and-copy-workbook.md`
- `main` 推送会按现有 Vercel 配置触发应用部署；数据库迁移不会由 Vercel 自动执行，因此本轮已单独在 Supabase 应用。

### 质量检查

- `git diff --check`：通过；
- 两条新增迁移的静态断言：通过；
- 生产数据库权限与函数定义：通过；
- 移动端负责人验收：通过。

## 4. 后续运维注意事项

### 4.1 Supabase migration history 仍需谨慎处理

此前若干迁移是通过 Supabase SQL Editor 手动执行的，远端 migration history 没有完整登记。当前 `db push --linked --dry-run` 曾提示以下旧迁移本地存在、远端 history 缺失：

- `20260731100000_v1_3_3_place_content_management.sql`
- `20260731110000_v1_3_3_four_good_at_tags.sql`
- `20260801100000_v1_3_3_normalize_group_place_archive_metadata.sql`

不要直接使用 `supabase db push --include-all` 重放它们。后续应先在 Supabase 生产库确认每条迁移的对象、函数、约束和数据回填都已存在，再逐条用 migration repair 登记为 applied，或继续通过 Dashboard 控制台执行并记录结果。

### 4.2 历史失败提交可能留下无照片到访记录

照片权限修复前，Server Action 的顺序是先保存真实标记和 `visit_records`，再上传照片。因此截图中“真实标记已保存，但照片登记失败”意味着该次到访记录可能已经存在，只是没有照片。

修复后重新提交可能产生一条新的到访记录。若发现时间线中有重复记录，应先核对日期、创建时间和照片 manifest，再通过现有内容管理/删除 RPC 进行可审计处理，不要直接对生产表执行无条件 `DELETE`。

这不影响当前已验证的提交链路，但接下来若要进一步增强，可以单独设计带 request id 的幂等提交，或在照片失败时提供明确的“继续保留记录/清理并重试”流程。

### 4.3 复验清单

发布后至少复验：

1. 必填项，无照片；
2. 必填项 + 推荐菜品，无照片；
3. 必填项 + 一张照片；
4. 一次上传多张 WebP，确认 Storage 与 `photos` 记录数量一致；
5. 刷新地点详情，确认照片出现在正确的到访记录下；
6. 普通成员不能读取不属于其活跃小组的 `visit_records` 或照片。

## 5. 接手入口

继续开发前建议先阅读：

- [V1.3.3 记一顿与内容管理开发交接](./FOODPRINT_V1_3_3_DEVELOPMENT_HANDOFF_2026-07-30.md)
- [V1.3.3 记一顿产品规格](./specs/2026-07-v1-3-3-mark-form-and-management.md)
- [生产运行与恢复说明](./OPERATIONS.md)
- [产品开发工作流](./DEVELOPMENT_WORKFLOW.md)

本次故障修复链路对应的主线提交为：

```text
2952b3b  fix: handle meal mark submission failures
78d6046  fix: stabilize meal form submission
59b9edb  fix: qualify candidate place id in save mark rpc
6218981  fix: restore visit record photo insert permission
```
