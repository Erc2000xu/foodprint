# ADR｜V2 域名运行环境与数据平面边界

> 状态：提议，待项目负责人批准
> 日期：2026-08-05
> 关联：[V2 大陆域名与腾讯云迁移开发交接](../FOODPRINT_V2_MAINLAND_DOMAIN_MIGRATION_DEVELOPMENT_HANDOFF_2026-08-05.md)

## 背景

Foodprint 已完成 ICP 备案，准备将正式入口切换到 `foodprint.com.cn` 并在腾讯云 CVM 运行 Next.js。当前项目并非只使用一个可替换的数据库：它依赖 Supabase Auth、PostgreSQL、Storage、RLS、RPC 和 Edge Functions，且业务页面和 Server Actions 已直接接入这些能力。

若把应用部署、域名切流、数据库迁移、认证替换、照片迁移和权限重写放在同一次发布中，任何失败都难以定位或回滚，也会把真实用户数据置于不必要的风险中。

## 候选方案

| 方案 | 内容 | 优点 | 主要代价 |
| --- | --- | --- | --- |
| A｜一次性全迁 | Next.js 与完整 Supabase 数据平面同时迁入腾讯云 | 表面上完成“一次迁移” | 认证、RLS、Storage、Edge Function、数据校验和回滚高度耦合，风险最高 |
| B｜先迁应用运行环境 | V2-A 将 Next.js、Nginx、TLS、域名和发布迁到腾讯云，保留当前 Supabase 后端 | 切流范围可控、可快速 DNS/镜像回退、业务代码改动最小 | 仍有外部 Supabase 依赖，数据平面迁移需后续单独完成 |
| C｜迁到腾讯云原生后端 | 改用腾讯云数据库、COS 和自建认证/API | 后端可完全按腾讯云服务设计 | 本质是后端重写，不能视为普通域名迁移 |

## 决定

选择方案 B 作为 V2-A：

1. `foodprint.com.cn` 和 Next.js 应用运行环境迁到腾讯云 CVM。
2. 当前 Supabase 继续承担数据库、Auth、Storage、RLS、RPC 与 Edge Function 职责。
3. V2-A 同时收口私域邀请、成员权限、审计可见性、Nginx 边界、备份、监控和发布回滚。
4. 任何数据平面迁移须在 V2-A 稳定后，以 V2-B 的独立 ADR/Spec 决定，不能作为域名切流的隐含步骤。

## 后果与约束

- 新域名、Supabase Auth Redirect URLs、Edge Function Origin 白名单和高德域名白名单必须在切流前同步配置。
- 因为 App Runtime 已迁移，Vercel 不再承担正式应用服务；但在稳定期保留旧部署作为回滚落点。
- 不允许在 V2-A 中导出、复制或删除真实 Supabase 数据来“顺便迁移”。
- 不允许把单独的 Supabase 数据迁移称作已经完成，除非 V2-B 的数据校验、权限测试、照片迁移和恢复演练全部通过。
- 该选择不影响未来改用自建 Supabase 或腾讯云原生服务的权利，只降低当前域名切流的耦合度。

## 复核条件

- V2-A 正式切流后稳定运行 7 天；
- 项目负责人明确提出数据平面入腾讯云的目标；
- 新方案给出数据流、成本、停机窗口、RLS/RPC 兼容性、对象存储迁移和回滚方案。
