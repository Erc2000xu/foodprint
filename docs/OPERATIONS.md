# 食迹 Foodprint｜生产运行与恢复说明

> 地图故障、Key、白名单、配额和发布后地图验收优先遵循 AMAP_OPERATIONS_RUNBOOK.md；安全、隐私和大陆发布门槛优先遵循 SECURITY_COMPLIANCE_BASELINE.md。

## 标准发布管道

GitHub 是代码与发布历史的唯一事实来源。代码、migration 和 Edge Function 先经工作分支、PR 与 CI，再合入 `main`；Supabase production 的数据库/函数发布继续遵循 [RELEASE_SOP.md](RELEASE_SOP.md)。当前腾讯云应用发布 workflow 尚未完成，本轮迁移使用了已记录的人工部署例外；后续不得把直接上传服务器当作常规流程。

本机不得以 `supabase db push`、SQL Editor 或 `vercel --prod` 替代受控管道。腾讯云生产也不得直接修改代码；应由 GitHub 构建带有 commit SHA 的 release，再由受限发布账户部署。自动化启用前的 migration history 对账是一次性受控工作；没有逐项对象核对，不使用 `migration repair` 或 `--include-all`。

## 上线前检查

1. 腾讯云生产容器使用 production Supabase 变量，并另外配置 production `SUPABASE_SERVICE_ROLE_KEY`，仅供 Owner 的全量数据导出使用。Vercel 只作为稳定期回滚环境；没有独立测试库时，不为 Preview 配置会写入 production 的变量。
2. 高德 JS Key 的域名白名单包含生产域名；`AMAP_WEBSERVICE_KEY` 只保存在 Supabase Edge Function Secret。
3. migration 已在 PR CI 的干净数据库中重放；正式发布前的 dry-run 与生产应用均已成功，迁移历史一致。
4. 访问 `/api/health` 应返回 `status: ok`；未登录访问 `/` 应安全跳转至登录。
5. 使用 Owner 和普通成员各完成一次：登录、搜索地点、保存标记、照片上传、下回吃、导出。
6. 在 iPhone Safari 及 Android Chrome 试用 PWA 安装和离线页；离线页只保证应用壳可见，不承诺地图、搜索或私有数据离线可用。

## 备份与恢复

- Supabase Free 不提供自动数据库备份。每次高风险 migration 前按本节导出 Owner 数据；在升级套餐前不得假设平台可提供可用的时间点恢复。
- 每次上线前，Owner 从“我的”下载一次全量 JSON 导出，作为关系数据和照片 `object_key` 的独立清单；照片文件仍保留在私有 `place-photos` bucket。
- 恢复演练应在本机 Supabase 或未来可用的非生产项目进行：先按迁移顺序建表，再导入 JSON 的关系数据，最后按照片 manifest 将文件恢复至相同 object key；不能直接在生产环境试恢复。
- 如需回滚当前应用：恢复 `/opt/foodprint/current` 到上一条已验证的腾讯云 release，重启 `foodprint-compose.service` 并检查 `/api/health`。Vercel 仅作为腾讯云不可用时的过渡回滚落点。数据库 migration 不做破坏性回滚；优先发布一条向前修复 migration。

## 数据导出边界

- 所有成员可导出自己的 marks、visits、wishlist 和照片清单。
- 只有 Owner 可导出整个共同地图；服务端在导出时检查角色，并记录 `data.exported` 审计事件。
- JSON 包含 UUID、来源 POI ID、坐标系、时间戳、关联 ID 和媒体 manifest；不含私有照片的可访问链接或文件内容。

## 运行注意

- `/api/health` 仅验证应用进程可响应，不泄露数据库状态、密钥或用户数据。
- PWA service worker 只缓存公开的应用壳、图标和静态 bundle；不会缓存 API、签名照片 URL、地图或 POI 搜索结果。
- 本机 Docker Desktop 不可用不会阻断发布：migration 完整重放由 GitHub CI runner 执行。当前不依赖额外的 Free staging 项目，也不把 production 用作临时测试库。

## V1 检索数据上线顺序

1. 先在本机或 GitHub CI 的干净 Supabase 数据库中依序重放 `20260724100000_v1_discovery_taxonomy.sql` 和 `20260724103000_v1_discovery_completion.sql`。
2. 以 Owner 和普通成员分别验证：王府井/东城区/王府井站、粤菜、约会、人均和评分筛选；确认跨小组地点不会出现在结果或 `/api/v1/places/search`。
3. 再将两条新增 migration 推至 Production。它们是只增不删的迁移，历史地点会进入“我的 → 完善地点检索信息”队列，不会被隐藏或重写。
4. 部署应用后检查 `/api/health`、首页 URL 筛选恢复、详情页“返回结果”、静态地图失败时的列表降级，以及私有照片只以短期签名 URL 展示。

## 腾讯云运行（V2-A 当前生产）

V2-A 的域名切流、私域用户治理、腾讯云防火墙、Nginx、TLS、发布和回滚，必须遵循 [V2 大陆域名与腾讯云迁移开发交接](./FOODPRINT_V2_MAINLAND_DOMAIN_MIGRATION_DEVELOPMENT_HANDOFF_2026-08-05.md)。部署模板集中在 [`deploy/`](../deploy/)，不要在服务器直接修改应用源码。

截至 2026-08-06，`foodprint.com.cn` 已由腾讯云 Lighthouse 提供正式流量，`www.foodprint.com.cn` 308 跳转到裸域，生产容器绑定 `127.0.0.1:3000`，systemd 单元为 `foodprint-compose.service`。当前发布标签为 `v2-prod-20260806-icp-footer-fix`；该标签是本轮人工发布记录，下一步应改为 Git commit SHA 驱动的自动发布。

### V2 当前服务器状态与配置边界

截至 2026-08-06，腾讯云 Lighthouse 已完成 Ubuntu/Docker/Nginx 基线、TLS 证书安装、V2 standalone 镜像构建、`127.0.0.1:3000` 容器健康检查、DNS 切流和公开域名验收。当前生产环境已承担正式业务流量；完整角色化业务回归、7 天稳定观察、恢复演练和自动化发布仍是后续事项。

生产环境文件应按 [`deploy/production.env.example`](../deploy/production.env.example) 创建为 `/etc/foodprint/production.env`，权限为 `0600`。`NEXT_PUBLIC_*` 值会被 Next.js 构建时内联到浏览器 bundle，因此每次这些值变化都必须重新构建镜像；服务端密钥只进入运行时环境文件，不进入 Docker build args、镜像源码或 Git。

受控发布目录为 `/opt/foodprint/current`，systemd 单元为 `foodprint-compose.service`。`deploy` 账户不加入 Docker 组，只可通过 sudo 执行该单元的 `restart`、`status` 和 `is-active`；生产配置文件权限为 `0600`，不使用 `docker.sock` 给部署账户扩大 root 权限。下一轮应由 GitHub Actions 以不可变 release 部署到该目录并保留上一版回滚。
