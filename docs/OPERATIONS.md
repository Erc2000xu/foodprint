# 食迹 Foodprint｜生产运行与恢复说明

## 上线前检查

1. Vercel 的 Production、Preview、Development 环境均配置公共 Supabase 变量；Production 另外配置 `SUPABASE_SERVICE_ROLE_KEY`，仅供 Owner 的全量数据导出使用。
2. 高德 JS Key 的域名白名单包含生产域名；`AMAP_WEBSERVICE_KEY` 只保存在 Supabase Edge Function Secret。
3. 按时间顺序执行并提交 `supabase/migrations/`，再确认 Supabase Dashboard 中迁移状态一致。
4. 访问 `/api/health` 应返回 `status: ok`；未登录访问 `/` 应安全跳转至登录。
5. 使用 Owner 和普通成员各完成一次：登录、搜索地点、保存标记、照片上传、想去、导出。
6. 在 iPhone Safari 及 Android Chrome 试用 PWA 安装和离线页；离线页只保证应用壳可见，不承诺地图、搜索或私有数据离线可用。

## 备份与恢复

- Supabase Production 保留平台提供的数据库备份策略；在 Dashboard 的备份/恢复功能确认当前套餐可用范围和保留期。
- 每次上线前，Owner 从“我的”下载一次全量 JSON 导出，作为关系数据和照片 `object_key` 的独立清单；照片文件仍保留在私有 `place-photos` bucket。
- 恢复演练应在新建的非生产 Supabase 项目进行：先按迁移顺序建表，再导入 JSON 的关系数据，最后按照片 manifest 将文件恢复至相同 object key；不能直接在生产环境试恢复。
- 如需回滚应用：在 Vercel Deployments 选择上一条已验证的 Production 部署 Promote。数据库 migration 不做破坏性回滚；优先发布一条向前修复 migration。

## 数据导出边界

- 所有成员可导出自己的 marks、visits、wishlist 和照片清单。
- 只有 Owner 可导出整个共同地图；服务端在导出时检查角色，并记录 `data.exported` 审计事件。
- JSON 包含 UUID、来源 POI ID、坐标系、时间戳、关联 ID 和媒体 manifest；不含私有照片的可访问链接或文件内容。

## 运行注意

- `/api/health` 仅验证应用进程可响应，不泄露数据库状态、密钥或用户数据。
- PWA service worker 只缓存公开的应用壳、图标和静态 bundle；不会缓存 API、签名照片 URL、地图或 POI 搜索结果。
- Docker Desktop 未安装时 `supabase db push` 可能提示无法缓存 migration catalog；只要输出 `Finished supabase db push`，远程 migration 已完成。

## V1 检索数据上线顺序

1. 先在非生产 Supabase 项目依序执行 `20260724100000_v1_discovery_taxonomy.sql` 和 `20260724103000_v1_discovery_completion.sql`。
2. 以 Owner 和普通成员分别验证：王府井/东城区/王府井站、粤菜、约会、人均和评分筛选；确认跨小组地点不会出现在结果或 `/api/v1/places/search`。
3. 再将两条新增 migration 推至 Production。它们是只增不删的迁移，历史地点会进入“我的 → 完善地点检索信息”队列，不会被隐藏或重写。
4. 部署应用后检查 `/api/health`、首页 URL 筛选恢复、详情页“返回结果”、静态地图失败时的列表降级，以及私有照片只以短期签名 URL 展示。

## 腾讯云运行准备（ICP 完成前不切流）

V1 已使用 Next.js standalone 输出，Docker 镜像不依赖 Vercel Runtime。腾讯云 Linux 主机可在项目根目录执行：

```bash
cp .env.example .env.production
# 在服务器上填写真实值；不要把该文件提交到 Git
docker build -t foodprint:v1 .
docker run --env-file .env.production -p 3000:3000 --restart unless-stopped --name foodprint foodprint:v1
curl -fsS http://127.0.0.1:3000/api/health
```

Nginx 或负载均衡只需反向代理到 `127.0.0.1:3000`；`PORT`、`HOSTNAME` 和所有域名相关配置均可通过环境变量调整。备案完成且腾讯云副本验收通过后，才依次：配置 TLS → 将 `https://foodprint.com.cn` 添加至 Supabase Auth Redirect URLs、AMap 域名白名单和可信 Origin → 进行 DNS 切流。切流后保留 Vercel 回滚窗口，勿在业务代码中写死任一部署域名。
