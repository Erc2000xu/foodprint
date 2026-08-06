# Foodprint｜V2-A 腾讯云上线记录

> 发布日期：2026-08-06
> 发布入口：`https://foodprint.com.cn`
> 当前状态：已上线，进入稳定期

## 发布内容

- Next.js 应用从 Vercel 迁移到腾讯云 Lighthouse 运行。
- Supabase Auth、PostgreSQL、Storage、RLS、RPC 和 Edge Functions 保持不迁移，继续作为数据平面。
- Nginx 负责 TLS、HTTP→HTTPS、`www` canonical redirect、限速和反向代理。
- Docker 应用以非 root 用户运行，仅绑定 `127.0.0.1:3000`。
- V1.4.1 界面修复已包含在本次线上版本。
- 首页全局页尾已展示 ICP 备案信息，并链接至工信部备案查询系统；页尾已避开固定底部导航。

## 运行版本

本轮人工部署的镜像标签为：

```text
foodprint:v2-prod-20260806-icp-footer-fix
```

该标签是迁移期间的人工发布标签，不是 Git commit SHA。后续发布必须改为由 GitHub commit SHA 生成不可变镜像和 release 记录。

## 已验证

- `http://foodprint.com.cn` 返回 308 到 HTTPS。
- `https://www.foodprint.com.cn` 返回 308 到裸域。
- `https://foodprint.com.cn/` 未登录时按预期跳转到 `/login`。
- `https://foodprint.com.cn/api/health` 返回 `200` 和通用 `status: ok`。
- 生产容器为 healthy，systemd 服务为 active。
- HTTPS 证书同时覆盖裸域和 `www` 域名。
- 当前页面可见最新版界面和 ICP 页尾。

## 已知限制

- 本轮使用人工打包、上传和切换，腾讯云 GitHub Actions 发布 workflow 尚未实现。
- 当前本地工作区包含本轮代码和文档，但需要在本分支提交并推送后，GitHub 才成为完整源记录。
- Owner/Admin/Member 的完整业务回归、7 天稳定观察和非生产恢复演练尚未关闭。
- Vercel 旧部署暂时保留为稳定期回滚落点。

## 回滚边界

- 应用问题：恢复上一条腾讯云 release，重启 `foodprint-compose.service`，再检查 `/api/health`。
- 腾讯云实例故障：在稳定期内可将 DNS 恢复至已验证的 Vercel 回滚入口。
- 数据库变更：不做破坏性回滚，只通过新的向前兼容 migration 修复。
- 生产密钥、证书私钥、真实用户数据和控制台材料不进入 Git。

## 下一步唯一动作

将本轮 V2-A 代码、测试、部署模板和脱敏文档提交到当前 GitHub 工作分支；随后建立腾讯云自动构建、预检、健康检查、切换和回滚 workflow。
