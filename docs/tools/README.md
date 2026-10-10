# Tripo Studio for Codex — 工具全景与分类索引 (Tools Index)

[返回主 README](../../README.md) · [3D 生成工具](generation.md) · [网格与材质工具](mesh-texture.md) · [绑定与动画工具](rigging-animation.md) · [本地 Blender 工具](local-blender.md) · [资产与任务工具](assets-tasks-export.md)

Tripo Studio for Codex 共向系统注册了 **68 个 MCP 工具**（包含 64 个智能体可见工具与 4 个 Webview App 专属交互工具）。所有云端生成工具默认接入 60 秒可编辑安全草稿卡片机制，本地 Blender 工具完全离线运行、零积分消耗。

---

## 模块全景与导航

| 模块分类 | 工具数量 | 积分消耗 | 核心职责 | 详细指南 |
| --- | :---: | :---: | --- | --- |
| **🖥️ 交互工作台 (Workbench)** | 1 + 4 App | 否 | 打开可视化工作台，资产/任务/创建三合一面板路由 | [详见下文](#1-交互工作台-workbench) |
| **👤 账号与会话 (Auth & Session)** | 5 | 否 | 浏览器会话继承、无密码免配置登录、会员套餐与点数检视 | [详见下文](#2-账号与会话管理-auth--session) |
| **⚡ 云端 3D 生成 (Generation)** | 8 | 是 (部分) | High Detail 建模、Smart Mesh 游戏拓扑、多视角图生模、AI 概念图 | [3D 生成工具指南](generation.md) |
| **🔧 网格拓扑与部件 (Mesh Editing)** | 6 | 是 (部分) | 语义分件、部件补全、重拓扑 Remesh、Smart UV 上下文与候选 | [网格与材质指南](mesh-texture.md) |
| **🎨 材质与纹理管线 (Texture & PBR)** | 5 | 是 | 贴图生成、局部编辑预览、贴图无损放大、PBR 多通道材质生成 | [网格与材质指南](mesh-texture.md) |
| **🦴 骨骼与 AI 动作 (Rig & Motion)** | 5 | 是 | Rig V3 自动骨架绑定、双足人形预设库、AI Motion 动效生成与重定向 | [绑定与动画指南](rigging-animation.md) |
| **🛠️ 本地 Blender 工具箱 (Local Blender)** | 6 | **零消耗** | 本地网格流形检查、线框/多视口渲染、视口投影烘焙、本地部件编辑 | [本地 Blender 指南](local-blender.md) |
| **📦 资产分组与角色 (Asset Groups)** | 5 | **零消耗** | 本地资产分组、角色包归类、跨页多选管理、来源关联延续 | [资产与任务指南](assets-tasks-export.md) |
| **📋 任务调度与血统追踪 (Task Engine)** | 9 | 否 | 任务提交、超时等待、进度同步、异常对账、输入血统全链路追踪 | [资产与任务指南](assets-tasks-export.md) |
| **📤 导出与交付 (Export & Delivery)** | 3 | 否 | 多格式导出 (FBX/OBJ/USDZ/STL/3MF)、meshopt 自动解码、产物下载 | [资产与任务指南](assets-tasks-export.md) |
| **💰 积分预估与计费 (Quotes)** | 1 | 否 | 单步操作或暂存草稿的透明积分预估，无实际扣费风险 | [详见下文](#10-积分预估与计费-quotes) |

---

## 1. 交互工作台 (Workbench)

| 工具名称 | 权限类型 | 消耗积分 | 说明 |
| --- | :---: | :---: | --- |
| `tripo_open_workbench` | Agent 可见 | 否 | 打开侧边栏或主界面工作台，支持直接路由到资产页、任务页、创建面板或指定项目。打开本身不扣除任何积分。 |
| `tripo_ui_preview` | App 专属 | 否 | 工作台专用的轻量级图片与模型预览流。 |
| `tripo_ui_import_image` | App 专属 | 否 | 在工作台界面中导入本地参考图。 |
| `tripo_ui_asset_library` | App 专属 | 否 | 工作台资产卡片的分页聚合与多选分组持久化。 |
| `tripo_ui_review` | App 专属 | 否 | 草稿确认卡片的状态管理、参数交互编辑、重新报价与倒计时取消。 |

---

## 2. 账号与会话管理 (Auth & Session)

| 工具名称 | 权限类型 | 消耗积分 | 说明 |
| --- | :---: | :---: | --- |
| `tripo_auth_status` | Agent 可见 | 否 | 查询当前 Tripo Studio 会话连接状态、登录有效性与用户名（不泄露敏感密钥）。 |
| `tripo_auth_login` | Agent 可见 | 否 | 唤起无头登录或调起默认浏览器完成 Tripo Studio 会话继承；已登录自动复用。 |
| `tripo_auth_import` | Agent 可见 | 否 | 允许手动导入已有的 Studio 网页端 Session Cookie 凭据。 |
| `tripo_auth_logout` | Agent 可见 | 否 | 清除插件本地保存的登录凭据并注销当前会话。 |
| `tripo_get_payment` | Agent 可见 | 否 | 查询当前绑定的 Studio 账号订阅等级、可用积分额度及刷新周期。 |

---

## 3. 云端 3D 生成与多模态创作 (Generation)

详细使用方式、参数清单与截图参见专题文档：👉 [3D 生成工具详细指南 (generation.md)](generation.md)

| 工具名称 | 操作标识 | 消耗积分 | 功能描述 |
| --- | --- | :---: | --- |
| `tripo_generate_model` | `model.generate` | 是 | 核心 3D 生成：支持 High Detail (H2.5/H3.0/H3.1) 与 Smart Mesh P2 (500–25k 面四边形网格)，单图/文本/四视图生成。 |
| `tripo_generate_image` | `image.generate` | 是 | 概念草图生成：内置高质量生图模型，为 3D 资产提供风格一致的源概念图。 |
| `tripo_generate_multiview` | `image.multiview` | 是 | 多视角概念展开：由单张参考图自动衍生前、后、左、右四视角对齐图。 |
| `tripo_regenerate_image` | `image.regenerate` | 是 | 参考图重采样与风格变体生成。 |
| `tripo_upscale_image` | `image.upscale` | 是 | 概念图 4K 超分辨率放大。 |
| `tripo_split_image` | `image.split` | 是 | 多合一拼接图智能主体切分。 |
| `tripo_import_model` | `model.import` | 否 | 导入外部自包含 3D 模型进入 Studio 管线，进行后续分件、拓扑或绑定。 |
| `tripo_list_image_templates` | - | 否 | 查询系统内置的概念设计风格模板库。 |

---

## 4. 网格拓扑与部件工坊 (Mesh Editing)

详细使用方式、参数清单与截图参见专题文档：👉 [网格与材质工具详细指南 (mesh-texture.md)](mesh-texture.md)

| 工具名称 | 操作标识 | 消耗积分 | 功能描述 |
| --- | --- | :---: | --- |
| `tripo_segment_model` | `model.segment` | 是 | AI 语义分件：自动将单体模型识别并拆解为可独立编辑的部件网格（如头部、四肢、配饰）。 |
| `tripo_complete_parts` | `model.complete_parts` | 是 | 部件几何补全：对破损、遮挡或不完整的几何体进行封闭修复与形状补全。 |
| `tripo_remesh_model` | `model.remesh` | 是 | 工业级重拓扑：重新划分网格流向，严苛控制目标面数，提供规整布线。 |
| `tripo_generate_uv` | `model.uv_generate` | 是 | Smart UV 候选生成：自动计算并展开高质量 UV 贴图坐标。 |
| `tripo_apply_uv` | `model.uv_apply` | 否 | 选用并应用满意的 Smart UV 候选方案到模型。 |
| `tripo_get_uv_context` | - | 否 | 查询当前模型关联的 UV 候选列表与展开状态。 |

---

## 5. 材质与纹理管线 (Texture & PBR)

详细使用方式、参数清单与截图参见专题文档：👉 [网格与材质工具详细指南 (mesh-texture.md)](mesh-texture.md)

| 工具名称 | 操作标识 | 消耗积分 | 功能描述 |
| --- | --- | :---: | --- |
| `tripo_generate_texture` | `texture.generate` | 是 | 全新贴图生成：根据提示词或参考图为模型生成 2K / 4K / 8K 高清贴图。 |
| `tripo_preview_texture_edit` | `texture.edit_preview` | 是 | 纹理局部修改预览：支持指定区域重绘与贴图微调。 |
| `tripo_apply_texture_edits` | `texture.edit_apply` | 是 | 确认并将纹理编辑应用到当前模型项目中。 |
| `tripo_upscale_texture` | `texture.upscale` | 是 | 贴图无损超分辨率：将低分辨率贴图升格为 4K / 8K 极清贴图。 |
| `tripo_generate_pbr` | `texture.pbr` | 是 | PBR 材质通道烘焙：自动提取法线贴图 (Normal)、粗糙度贴图 (Roughness) 与金属度贴图 (Metallic)。 |

---

## 6. 骨骼绑定与 AI 动作系统 (Rig & Motion)

详细使用方式、参数清单与截图参见专题文档：👉 [绑定与动画工具详细指南 (rigging-animation.md)](rigging-animation.md)

| 工具名称 | 操作标识 | 消耗积分 | 功能描述 |
| --- | --- | :---: | --- |
| `tripo_rig_model` | `model.rig` | 是 | Rig V3 自动骨架绑定：智能检测网格双足特征，建立标准人形或通用生物骨架层级。 |
| `tripo_animate_model` | `model.animate` | 是 | 预设动作应用：为已绑定的模型套用行走、奔跑、战斗等标准预设动作。 |
| `tripo_list_animation_presets`| - | 否 | 获取官方动画预设列表与动作类别。 |
| `tripo_generate_motion` | `motion.generate` | 是 | AI Motion 动作生成：通过文本描述生成 1–5 个阶段的高难度自定义连续动作。 |
| `tripo_apply_motion` | `model.apply_motion` | 是 | 将 AI Motion 生成的动作重定向并烘焙到目标双足模型骨架上。 |

---

## 7. 本地 Blender 工业级工具箱 (Local Blender)

详细使用方式、参数清单与截图参见专题文档：👉 [本地 Blender 工具详细指南 (local-blender.md)](local-blender.md)

> 💡 **全部离线运行 · 零积分消耗 · 隐私保护**：不调用云端接口，不上传模型数据，完全使用本机 Blender 后台进程计算。

| 工具名称 | 操作标识 | 消耗积分 | 功能描述 |
| --- | --- | :---: | --- |
| `tripo_inspect_local_parts` | `local.inspect_parts` | **零消耗** | 几何体素健康体检：检视 GLB 网格流形结构、面数体素分布与 UV 利用率。 |
| `tripo_render_model` | `local.render` | **零消耗** | 离线渲染：生成纯线框图 (Wireframe) 或模型多角度 2× 视口无光照 WebP 渲染图。 |
| `tripo_edit_parts` | `local.edit_parts` | **零消耗** | 本地部件编辑：在安全副本上执行部件合并、隐藏、删除或局部面分离。 |
| `tripo_bake_texture_projection`| `local.project_texture` | **零消耗** | 贴图投影烘焙：将 2D 参考图按实际相机视角精准投影并烘焙到模型 UV 表面。 |
| `tripo_paint_texture` | `local.paint` | **零消耗** | 贴图笔刷绘制：在本地模型贴图副本上按 UV 笔划进行离线绘制修正。 |
| `tripo_crop_image` | `local.crop` | **零消耗** | 图片裁切：在本地精准裁切参考图像素区域。 |

---

## 8. 资产分组与角色管理 (Asset Groups)

详细使用方式、参数清单与截图参见专题文档：👉 [资产与任务工具详细指南 (assets-tasks-export.md)](assets-tasks-export.md)

| 工具名称 | 消耗积分 | 功能描述 |
| --- | :---: | --- |
| `tripo_list_asset_groups` | **零消耗** | 按登录账号列出本地所有资产分组卡片（显示名称、成员缩略图预览与数量）。 |
| `tripo_list_group_assets` | **零消耗** | 分页查询特定分组内的模型与图片资产，或查询未分组的游离资产。 |
| `tripo_create_asset_group`| **零消耗** | 创建新的资产组（如「赛博朋克主角包」），支持初始化时批量加入模型/图片引用。 |
| `tripo_set_asset_group` | **零消耗** | 资产批量移入、跨组迁移或移出（移出不删除资产源文件）。 |
| `tripo_rename_asset_group`| **零消耗** | 重命名资产组，自动保留原有组 ID 与所有资产成员关系。 |

---

## 9. 任务调度与血统追踪 (Task Engine)

详细使用方式、参数清单与截图参见专题文档：👉 [资产与任务工具详细指南 (assets-tasks-export.md)](assets-tasks-export.md)

| 工具名称 | 消耗积分 | 功能描述 |
| --- | :---: | --- |
| `tripo_submit_task` | 否 (执行草稿) | 立即确认并执行已暂存的配置草稿任务，严格核对安全哈希与报价单。 |
| `tripo_task_sync` | 否 | 刷新单个任务的最新执行进度、中间状态与远端事件。 |
| `tripo_task_wait` | 否 | 设定超时阈值并阻塞等待任务执行完毕，自动提取结果数据。 |
| `tripo_task_cancel` | 否 | 撤销处于待确认或排队状态的任务。 |
| `tripo_task_reconcile` | 否 | 异常对账恢复：当网络抖动导致任务状态不明 (`outcome_unknown`) 时对账远端状态。 |
| `tripo_list_tasks` | 否 | 查询本地持久化的任务历史队列，支持按类型、角色、状态筛选。 |
| `tripo_get_configuration_review` | 否 | 按稳定卡片 ID 查询当前配置；提交回执后才返回最终任务 ID。 |
| `tripo_get_task` | 否 | 读取任务完整血统快照（包含冻结参数、输入源哈希、关联上游 ID、执行事件）。 |
| `tripo_list_task_groups` | 否 | 按角色名聚合统计已完成和进行中的任务分布。 |
| `tripo_set_task_character`| 否 | 纠正或补充任务的角色元数据，便于资产血统回溯。 |

---

## 10. 导出交付与积分预估 (Delivery & Quotes)

| 工具名称 | 消耗积分 | 功能描述 |
| --- | :---: | --- |
| `tripo_export_model` | 否 | 工业格式导出：将项目导出为 GLB / FBX (Blender/Unity/Unreal 预设) / OBJ / USDZ / STL / 3MF。 |
| `tripo_download` | 否 | 产物安全下载：将云端生成的 3D 模型、贴图包 ZIP、渲染图下载至本地，自动生成 Blender 适用的 meshopt 解码副本。 |
| `tripo_show_result` | 否 | 显式在当前对话流中唤起特定项目、模型、图片或任务的可视化 3D 检视卡片。 |
| `tripo_quote_operation` | 否 | 纯预估操作：在不发起任务的前提下，精准核算指定操作在当前会员等级下的积分消耗。 |
