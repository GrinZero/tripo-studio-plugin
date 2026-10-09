# Tripo Studio MCP 0.2.0 能力补齐与验证记录

日期：2026-10-08。检查和实现主体：主 Agent。源码位于 `/Users/bugyaluwang/project/tripo-studio-plugin`。

> 0.2.1 后续修复：导出分辨率问题已通过真实 MCP 1K/2K/4K FBX 下载与 Blender 重导入验证，见 [修复记录](EXPORT_RESOLUTION_FIX_2026-10-08.md)。下文保留 0.2.0 当时的验证结果。

本轮基于前一次实际浏览器点击审计，进一步核对生产工作台已加载的公开脚本，然后完成源码、工具 schema、任务生命周期、工作流、工作台示例、技能说明和构建包。操作从 15 增至 28，工具从 37 增至 53。已通过本地市场安装 0.2.0；本对话原有 MCP 进程的 schema 仍需重新连接。

## 补齐范围

| 审计缺口 | 当前实现 | 验证边界 |
|---|---|---|
| 模型生成及纹理重生成缺少去光 | 两个操作独立发送 `delight`，默认 true，与 PBR 分开；模型纹理关闭时不接受去光参数 | 生产契约与 payload 测试；未提交收费生成 |
| Smart Mesh 固定 P1 | P2 `Nexus-v2.0-20260801`、默认 quad、500–25000 面、1/2/4 variants、逐结果预算与 P2 symmetry 检查；保留 P1 及旧限制 | wire / 多结果身份测试；未付费生成 |
| 智能 UV 缺失 | context 查询、真实 GLB 面数和分件资格检查、候选生成/重试、GLB 与 UV layout 下载、独立 apply、冻结当前 operator 的过期检查 | 真实 context 查询通过；生成/应用生命周期与候选身份测试；没有收费展开或覆盖已有 UV |
| UV 利用率 | 本地 GLB 检查按每个部件计算 256×256、[0,1] UV tile 的栅格并集占用率，标注 estimated；下载候选后可检查 | 真实 Blender fixture 验证整 tile 占用率为 1；不声称与网页精确算法一致 |
| 骨骼预设与 V3 | `v3.0-20260909`，人形/其他，ActorCore/Mixamo/Unreal/VRM/Unity 对应 `spec`；预检拒绝不支持类型，不将 V3 强制降为旧 V1 | 生产契约与 Mixamo payload 测试；没有收费重绑 |
| 可配置导出 | owned project 的 GLB/FBX/OBJ/USDZ/STL/3MF；骨架、动画、UV 打包、Blender/Mixamo/3dsmax、512/1K/2K/4K/8K 目标、纹理包装、原地动画、帧烘焙、OBJ 顶点色 | 已有模型真实 FBX 导出/下载/重新导入通过；其他格式为契约覆盖。2K 请求返回 4K，见下文 |
| AI 动作 / 多阶段 | 1–5 段、每段 1–10 秒、提示词、可选连续 [x,z] 路径，任务/资产/列表查询、motion_asset_id 重定向、精确匹配下载产物 | 真实列表读取通过（当前无资产）；生命周期、路径连续和产物匹配测试；未付费生成/重定向 |
| 最多 30 张图片输入 | `mode:batch` 的独立图片批量建模，独立 operator/project，最多 120 个输出，进度按 20 个 ID 分块 | 这是独立建模，不是 30 图融合；多结果/分块测试；未收费批量提交 |
| GPT Image 2.5 | 实际枚举 `gpt_image_2.5_sunburst` | 已核对生产枚举；没有生成测试；通用 midjourney 不承诺锁定 v8.2 |
| 已有图片编辑/放大/裁切 | 已有 asset/output 直接作为引用；来源记录在 metadata；专用 upscale、split；本地显式矩形裁切 | split 对应自动主体切出，不是矩形 crop；保留插件创建链及 Studio input，可查询已有 assets；不承诺外部网页编辑的完整修订树 |
| 手绘、视口及烘焙缺失 | 本地 UV 笔划绘制；后台 Blender 2× WebP 视口 + Three.js Y-up 相机矩阵；编辑图投影、遮挡判断及按部件 base-color UV 烘焙，可交给既有 apply texture 操作 | 原件保留；真实渲染/绘制/裁切/烘焙通过。遮挡按面中心判断，复杂材质和大三角形需复查；不是网页客户端渲染器的逐像素复刻 |
| 手动部件操作缺失 | 本地 GLB 副本的 merge/hide/delete/split；分面索引、UV/蒙皮检查；重新 import 可形成新 Studio 版本 | 真实 Blender 合并、单面分离、隐藏导出和删除通过；保留原 GLB。蒙皮部件的结构编辑拒绝，不伪造未知云端接口 |

## 契约依据

通过已登录浏览器实际访问并点击 [生产工作台](https://studio.tripo3d.ai/zh/workspace/generate)，再用浏览器开发接口读取已经加载的公开脚本。未打印 cookies、授权头或签名链接。选定文件的原始 URL、字节数和 SHA-256 记录于 [来源清单](STUDIO_CONTRACT_SOURCES_2026-10-08.json)。公开脚本全文只保存在被忽略的 `.local/contracts/`。

主要契约：

- P2 / delight / batch：生产 model-generation bundle。
- UV：`/v2/studio/operation/uv_edit/context`、`generate`、`apply`，候选生成与替换当前模型是不同动作。
- Rig V3 / AI motion：生产 animation bundle；`/v2/studio/motion/generate`、`get_task`、`get_asset`、`list_assets`，生成后用既有 `retarget_model`。
- Export：`/v2/studio/operation/export`、`download_with_name`；生产枚举 GLB 的 wire 值为 `gltf`，USD 为 `usdz`。
- Image transform：`/v2/studio/image/upscale`、`split`，引用被选输出的 `resource_key`。
- 本地 Blender 导出参数核对 [Blender 5.1 官方 API](https://docs.blender.org/api/5.1/bpy.ops.export_scene.html#bpy.ops.export_scene.gltf)，实测使用 `use_visible`。

这些是生产客户端契约证据，不等于服务承诺长期兼容，也不等于收费链路已经实跑。

## 实际验证

### 真实账户的无扣费验证

复用已有插件会话。模型详情、AI motion 列表和 Smart UV context 返回有效结果。对已有 `head-body.fbx` 项目提交一次 owned-model FBX 导出（不是公共模型收费导出）：

- 插件 task：`6046da47-c124-460b-8784-30c8d2382125`
- Studio operator：`bae076ba-1035-4896-9736-88191230b514`
- Project：`edc12cd3-b3a4-401a-927d-abf3a4dc0fcd`
- 格式 FBX，Blender preset，导出骨架，未选择动作，requested texture size 2048。
- 异步成功，下载 ZIP 8,376,535 bytes。提交前后的账户 payment summary 一致。
- Blender 5.1.2 重新导入：3 个网格、1 个 armature、65 根骨骼、3 张贴图、0 个动作（此次没有选择动作）。
- **返回的三张贴图均为 4096×4096，和请求的 2048 不一致。** 再次核对生产枚举和 payload，确为 `texture_size:2048`；尚未确定服务缩放/导出缓存行为。插件结果区分 requested size 与 actual size verification，不用提交值充当产物规格，也没有对原件执行本地降采样。

证据在 `.local/verification/live-export-check.json`、`export-import-check.json`、`owned-model-export.zip` 和 `export-unpacked/`。没有新增付费模型、UV、绑定、动作或图片生成。

### 真实本地处理与可视检查

使用两个相互遮挡、具有独立 UV 的真实 GLB 网格 fixture，执行实际 Blender：

- 查部件和 UV 利用率，渲染 128×128，返回 16 元相机矩阵。
- 合并成一个 4 三角面网格；只分离指定的 1 面；隐藏结果重新导入仅保留可见部分；删除部件保留另一部分。
- 投影蓝色编辑图：正面变蓝，被遮挡背面保持绿色；原输入 GLB 字节不变。
- 保存并实际查看 `local-viewport.png`、`projected-Front.png`、`projected-Back.png`。

浏览器中通过临时、仅监听 127.0.0.1 的验证 bridge 调用真实 MCP 进程，未登录且不上传：选择本地裁切 → 点击 Prepare → Execute → sync → download；任务 succeeded 且保存到验证输出目录。已检查免费/付费标识，修复结构化工具错误被 UI 忽略的问题。截图：

![本地任务执行与保存](../.local/verification/workbench-local-task.png)

这是浏览器 UI + 真实 MCP 的集成验证；Codex 原生 MCP-UI 的宿主绑定未独立验证。

### 自动回归与发布

- `npm run build` 成功；bootstrap 使用 dist。
- `npm test`：39 项通过、0 失败、0 skip。包括真实 Blender 和 bundled stdio MCP 握手（版本 0.2.0、53 工具、28 操作）。
- 核对多输出 project/operator 身份、导入 snake_case 字段、120 ID 分块、明确/未知失败、快照哈希、过期导出、UV 候选归属、动作产物精确匹配、签名 URL 不泄漏、本地拷贝根约束与禁止覆盖。
- `codex plugin add tripo-studio-plugin@tripo-studio-local --json` 安装到 `/Users/bugyaluwang/.codex/plugins/cache/tripo-studio-local/tripo-studio-plugin/0.2.0`。已比对源码与缓存的 7 个关键文件 SHA-256；直接启动安装缓存再次验证 53 工具 / 28 操作，并成功执行后台 Blender 检查。结果见 `.local/verification/installed-release-check.json`。

## 保留与新增空间

原源码备份为 `local-archive/pre-capability-update-2026-10-08.tar.gz`，未删除原件。所有归档内文件已在忽略目录试恢复并复核内容 SHA-256，见 `.local/verification/backup-restore-check.json`。新增本地依赖 sharp；过程资料约 25 MiB、源备份约 108 KiB、node_modules 总量约 83 MiB（含原有依赖）、构建包约 256 KiB。本地插件安装器会复制项目根目录到版本缓存；当前缓存还包含过程资料和归档，后续发布应从精简分发目录安装。归档、公开脚本、原始日志与导出验证产物由 `.gitignore` 排除。当前目录没有 Git 仓库，本轮没有 commit 或 PR。

## 未计为完成的外部能力

- 新增付费能力未做收费 E2E 和资产美术验收。
- 投影是本地等效流程，面中心可见性与复杂材质处理有明确边界，不能声称像素级等同于 Studio。
- Studio 精确 UV 利用率与网页外部编辑完整历史没有已核实的独立服务接口；提供本地估算与插件来源链。
- 视频生成动作在实查页面 disabled，实时网格编辑写即将上线；没有新增虚假能力。
- DCC Bridge、账户/团队/分享和公共模型收费导出不属于本轮资产制作审计范围。
