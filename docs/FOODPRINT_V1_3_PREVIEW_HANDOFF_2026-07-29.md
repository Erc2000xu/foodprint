# Foodprint V1.3｜Preview 发布与验收交接

> 代码提交：`c8a5ee5`（后续若本文件随提交修订，以分支最新提交为准）  
> 状态：本地开发完成；待 Supabase migration、GitHub 推送、Vercel Preview 与人工验收。

## 此次交付

- 两条前向 migration：
  - `20260729140000_v1_3_owner_only_member_directory.sql`：只有 Owner 能读取成员邮箱并做账户治理。
  - `20260729141000_v1_3_visit_records.sql`：到访记录、当前观点、小碗汇总、匿名、历史迁移、退出后保留、照片关联、导出、删除与治理审计。
- 首次/后续“记一顿”、地点图文时间线、图文饭后聊、发现卡小碗/标签汇总和稳定真实照片封面。
- 普通界面仅展示昵称；匿名提交展示为“匿名成员”；离开成员的既有内容展示为“已离开成员”。
- 本人导出 V1.3 当前观点与到访记录；非 Owner 可退出共同地图，历史内容保留。

## 发布顺序

1. 在已关联的 **Preview Supabase** 项目执行两条 migration；不要修改或重跑已有 migration。
2. 推送 `codex/v1-3-record-a-meal`，从该分支创建 PR；由 GitHub-Vercel 集成创建 Preview。
3. 确认该 Preview 的 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`NEXT_PUBLIC_APP_URL` 指向 Preview 对应资源。全组导出还需服务端 `SUPABASE_SERVICE_ROLE_KEY`。
4. 使用 Preview URL 完成下列验收后，再合并/Promote。

## 必做人工验收

| 身份/场景 | 预期 |
| --- | --- |
| Member 首次记一顿 | 必填日期、小碗、1–2 个“好在哪儿”；可选笔记、菜品、照片、匿名；提交后出现地点详情与饭后聊。 |
| 同一 Member 再记一顿 | 选择“感觉一样”后沿用当前观点；选择“有变化”后只改变当前观点，本条保留快照。 |
| 匿名 Member | 地点详情、饭后聊和图片署名均显示“匿名成员”，不显示昵称或邮箱。 |
| Member 退出共同地图 | 退出后无法访问小组；既有观点仍计入汇总，既有条目显示“已离开成员”。 |
| Owner | 可查看成员邮箱、导出全组 JSON、管理成员；其余任何常规页面只显示昵称。 |
| Admin | 可创建邀请、隐藏带原因的到访/照片；不能看到成员邮箱或更改账户角色/状态。 |
| 作者删除 | 删除自己的到访或照片后普通成员不可再见；关联 Storage 对象应被清理。 |
| 权限 | 非成员不能读取地点时间线、饭后聊、私有照片或新表作者标识。 |

## 当前需要人工完成的事项

1. **GitHub 登录**：本机 `gh auth status` 显示账户 `Erc2000xu` 的 token 已失效；重新执行 `gh auth login -h github.com` 后，推送分支并创建 PR。
2. **Supabase 目标确认/登录**：仓库没有 `.env.local`、项目链接或可用 Supabase CLI，因此不能在不知道项目 ID 的情况下应用 migration。请在目标 Preview 项目关联并执行 migration，或提供已登录且已关联的环境。
3. **Vercel 目标确认**：本机没有 Vercel CLI 或 `.vercel/project.json`。若 GitHub 已接入 Vercel，推送后会自动生成 Preview；否则需在正确项目中执行 `vercel` 并确认所选团队/项目。
4. **账户注销受理方式**：已实现退出共同地图和“联系 Owner/产品支持”的产品入口；真实删除 Auth 用户、核验身份、隐私政策中的联系地址与处理时限属于 Owner/运营的人工职责，不能由客户端自行删除账户。

## 验证记录

- `npm run typecheck`：通过。
- `git diff --check`：通过（提交前）。
- `npm test -- --run tests/v1-3-privacy-migrations.test.ts`：Vitest 在本机只输出 `RUN` 后不返回用例汇总；需要 CI 或可运行 worker 补充最终自动化证据。
- `npm run build`：同一环境中仅输出 `next build` 启动行后未产生汇总；请在 Preview/CI 查看构建日志。
