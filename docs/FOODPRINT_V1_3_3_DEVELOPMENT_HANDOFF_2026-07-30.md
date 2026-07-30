# 食迹 Foodprint｜V1.3.3 开发交接包

> 交接日期：2026-07-30
> 工作分支：`codex/v1-3-record-a-meal`
> 状态：产品与视觉开发稿已收束，待产品负责人批准后进入编码
> 本交接不表示功能已经开发或上线

## 1. 本版本要解决的问题

V1.3.3 是 V1.3 之后的产品小迭代，包含三部分：

1. 重整“记一顿”表单的信息层级、必填表达、三级推荐解释、四维解释和照片上传提示。
2. 将 D“温暖餐桌物件”四维图标作为正式资产，在发现、地点详情、记一顿和饭后聊等页面全局统一使用。
3. 为 Owner/Admin 补齐地点下架、恢复、到访与照片治理、候选管理，以及“我的”集中管理后台。

整体视觉方向采用 C“先选择，再补充”。本轮不实施 V3 的整体品牌皮肤、排版系统或页面重做。

## 2. 开发唯一依据

| 类型 | 文件 | 用途 |
| --- | --- | --- |
| 主规格 | `docs/specs/2026-07-v1-3-3-mark-form-and-management.md` | 完整页面、权限、流程、数据、测试和发布要求 |
| 管理 ADR | `docs/decisions/2026-07-30-v1-3-3-place-content-management.md` | 地点下架、内容隐藏、候选移除和角色边界 |
| 既有隐私 ADR | `docs/decisions/2026-07-29-v1-3-privacy-governance.md` | 内容保留、匿名、邮箱、管理员不可改写原观点 |
| 视觉台账 | `docs/VISUAL_ASSET_REGISTRY.md` | 图标状态、资产路径、全局使用门禁 |
| 表单方向 | `docs/design/v1-3-3-mark/README.md` | C 方向页面意图和意向图说明 |
| 四维资产说明 | `docs/design/v1-3-3-good-at-icons/README.md` | D 方向正式资产、尺寸、质检和接入规则 |

如交接摘要与主规格冲突，以已批准的主规格和 ADR 为准。

## 3. 已冻结的产品决策

### 记一顿

- 首次收录的真实推荐确认移到所有输入之前。
- 推荐强度使用现有 `BowlIcon` 和三句简短解释，不使用意向图中的临时图形。
- “好在哪儿”使用四个正式 `GoodAtIcon`，同时显示名称和简短解释。
- “小吃/街头餐饮”不再作为地点大类；具体风味继续由菜系表达。
- 照片区提示优先上传 3:4 竖图，并说明平台可能居中裁切。

### 地点与内容管理

- 已推荐地点只能对当前小组“下架”，不能物理删除共享 `places`。
- Owner/Admin 可下架和恢复地点；普通 Member 看不到地点级管理入口。
- 作者删除自己的到访；Owner/Admin 对他人内容采用“隐藏/恢复”，不得改写原文、评分或标签。
- 候选地点采用可审计的软移除；创建者与管理员的处理类型分开记录。
- 所有危险操作有二次确认；地点下架和管理员治理原因必填。
- “我的”新增 Owner/Admin 专属集中管理，包含上架中、已下架、去试试候选、已隐藏内容四类。

## 4. 正式视觉资产

四维图标的程序调用文件：

- `public/icons/good-at/tasty-ui.png`
- `public/icons/good-at/comfortable-ui.png`
- `public/icons/good-at/good-for-chat-ui.png`
- `public/icons/good-at/good-value-ui.png`

每项还配有 `*-master.png` 透明母稿。程序只调用 256 × 256 的 `*-ui.png`；不得从方向拼图中裁切，也不得用 emoji、临时 SVG 或其他 ImageGen 图替代。

三级推荐继续复用：

- `public/icons/recommendation/bowl-level-1-ui.png`
- `public/icons/recommendation/bowl-level-2-ui.png`
- `public/icons/recommendation/bowl-level-3-ui.png`

## 5. 推荐开发顺序

1. 产品负责人批准主规格和管理 ADR。
2. 新增前向 migration，补充下架/候选处理字段、约束和历史数据兼容。
3. 完成地点 archive/restore、候选 remove/restore、内容 restore 和管理列表 RPC。
4. 扩展作者删除到访事务，正确回退或清除 current opinion。
5. 增加服务端权限、审计事件、受控管理读模型和错误映射。
6. 增加 `PlaceManagementMenu`、确认对话框和“我的—地点与内容管理”。
7. 调整记一顿表单，接入 `GoodAtIcon` 并全局替换四维临时展示。
8. 完成三角色自动化测试、320/375/390px 视觉验收、发布与回滚核对。

数据库和服务端权限应先于普通页面按钮开发，避免出现只有前端隐藏、接口仍可越权的中间状态。

## 6. 开发门禁

- 不修改历史 migration，只新增前向 migration。
- 不把 role 当作客户端参数传给服务端决定权限。
- 不物理删除 `places`、到访历史、候选事实或审计记录。
- 不允许 Admin 因内容治理获得邮箱、角色管理或全组账户导出能力。
- 不允许管理员隐藏行为改写成员 current opinion。
- 普通发现、去试试和饭后聊查询不得返回 archived/hidden 内容。
- 视觉开发前先查视觉资产台账；资产状态或路径发生变化必须同步更新台账。

## 7. 验收结论的记录方式

开发完成后，应在主规格中记录：

- migration、RPC、RLS、Storage 和审计测试结果；
- Member、Admin、Owner 三角色人工验收；
- 320、375、390px 的表单、卡片、菜单和对话框截图；
- 四维图标在发现、地点详情、记一顿和饭后聊的全局一致性；
- Preview/Production 发布记录、回滚方式和已知限制。

在上述证据齐全前，V1.3.3 不能标记为“开发完成”或“已上线”。
