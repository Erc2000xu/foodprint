# ADR 2026-07-02｜高德来源与服务边界

> 状态：已记录，随 P0 批准后实施

## 背景

Foodprint 的地点搜索和静态地图由 Supabase Edge Function 调用高德。现有函数把旧 Vercel 地址写死为允许 Origin；当前部署地址不在名单内，导致请求在到达高德之前被拒绝。

## 决定

1. 高德 Web Service Key 和安全密钥只留在服务端 Secret。
2. Edge Function 使用受控、精确的 APP_ALLOWED_ORIGINS 配置校验 Origin，不使用星号和宽泛域名匹配。
3. JavaScript API Key 的高德域名白名单与 Edge Function Origin 列表分别维护、同时发布、同时验证。
4. Production 使用稳定别名或正式自定义域名；Preview 只临时精确授权并有到期清理。
5. 服务失败采用列表优先的可理解降级，不暴露供应商密钥、内部错误或用户敏感数据。

## 后果

- 部署地址变化成为一次显式运维变更，不能只发布前端。
- 配置漏同步会被发布后冒烟测试尽早发现。
- 安全边界更清晰，但需要维护者按手册管理白名单。

## 复核条件

切换腾讯云/.com.cn、替换地图供应商、引入新客户端域名或发现异常调用时，必须复核本 ADR。
