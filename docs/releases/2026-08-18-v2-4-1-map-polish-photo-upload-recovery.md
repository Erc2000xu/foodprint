# Foodprint V2.4.1 地图控件与照片上传恢复实现报告

日期：2026-08-18

状态：仓库实现与本地自动化门禁完成；外部发布门禁未宣称通过。

## 范围

严格按 [`FOODPRINT_V2_4_1_MAP_POLISH_AND_PHOTO_UPLOAD_RECOVERY_DEVELOPMENT_HANDOFF_2026-08-18.md`](../FOODPRINT_V2_4_1_MAP_POLISH_AND_PHOTO_UPLOAD_RECOVERY_DEVELOPMENT_HANDOFF_2026-08-18.md) 及 UI-02 定位资产合同实施 M0–M5，未修改已发布 migration，未接入生成母稿或失败方向图。

## 实现摘要

- M0/M1：新增照片准备模块，加入 20MiB 源文件与 60MP 像素保护、`createImageBitmap` → `<img>/decode` fallback、顺序单图处理、真实 WebP MIME/magic 校验、自适应 display/thumbnail 预算、逐图失败/重试/移除/忽略、对象 URL / bitmap / canvas 释放和匿名阶段指标。
- M2：服务端重新校验 WebP、尺寸、字节、数量和配对顺序；canonical 失败返回 `photo_repair_required`，thumbnail 可延后登记；照片 ID 内容幂等；补传只操作既有 visit；地点详情提供作者专属补传入口；新增 `visit_record_id` 上限 9 的前向 migration，legacy `visit_id` 仍为 6。
- M3：筛选 chip 行与 popover 解耦；浮层锚点使用 DOM 几何测量并限制边界；菜单内部滚动、手势隔离、Escape、外部点击、浏览器返回和焦点恢复均接入。
- M4：接入 UI-02 正式透明 PNG 1×/2×/3× srcset 与 SVG fallback；定位按钮四状态、44px 命中区 / 26px 图标；定位反馈使用实际底部导航安全区与动态地图面板高度计算 toast 位置。
- M5：新增纯函数、组件、服务端合同、地图合同与资产合同测试，并保留可重复资产处理脚本和 manifest。

## 本地门禁证据

| 门禁 | 结果 |
| --- | --- |
| `npm run check` | 通过（lint、typecheck、Vitest 39 files / 118 tests、Next production build、ICP build verification） |
| `npm run verify:icp-build` | 通过，`filesScanned: 42` |
| `git diff --check` | 通过 |
| UI-02 资产处理脚本 | 通过，重新生成并完成 QA 输出 |
| UI-02 manifest SHA-256 | 通过，6 个正式 artifact 全部匹配 |
| 定向照片 / 地图测试 | 通过，新增测试共 16 tests |

## 尚未执行的外部门禁

以下项目需要真实数据库、设备或发布环境，当前工作区没有可用运行条件，因此不将其写成“通过”：

- Docker daemon 未运行，Supabase clean migration replay 与生产 schema snapshot 预演未执行；`supabase status` 无法连接 Docker socket。
- iPhone Safari / 已安装 PWA、Android Chrome、真实相册 3–6MB / 3 张照片、弱网恢复、定位权限与多面板真机截图未执行。
- 生产测试记录上传/补传、授权真实记录、小组无图 visit 统计和发布后 24 小时匿名观察未执行。

## 回滚边界

应用可回滚到上一份兼容镜像；照片补传入口可关闭，但不删除已登记照片或 visit。新增 migration 只向前，不提供 down migration；一旦有 7–9 张 `visit_record_id` 照片写入，不得恢复旧 6 张约束。
