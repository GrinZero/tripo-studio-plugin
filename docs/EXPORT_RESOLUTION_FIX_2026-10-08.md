# 0.2.1 导出纹理分辨率修复

## 问题与定位

同一已有上传模型 `edc12cd3-b3a4-401a-927d-abf3a4dc0fcd`、源 operator `7caffe75-d09a-4334-85b0-74862e9e38c4`：

- 插件请求 FBX 1K、2K，服务端均返回三张 4096×4096 JPEG。
- 实际浏览器点击官网“导出 → FBX → 1k → 导出”，下载 `head-body.fbx.zip`，三张图也全部为 4096×4096。官网展示“2k 当前”、禁用 4K，但源 GLB 实际包含三张 4K 图。
- 官网生产脚本 `CpndXtBA.js` 在降低分辨率、绑骨 FBX 等情形调用 `/v2/studio/operation/export`，字段为 `texture_size`；插件字段一致。不能依赖改字段或重新请求来修复这个实例。
- 上传模型的源 GLB 使用 `EXT_meshopt_compression`，包含一个实体 BIN 与一个虚拟 fallback buffer。检查贴图时必须保留这一结构，不能把所有多 buffer 模型误判成外部资源。

官网复现截图及原始导出保留在 `.local/verification/resolution/`。旧 0.2.0 失败证据仍保留。

## 修复

1. 导出 staging 下载并读取实际源 GLB 图像尺寸，记录真实最大边长、验证状态和图像数；使用实际尺寸校验目标，上传原件原本已有 4K 时不再因服务标记为 2K 而拒绝。
2. `tripo_download(task_id=导出任务)` 对冻结 export operator 获取文件，保存按 SHA-256 命名的原始服务导出；对超出目标的 PNG/JPEG/WebP 或 GLB 内嵌图像本地缩小，重新打包；保留比例、编码和 alpha，不放大较小图像。
3. ZIP 文件名、目录、FBX/OBJ/MTL 等非图像文件字节不变。GLB 仅追加新图像 buffer view，保留原有 geometry、skin、animation 和 meshopt 压缩字节及引用。
4. ZIP 时间戳固定，重复处理相同原包得到相同哈希；同一冻结 operator 的源 GLB 复用经过解析验证的本地缓存，避免每次 staging 重下。
5. 最终下载返回 `texture_resolution`，包含实际尺寸、`actual_texture_size_verified`、处理方式、源及输出 SHA-256；成功下载后写入任务结果。仅服务端导出成功仍显示未验证，不能把请求参数当作实际规格。
6. 输入包和经过处理的文件按哈希保留，缓存文件若被修改则拒绝覆盖。处理失败不返回一个伪称符合目标分辨率的文件。

示例：`tripo_export_model` 指定 `format:fbx, texture_size:2048, with_animation:true` → 提交/等待 → `tripo_download` 指定该 task_id → 核对 `texture_resolution`。直接按 project_id 下载的是当前原模型，不套用导出设置。

## 真实验证

通过构建后的 stdio MCP 0.2.1 调用 `tripo_task_wait`、`tripo_download` 和 `tripo_get_task`，然后用 Blender 5.1.2 后台重新导入三个包。

| 请求 | 实际三张图 | ZIP 大小 | Blender |
|---|---|---:|---|
| 1K | 全部 1024×1024 | 2,753,202 bytes | 3 网格、3 材质、1 骨架、65 骨骼、3 蒙皮网格，全部贴图引用存在 |
| 2K | 全部 2048×2048 | 4,424,401 bytes | 同上 |
| 4K | 全部 4096×4096 | 8,376,455 bytes | 同上 |

1K/2K 使用 `local_downsample`；4K `remote_verified`，原 ZIP 原样保留。每个 FBX 与该服务原始包内 FBX 逐字节相同；顶点 33180、面 65701 均一致。未选择动作，本次不宣称验证动作播放。会员积分未变化。

任务 ID：

- 1K `1d2575ac-a16c-4fc7-b9c5-098c9a573065`
- 2K `240a30ad-c8f2-4c85-9171-336ba2485a41`
- 4K `1a98d57e-4b63-49ea-b9f8-f817d4c01ddc`

证据：`.local/verification/resolution/verified-matrix.json`、`blender-verified.json`、`verified-{1024,2048,4096}.zip`，源导出与派生件位于用户配置 asset_root 下 `exports/<task_id>/`。签名 URL、会话凭据不进入报告。

## 验证边界

- 真实云端下载和 Blender 复检覆盖 ZIP FBX 1K/2K/4K。GLB 内嵌图像、meshopt fallback、ZIP 内 OBJ 引用/透明纹理保留、禁止放大、来源标记错误、危险压缩包与禁止覆盖由回归测试验证；不将其写成所有格式的云端实测。
- Embedded FBX 无可检查贴图、或 USDZ 需要降采样时显式拒绝，推荐 ZIP FBX/OBJ 或自包含 GLB。USDZ 原生匹配尺寸时原包不改动，避免破坏其对齐要求。STL 没有纹理，返回 `not_applicable`。
- 当前处理上限 512 MiB / 1024 ZIP entries；外部 GLB 图像和不支持的图像编码拒绝，不伪造验证成功。8K 实例尚未实际验证，不补采样冒充原生 8K。

## 测试与安装

- `npm test`：46 项通过、0 失败、0 skip；`npm audit --omit=dev`：0 vulnerabilities；构建成功。
- 已通过 `codex plugin add tripo-studio-plugin@tripo-studio-local --json` 安装 0.2.1；源码、构建包、依赖清单与 skill 的 7 项 SHA-256 和安装缓存一致。
- 直接启动安装缓存的新 MCP 进程，验证 53 工具、实际 `tripo_export_model` 4K staging 的源尺寸识别，并取消仅用于检查的未提交任务；实际 `tripo_download` 2K 再次通过，贴图和 FBX 内容与先前 2K 文件逐字节相同。记录为 `installed-schema.json`、`installed-final-matrix.json`、`installed-hashes.json`。
- 本对话原有 MCP 连接仍返回 15 操作，不能冒充已刷新；重新连接插件/新对话后加载安装版。已用独立新进程验证安装版可运行。
- 新增依赖 fflate 由构建包内联；本轮验证过程目录约 88 MiB，用户 asset_root 下源/派生导出约 47 MiB，源 GLB 检查缓存约 7 MiB；原件保留。
