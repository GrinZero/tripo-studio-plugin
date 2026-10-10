# 资产分组、任务血统与工业交付指南 (Assets, Tasks & Export)

[返回工具总览](README.md) · [返回主 README](../../README.md) · [3D 生成工具](generation.md) · [网格与材质工具](mesh-texture.md) · [本地 Blender 工具](local-blender.md)

在大型游戏或元宇宙项目中，资产管理、任务持久化与工业格式兼容性是交付的核心。Tripo Studio for Codex 提供了企业级的本地分组、端到端全链路血统溯源与工业格式无损导出体系。

---

## 包含的 MCP 工具清单

### 1. 资产分组与角色管理 (Asset Groups · 零积分消耗)
| 工具名 | 消耗积分 | 功能概述 |
| --- | :---: | --- |
| `tripo_list_asset_groups` | **0** | 列出当前账号下所有资产分组卡片（包含组名、封面成员缩略图预览与统计数量） |
| `tripo_list_group_assets` | **0** | 分页查询特定分组内的资产成员（支持模型与图片混编），或查询未分组的游离资产 |
| `tripo_create_asset_group` | **0** | 创建新资产分组（例如「主角包 · 赛博先锋」），支持创建时批量纳入选中成员 |
| `tripo_set_asset_group` | **0** | 将模型或图片资产批量加入指定组、跨组移动或移出分组（移出不删除资产源文件） |
| `tripo_rename_asset_group` | **0** | 资产组重命名，保留组 ID 与现有资产成员不变 |

### 2. 任务调度与血统追踪 (Task Engine)
| 工具名 | 消耗积分 | 功能概述 |
| --- | :---: | --- |
| `tripo_submit_task` | 否 | 立即确认并执行已暂存的配置草稿任务，严格比对安全哈希与报价单 |
| `tripo_task_sync` | 否 | 刷新单个任务执行进度、获取最新阶段信息与远端事件 |
| `tripo_task_wait` | 否 | 设定超时阈值阻塞等待任务运行完成，自动提取最终输出产物 |
| `tripo_task_cancel` | 否 | 取消处于排队或草稿确认阶段的任务 |
| `tripo_task_reconcile` | 否 | **异常对账**：当网络闪断导致状态不明 (`outcome_unknown`) 时对账远端 ID 并安全恢复 |
| `tripo_list_tasks` | 否 | 分页过滤本地持久化的全部历史任务列表 |
| `tripo_get_configuration_review` | 否 | 按稳定卡片 ID 查询当前配置；提交回执后才返回最终任务 ID。 |
| `tripo_get_task` | 否 | **血统溯源**：读取冻结参数、输入源文件哈希、关联上游父任务与完整执行日志 |
| `tripo_list_task_groups` | 否 | 按角色名称统计历史任务归属与数量 |
| `tripo_set_task_character` | 否 | 纠正或补充任务所属的角色名称标记 |

### 3. 工业格式导出与安全交付 (Export & Download)
| 工具名 | 消耗积分 | 功能概述 |
| --- | :---: | --- |
| `tripo_export_model` | 否 | 自有项目工业格式导出：支持 GLB、FBX (Blender 预设)、OBJ、USDZ、STL、3MF |
| `tripo_download` | 否 | 产物安全下载：将模型、贴图包 ZIP 或渲染图下载至本地，自动生成 Blender 适用的 meshopt 解码副本 |
| `tripo_show_result` | 否 | 在对话流中唤起可旋转缩放的 3D GLB 预览与下载结果卡片 |

---

## 资产分组与批量整理体验

在工作台资产库中，模型与参考图可以自由多选，并收纳进同一张资产卡片中：

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <b>资产分组卡片（名称、预览缩略图与资产总数）</b><br/>
      <img src="../images/asset-groups.png" alt="资产分组卡片" width="100%" />
    </td>
    <td width="50%" align="center">
      <b>跨页多选与底部快捷批量操作栏</b><br/>
      <img src="../images/asset-multiselect.png" alt="资产多选操作栏" width="100%" />
    </td>
  </tr>
</table>

- **本地账号隔离**：资产组数据存储于本机，按 Studio 账号完全隔离，切换账号互不干扰。
- **零成本整理**：无论是新建分组、重命名、移入还是移出，全部在本地即时生效，不消耗任何 Studio 点数。

---

## 全链路血统溯源 (Lineage & Provenance)

Tripo Studio for Codex 具备严格的数据溯源机制，确保工业交付物来源清晰可查：

```mermaid
flowchart LR
    IMG[输入参考图<br/>(记录 SHA256 哈希)] --> T1[Task #1: 模型生成<br/>(冻结参数快照)]
    T1 --> T2[Task #2: 语义分件]
    T2 --> T3[Task #3: 骨骼绑定]
    T3 --> T4[Task #4: FBX 导出]
    T4 --> LOCAL[本地交付文件<br/>meshopt GLB + FBX + 4K PBR]
    
    T4 -.->|parent_task_id| T3
    T3 -.->|parent_task_id| T2
    T2 -.->|parent_task_id| T1
    T1 -.->|source_hash| IMG
```

- 通过 `tripo_get_task(task_id, include_events:true)`，Agent 能清晰回答：“这个 FBX 模型是由哪张原画、在什么时候、使用哪组参数、经过了哪些分件和绑定步骤生成的”。
- **异常任务对账**：若生成期间遇到断网导致任务状态不明 (`outcome_unknown`)，绝不盲目重复发起扣费任务；系统通过 `tripo_task_reconcile` 安全比对远端任务并自动收拢结果。

---

## 结果卡片与工业交付

生成完成后，对话流与工作台均提供可实时旋转、缩放检视的 3D GLB 结果卡片，并自动生成兼容 Blender 的 meshopt 解码版本：

<div align="center">
  <img src="../images/model-preview-download.png" alt="模型结果卡片：可交互 GLB、下载记录与 Blender 兼容副本" width="85%" />
</div>

### 格式导出与下载规范
1. **多格式支持**：
   - **FBX (Blender 预设)**：优化轴向系统（Z-Up / Y-Forward）与材质节点，开箱即入 Blender。
   - **OBJ**：附带 MTL 材质库与四边形顶点信息。
   - **USDZ**：苹果生态与 AR Quick Look 标准格式。
   - **STL / 3MF**：3D 打印工业切片格式。
2. **meshopt 自动解码**：Tripo Studio 生成的 GLB 默认采用 meshopt 几何压缩；下载时插件会自动在本地多生成一份解码后的标准副本，避免旧版 Blender 导入时黑屏报错。

---

## 典型对白范例 (Prompts)

### 场景 1：批量多选并整理进资产组
```text
请列出当前未分组的所有模型。
把其中的「机械狐」模型和它的 4 张参考原画打包收进一个新资产组，命名为「角色资产 · 机械狐」。
```

### 场景 2：追溯当前模型的来源输入与生成参数
```text
帮我查一下当前选中的高精机甲模型：
告诉我它是用哪张图生成的？当时设定的面数与架构版本是什么？经历了哪些后续操作？
```

### 场景 3：导出为 Blender 优化的 FBX
```text
将这个自有项目导出为 FBX 格式：
- 选用 Blender 预设
- 打包 4K 贴图
- 导出完成后下载到本地，并告诉我存储路径与解码文件位置。
```
