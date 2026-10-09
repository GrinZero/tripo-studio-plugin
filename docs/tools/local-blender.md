# 本地 Blender 工业级工具箱指南 (Local Blender Tools)

[返回工具总览](README.md) · [返回主 README](../../README.md) · [3D 生成工具](generation.md) · [网格与材质工具](mesh-texture.md) · [资产与任务工具](assets-tasks-export.md)

为了彻底解决 AI 3D 生成中“查看几何拓扑与烘焙改图需反复付费”的痛点，Tripo Studio for Codex 深度集成了**本地静默 Blender 引擎**。

> 🛡️ **三大核心保障**：
> 1. **零积分消耗 (Zero Credits)**：全部使用开发者本机算力计算，绝不扣除任何 Studio 会员积分。
> 2. **完全离线隐私 (100% Offline)**：不请求任何外部云端 API，不上传本地模型与图片，商业资产无泄露风险。
> 3. **非破坏性编辑 (Non-destructive)**：所有修改与烘焙均在独立副本上完成，原始下载文件始终完好保存。

---

## 包含的 MCP 工具清单

| 工具名 | 操作标识 | 消耗积分 | 核心作用 |
| --- | --- | :---: | --- |
| `tripo_inspect_local_parts` | `local.inspect_parts` | **0** | **网格体检**：静默调用 Blender 检视部件结构、面数体素分布、UV 岛展开率与蒙皮信息 |
| `tripo_render_model` | `local.render` | **0** | **离线高保真渲染**：生成无光照纯线框图 (Wireframe) 或 2× 超采样多视角 WebP 渲染图，返回精确相机变换矩阵 |
| `tripo_edit_parts` | `local.edit_parts` | **0** | **本地部件编辑**：在本地模型副本中执行部件合并、隐藏、删除或按面索引进行局部解构 |
| `tripo_bake_texture_projection`| `local.project_texture` | **0** | **贴图视口投影烘焙**：将 2D 参考图按相机视角反向投影并烘焙到模型 UV 纹理贴图上 |
| `tripo_paint_texture` | `local.paint` | **0** | **离线贴图绘制**：在本地贴图上根据 UV 坐标笔划进行色彩补丁绘制 |
| `tripo_crop_image` | `local.crop` | **0** | **本地像素裁切**：使用 Sharp/本地图形库无损裁切参考图，为建模提供纯净输入 |

---

## 本地 Blender 工具技术流

```mermaid
flowchart TD
    GLB[本地已下载 GLB 模型] --> INSPECT[tripo_inspect_local_parts<br/>流形健康度 · 面数分布 · UV 展开率]
    
    INSPECT --> RENDER[tripo_render_model<br/>渲染无光照线框图 / 2x 视口图<br/>(捕获相机矩阵与 FOV)]
    
    RENDER --> EDIT[tripo_edit_parts<br/>合并/删除/隐藏无用部件]
    
    RENDER -.-> CAM[获取相机矩阵]
    CAM --> BAKE[tripo_bake_texture_projection<br/>2D 参考图反向投影<br/>直接烘焙至 UV 贴图副本]
    
    BAKE --> RESULT[完全免费交付 本地无损资产]
```

---

## 功能细节与技术优势

### 1. 几何体素健康体检 (`tripo_inspect_local_parts`)
在将模型导入游戏引擎前，往往需要排查模型是否存在破面或非流形边：
- 统计所有分件的精确顶点数、面数（Triangles / Quads）。
- 评估各部件在 UV 空间中的像素填充利用率（UV Coverage Ratio）。
- 检测是否存在骨骼蒙皮权重（避免盲目修改导致蒙皮失效）。

### 2. 线框图与多重视口离线渲染 (`tripo_render_model`)
- 支持生成纯线框图（用于直观向用户展示模型的拓扑布线规范程度）。
- 支持输出带阴影或无光照平坦渲染（Albedo Flat）。
- 渲染后返回精确的摄像机内参（FOV、近裁切面、远裁切面）与摄像机外参矩阵（Camera Transformation Matrix），为后续的“贴图投影烘焙”提供数学基准。

### 3. 视口反向投影贴图烘焙 (`tripo_bake_texture_projection`)
当模型的某个局部（如衣服上的徽章、脸部的细节）在生成时不够清晰，用户可以使用一张 2D 高清微调图，直接通过投影烘焙映射到 3D 表面：
- 基于面的法线中心与视线夹角自动判断可视性（Visibility Occlusion）。
- 将 2D 像素无缝拼贴并烘焙回原始材质贴图的对应 UV 区域。
- 整个烘焙过程完全由本机 Blender 计算完成，无需消耗任何云端点数。

---

## 工程边界与运行要求

- **Blender 环境依赖**：本机需安装 Blender 3.6+ 或 4.x，默认支持常见安装路径（如 macOS `/Applications/Blender.app`、Windows 默认路径）。也可在环境变量或配置文件中自定义 `BLENDER_PATH`（详见 [docs/CONFIGURATION.md](../CONFIGURATION.md)）。
- **文件体积限制**：本地模型操作限制在自包含格式的单体 GLB（尺寸上限 150 MiB）。
- **蒙皮保护**：为保护骨骼动画完整性，`tripo_edit_parts` 会主动拒绝修改带有骨骼蒙皮（Armature Skinning）的部件网格拓扑。

---

## 典型对白范例 (Prompts)

### 场景 1：零成本检视模型拓扑与线框图
```text
调用本地 Blender 工具：
1. 先检查本地机械狐模型的面数分布与 UV 利用率；
2. 为它生成一张正面和一张 45 度侧面的无光照线框渲染图，展示给我看。
（注意：使用本地工具，不要消耗 Studio 积分）
```

### 场景 2：本地删除无用装饰部件
```text
这个角色头上的天线我不想要了：
调用 tripo_inspect_local_parts 找到天线对应的部件 ID，
然后用 tripo_edit_parts 在副本中把它删除，保存新的 GLB 文件。
```

### 场景 3：投影烘焙 2D 贴图
```text
我有一张清晰的公会勋章 2D 图。
请调用本地 Blender 投影管线：
先从正面视口对准胸甲部件，然后将勋章图投影烘焙到胸甲贴图上，输出烘焙后的贴图文件。
```
