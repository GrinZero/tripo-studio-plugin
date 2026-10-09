# Agent 资产分组管理工具

补齐模型可见的资产分组工具，与工作台使用同一 `AssetLibrary` 和按账号隔离的 `asset-groups.json`。五个工具均为数据工具，`ui.visibility:[model,app]`，不切换当前预览。分组管理只修改本地归属，不提交 Studio 写入或付费操作。总工具数 67：63 个模型可见工具、4 个界面专用工具。

| 工具 | 输入和行为 |
| --- | --- |
| `tripo_list_asset_groups` | `offset,limit,search,include_empty,refresh`；返回分组 ID、名称、模型／图片／合计数量与 `next_offset`。默认包括空组。 |
| `tripo_list_group_assets` | `group_id,type,offset,limit,search,sort,refresh`；默认返回模型和图片，支持 `models/images/all`。`ungrouped` 查看未分组资产。 |
| `tripo_create_asset_group` | `name,assets?`；创建或复用同名组，可不传成员建立空组，也可一次收进模型和图片。 |
| `tripo_set_asset_group` | `group_id,assets`；加入或移动成员，传 `group_id:null` 移出。每个资产只有一个分组。 |
| `tripo_rename_asset_group` | `group_id,name`；重命名手动／自动分组，保留 ID 与全部成员。重名返回 `GROUP_NAME_CONFLICT`。 |

`assets` 是最多 500 条真实 `{project_id}` 或 `{asset_id}`，允许混合类型；重复成员去重。批量修改前检查全部资产是否在当前账号目录，非法项不会导致部分归组。操作前后确认账号一致，名称 NFKC／空格／大小写归一化；创建同名组会复用身份。新手动组使用独立稳定 ID，重命名后重新使用旧名称不会错指向已改名组。文件锁保证创建、调整归属与改名的并发写入不丢失更新；使用过期对象归组也不会覆盖已保存的新名称。

自动组的改名存为名称覆盖，适用于同 ID 的现有及后续资产输出；历史任务角色名和付费参数不改变。移出保存 null 覆盖，防止任务角色归属自动恢复。空组仍可由 agent 查询和加入，根目录不显示空卡片。工作台组内新增“重命名分组”按钮，通过公开的改名工具调用同一逻辑。

构建通过，全量测试 123 项通过、0 失败。验证包括实际 MCP tools/list 与 tools/call 的创建、混合资产加入／移动、组内分页、重命名、重复名称、非法批量、移出、账号隔离，以及重启服务实例后工作台读取同一归属。Computer Use 实际操作重命名弹窗后确认：模型页的 22 个模型与图片页的 1 个图片保留相同分组身份，两页名称同步更新。原生 Codex 应用不允许 Computer Use 控制，浏览器验证使用原生 Safari 本机隔离宿主和测试目录。

截图保存于 `output/computer-use/`：`asset-group-rename-dialog.png`、`asset-group-renamed-root.png`、`asset-group-renamed-images.png`。分别记录弹窗间距、模型分组卡片与图片分组卡片。

同步安装后需要重新加载插件连接，宿主才能发现这五个新工具。
