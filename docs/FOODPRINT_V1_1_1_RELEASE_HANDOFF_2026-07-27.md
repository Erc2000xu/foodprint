# 食迹 Foodprint｜V1.1.1 发布交接

> 发布：2026-07-27；体验观察开始：2026-07-28
> 当前生产版本：V1.1.2；V1.1.1 已关闭
> 状态：已发布，人工验收通过，体验优化观察中
> 生产地址：[https://foodprint-nine.vercel.app](https://foodprint-nine.vercel.app)
> `main` 当前提交：`a811762`
> 本文不记录任何密钥、密码、token 或用户的私密数据。

## 1. 项目定位与运行边界

Foodprint（食迹）是一个由朋友共同维护的餐饮地点地图：用户收藏吃过且认可的餐厅、记录真实体验，并在受邀请的小组内分享。

- 当前运行底座：Next.js、Supabase、Vercel、高德地图；
- 当前生产域名：`foodprint-nine.vercel.app`；
- 域名备案仍在进行，未来计划迁移到已购置的腾讯云中国大陆服务器与 `.com.cn` 域名；在备案完成前，所有线上迭代继续以 Vercel 为准；
- 详细长期背景与约束见 [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)。

## 2. 版本判断

- V1.1：已完成并上线，重点为高德地点检索、行政区/商圈/地铁实时建议和导航等能力；
- V1.2：仅为后续规划，尚未作为已交付功能实现；
- 本次交付为 V1.1.1：针对邀请链接、成员权限与管理后台体验的修复型迭代。

此前 V1.1 的状态见 [FOODPRINT_V1_1_STATUS_HANDOFF_2026-07-24.md](./FOODPRINT_V1_1_STATUS_HANDOFF_2026-07-24.md)。

## 3. 本次发现的注册与邮件问题

在实际朋友接受邀请的流程中，曾发现：

1. 邮箱验证后曾跳转到错误地址（形如 `foodprint-nine.vercel.apphttp`）；用户已在 Vercel/Supabase URL 配置中自行修正；
2. 测试邮箱未稳定收到 Supabase 验证邮件；后续在 Supabase 后台能看到新用户，表明注册/入组流程至少部分成功；
3. Supabase 内置邮件存在默认限流与投递限制风险。

### 后续认证运维事项（不阻塞 V1.1.1）

项目负责人已于 2026-07-28 确认本版本人工验收通过，V1.1.1 不再以 SMTP 配置作为发布阻塞项。独立 SMTP（如 Resend）接入、邮件模板和投递监控保留为未来的认证运维事项；在实际邀请规模、投递稳定性或品牌邮件需求出现前，不纳入当前产品版本范围。

本次 V1.1.1 不包含 SMTP 服务商接入或邮件模板改版。

## 4. V1.1.1 需求决策与实现

完整需求、权限矩阵与验收标准见 [FOODPRINT_V1_1_1_INVITATION_MEMBER_GOVERNANCE.md](./FOODPRINT_V1_1_1_INVITATION_MEMBER_GOVERNANCE.md)。

### 4.1 邀请记录

已实现：

- 新邀请的原始 token 在服务端随机生成；数据库保存 SHA-256 hash 用于校验，同时保存由服务端密钥加密的 token 密文；
- Owner/Admin 刷新管理页后仍能看到**有效邀请**的完整链接，并可一键复制；
- 日常“邀请记录”仅显示未撤销、未过期且未用完的邀请；用完、撤销、过期的记录自动隐藏，不物理删除；
- 为未来“过去 30 天邀请历史导出”预留了不返回 token 的数据库查询接口；本版本未增加导出按钮。

安全边界：邀请链接是 bearer credential，不得公开转发。旧版本邀请只保存了 hash，因此不能从数据库恢复原始链接；原链接仍可继续使用，但若丢失需创建新邀请替代。

### 4.2 成员角色与隐私

保留三角色，不新增复杂角色体系：

| 权限 | Owner | Admin | Member |
| --- | --- | --- | --- |
| 查看共同地图、记录体验、收藏想去 | 是 | 是 | 是 |
| 创建、复制、撤销邀请 | 是 | 是 | 否 |
| 查看成员目录及邮箱 | 是 | 是 | 否 |
| 完善历史地点信息 | 是 | 是 | 否 |
| 暂停/恢复非 Owner 成员 | 是 | 否 | 否 |
| 切换 Admin / Member | 是 | 否 | 否 |
| 导出整个共同地图 | 是 | 否 | 否 |

已实现：

- Owner 可以将活跃的非 Owner 成员设为 Admin 或 Member；
- Owner 可以暂停/恢复非 Owner 成员；
- Owner/Admin 的成员列表显示昵称、邮箱、角色和状态；
- Member 完全不显示成员目录；数据库 RLS 也限制 Member 只能读取自己的 membership，不能靠接口取得其他成员或邮箱；
- Owner 转移、多 Owner、角色自定义暂不支持。

## 5. 已修改的核心文件

- [数据库迁移：20260727130000_v1_1_1_invitation_member_governance.sql](../supabase/migrations/20260727130000_v1_1_1_invitation_member_governance.sql)
  - 添加 `invitations.token_ciphertext`；
  - 增加受控邀请创建、有效邀请列表、30 天历史、成员目录 RPC；
  - 收紧 `group_members` RLS；
  - 加固成员角色和状态变更权限。
- [邀请加密工具](../src/lib/invitations/token-crypto.ts)
  - AES-256-GCM 加密/解密；含单元测试。
- [管理页](../src/app/admin/page.tsx)、[管理操作](../src/app/admin/actions.ts)
  - 有效链接读取、角色切换、成员可见性控制。
- [邀请列表组件](../src/components/admin/invitation-list.tsx)、[角色控制组件](../src/components/admin/member-role-control.tsx)
  - 链接展示/复制和 Owner 角色切换界面。
- [首页](../src/app/page.tsx)
  - 为 `useSearchParams()` 对应的地图组件增加 `Suspense` 边界，修复 Next.js 16 生产构建阻断。
- [环境变量模板](../.env.example)、[README](../README.md)
  - 补充文档入口和邀请密钥说明。

## 6. 运行配置与数据库状态

用户在本次对话中确认已完成以下生产配置；下次接手前应按实际控制台再核对一次：

1. Vercel 的 **Production** 和 **Preview** 都设置了 `INVITATION_TOKEN_ENCRYPTION_KEY`；两种环境应使用同一个高强度随机值。该值绝不能写入仓库或交接文档。
2. 用户表示已通过 Supabase SQL Editor 手动执行本次 V1.1.1 migration。建议在 Supabase SQL Editor 再执行以下只读核验：

```sql
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invitations'
      and column_name = 'token_ciphertext'
  ) as invitation_ciphertext_ready,
  to_regprocedure(
    'public.create_managed_invitation(uuid,timestamp with time zone,integer,text,text)'
  ) is not null as managed_invite_ready,
  to_regprocedure(
    'public.list_group_members_for_management(uuid)'
  ) is not null as member_directory_ready,
  to_regprocedure(
    'public.list_group_invitation_history(uuid,integer)'
  ) is not null as invitation_history_ready;
```

四列均应为 `true`。

注意：项目标准流程应使用 `supabase db push` 记录 migration 状态；本次因控制台人工执行，后续若改用 CLI，需要先核对远端 migration history，避免重复或不同步。

## 7. 代码发布记录

### Git

- 发布分支：`codex/v1-1-1-invitation-member-governance`；
- 功能提交：`3d62e09 feat: add V1.1.1 invitation and member governance`；
- 与远端 `main` 同步后的合并提交：`a811762`；
- 已于 2026-07-27 直接非强制推送至 GitHub `main`：`3be41c7..a811762`。

GitHub 连接在无代理时无法访问 `github.com:443`。在本机需要使用代理时，可按本项目既有约定临时执行：

```bash
HTTPS_PROXY=http://127.0.0.1:5780 HTTP_PROXY=http://127.0.0.1:5780 git push
```

端口仅在本机代理实际监听 `5780` 时适用。

### Vercel

- `main` 推送会触发正式部署；
- 推送后生产健康接口 `https://foodprint-nine.vercel.app/api/health` 返回 HTTP 200：

```json
{"status":"ok","service":"foodprint"}
```

健康检查只证明应用可响应，不替代权限与邀请流程验收。

## 8. 验证记录

在发布前，本地已通过：

- `npm run typecheck`；
- `npm test`：6 个测试文件、13 个测试全部通过；
- `npm run lint`；
- `npm run build`：Next.js 16 生产构建成功。

首次构建曾因首页的 `useSearchParams()` 缺少 `Suspense` 边界失败，已修复后重新完整通过。

## 9. 人工验收与后续体验观察

1. Owner 创建一个新邀请，刷新“我的 → 邀请记录”，确认仍可看到同一链接并复制；
2. 用该链接创建一个非团队邮箱新用户，验证邮件到达、回跳和成功入组；
3. 该邀请达到最大使用次数、被撤销或过期后，确认其自动从日常邀请记录隐藏；
4. Owner 确认成员列表显示邮箱，且可切换 Admin/Member、暂停/恢复；
5. Admin 确认可管理邀请和查看成员，不能修改角色或暂停成员；
6. Member 确认不显示成员目录，也无法取得其他成员邮箱；
7. 检查 `/api/health`、地点搜索、标记、想去、全组导出等 V1.1 既有功能没有回归。

项目负责人已于 2026-07-28 确认上述 V1.1.1 人工验收通过；V1.1.2 管理页体验收尾补丁也已通过 Preview 人工验收。两项版本现均已关闭。

## 10. 下一步建议

V1.1.1 的后续工作不再与当前发布混在一起：邀请历史 30 天导出、独立 SMTP、邮件模板和投递监控均进入后续待评估事项。V1.2 起按 `docs/PRODUCT.md`、`docs/ROADMAP.md` 和 `docs/DEVELOPMENT_WORKFLOW.md` 另行立项与验收。
