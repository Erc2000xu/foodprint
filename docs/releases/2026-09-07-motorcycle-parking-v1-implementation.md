# 食迹 Foodprint｜摩托车停车地图 V1 实现记录

> 日期：2026-09-07；最后验证更新：2026-09-09
> 状态：干净主线基线上的仓库实现完成，待 CI／临时库重放、真实账号初始化、真实地图／真机验收和发布审批。
> 分支：codex/motorcycle-parking-v1

## 已交付

- 首页发现页新增独立 canUseParking 权限入口，使用 V3 浅蜜黄色完整按钮；列表模式和地图模式均位于搜索控件下方，未授权时不渲染。
- 新增 /parking：复用高德 JS API、同源安全代理、GCJ-02、白底地图风格、定位控件和底部导航；支持点、路段、区域，中心准星选点，撤销、重选、取消，路段长度预览，区域自动闭合。
- 新增停车表单：名称 30 字、主动勾选方便停车、备注 500 字；详情、作者限制的编辑/删除、保存失败保留草稿、幂等保存和权限失效清屏。
- 新增「我的」停车地图权限区：仅数据库核实的指定管理人可从现有有效成员中添加/撤销授权；不改变成员原有 Owner/Admin/Member 身份。
- 新增 parking_feature_config、parking_feature_access、parking_marks migration；RLS、权限 RPC、软删除、审计、坐标/几何校验、成员暂停/移除自动撤销。
- 新增受控初始化脚本 npm run parking:init。未初始化时功能默认关闭；脚本不会创建账号，也不会根据首次访问者推断管理人。
- 新增几何单元测试和迁移/入口/资产契约测试；按钮提供 1×／2×／3× 运行尺寸衍生图，V3 源图、按钮设计记录和首页位置参考一并保留在设计记录目录。

## 权限口径

| 身份 | 首页入口 | 共享查看 | 自己的记录 | 授权管理 |
| --- | --- | --- | --- | --- |
| 初始化绑定的现有 Owner | 有（开关开启后） | 有 | 创建/编辑/删除自己的 | 有 |
| 显式授权的有效成员 | 有 | 有 | 创建/编辑/删除自己的 | 无 |
| 其他 Owner/Admin/Member | 无 | 无 | 无 | 无 |
| 暂停、移除、撤销或未登录 | 无 | 无 | 无 | 无 |

停车管理人不是“任意 Owner/Admin”判断，而是
parking_feature_config.manager_user_id 与一个当前有效的 Owner 成员逐项匹配。成员恢复后不会自动恢复旧授权；历史停车记录不因撤销或软删除而物理清除。

## 真实账号初始化

1. 在发布前由项目负责人从现有成员目录核对目标小组的 group_id 和负责人稳定 user_id；核对该账号当前为该小组有效 Owner。不要填昵称、邮箱展示文案或新建账号。
2. 在受控发布环境配置以下变量，不提交到仓库，也不在聊天中发送密钥：

   ~~~text
   SUPABASE_URL=<目标环境 URL>
   SUPABASE_SERVICE_ROLE_KEY=<仅发布任务可读>
   FOODPRINT_PARKING_GROUP_ID=<已核对的小组 UUID>
   FOODPRINT_PARKING_MANAGER_USER_ID=<已核对的现有 Owner UUID>
   FOODPRINT_PARKING_ENABLED=false
   ~~~

3. 先运行 npm run parking:init 写入绑定但保持关闭；完成 CI、RLS/RPC、真机和高德配额/隐私检查后，再通过同一受控流程设置 FOODPRINT_PARKING_ENABLED=true 重新执行。初始化 RPC 会拒绝非 service role、非有效 Owner 和换绑管理人。
4. 若真实账号 ID 尚未核实，使用合成小组/合成成员在临时 Supabase 中验收，保持正式环境未初始化；不要把首次访问者设为管理人。

## 检查结果

已完成：

- 停车功能改动范围的 `git diff --check`：通过；主线既有历史文档未做格式化清理。
- 全仓 TS/TSX 解析语法扫描：通过（当前整合目录 211 个源文件，0 个解析诊断）。
- 全仓 TypeScript 检查：通过（按当前 `main` 整合后的目录，`tsc --noEmit --incremental false` 通过）。
- 干净基线范围检查：通过；以当前 `main` 提交为父基线，仅新增停车 V1 文件及发现页／我的页／地图页的最小接入，没有覆盖 V2.4.2 迁移或业务逻辑；无冲突标记。
- 停车几何运行时检查：通过；点、约 50／100 米路段、弯折线、区域闭合和自交区域拒绝均已执行。
- migration 静态契约检查：通过；`$$` 代码块配对，表、RLS、RPC、权限撤销、软删除、幂等和成员状态触发器均存在。
- node --check scripts/initialize-parking-feature.mjs：通过。
- V3 运行资产检查：PNG 有效；1× 44、2× 88、3× 132 资源已生成。

## 界面截图

- [375px 停车地图布局预览](../design/motorcycle-parking-v1/parking-v1-layout-preview.png)：展示顶部返回/列表控件、中心准星、底部操作面板和底部导航。该图是无账号、无高德 Key 的静态布局预览，不冒充真实设备验收。

当前环境未完成：

- npm run lint：通过；next build：通过（Turbopack 编译、构建期 TypeScript、21 个静态页面生成均完成）。
- Vitest：通过（49 个测试文件、158 个测试）；停车新增几何与契约测试 7/7 通过。
- 本机 Supabase migration 重放：Docker daemon 当前未运行；supabase status 返回无法连接 Docker。未连接或写入生产数据库。
- 高德真实 Key、登录账号、授权成员、真实地图加载、iOS Safari、Android Chrome、已安装 PWA、生产 RLS/RPC：待对应外部条件和 CI/临时库。

## 发布与回滚

按现有 [Release SOP](../RELEASE_SOP.md) 执行：先在 CI 临时 Supabase 从零重放全部 migration，再走 PR、合入 main、人工发布确认和生产 workflow。不要在本机执行 supabase db push、生产 SQL Editor 或直接写生产数据库。

发布顺序：

1. migration dry-run / migration-integrity；
2. 生产 workflow 推送 migration；
3. 应用镜像发布与健康检查；
4. 受控初始化停车管理人并按审批开启功能；
5. 用指定管理人、授权成员、未授权 Owner/Admin/Member、撤销成员分别验收。

止血时先将停车功能开关关闭，首页和 /parking 随权限口径降级；应用可回退到上一条已验证版本。不要删除停车表或历史记录；数据库问题只通过后续向前 migration 修复。
