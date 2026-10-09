# README 截图来源

主 README 的 9 张图片均为 **2026-10-09 本次重新截取**，没有复用此前验收截图。使用 Playwright 在可见 Chromium 浏览器中直接拍摄当前 **0.3.3** 的真实工作台与结果卡片：整页截图或原生元素截图，未经重绘、拼接、替换文字或像素编辑。

## 拍摄内容

时间使用 Asia/Taipei（UTC+8）。

| 图片 | 原始尺寸 | 截取时间 | 内容 |
| --- | --- | --- | --- |
| [workbench-create-dark.png](workbench-create-dark.png) | 1440 × 1250 | 21:59:25 | 深色文字建模表单、H3.1 与实时报价 |
| [workbench-create-light.png](workbench-create-light.png) | 1440 × 1250 | 21:49:18 | 浅色文字建模表单、角色归属与实时报价 |
| [asset-groups.png](asset-groups.png) | 1440 × 960 | 21:46:27 | 真实 Studio 模型的临时本地分组 |
| [asset-multiselect.png](asset-multiselect.png) | 1440 × 960 | 21:44:18 | 真实 Studio 角色模型的直接多选与分组操作栏 |
| [configuration-dark.png](configuration-dark.png) | 900 × 970 | 21:46:52 | 已有 Studio 图片的深色配置卡片，自动提交已暂停 |
| [configuration-light.png](configuration-light.png) | 900 × 970 | 21:47:18 | 同一份真实配置的浅色卡片，自动提交已暂停 |
| [model-preview-download.png](model-preview-download.png) | 1280 × 616 | 21:55:28 | 本次下载的 GLB、实际 3D 预览与 Blender 解码副本 |
| [model-detail.png](model-detail.png) | 1280 × 1000 | 21:56:12 | 真实 GLB 模型详情、面数、部件与重拓扑报价 |
| [workbench-japanese-narrow.png](workbench-japanese-narrow.png) | 420 × 1100 | 21:45:51 | 420 像素宽度的日语文字建模界面 |

## 数据与运行方式

- 使用项目本次构建的 MCP Apps 资源，通过官方 SDK 的 AppBridge 接入浏览器宿主；工作台和结果卡片使用当前项目代码。预览使用当前服务端媒体模块读取实际图片或 GLB。
- 资产来自已登录账号的真实 Studio 目录，报价来自实际报价接口；没有模拟资产目录、图片、模型或积分报价。文字建模页中的「机械狐」是本次实际输入的表单内容，未生成该模型。
- 拍摄使用临时本地数据目录。分组通过真实分组工具创建，原有分组数据未改写；完成后的真实任务记录仅复制读取。
- 配置卡片以已有 Studio 图片准备真实草稿，立即进入编辑以暂停自动提交；拍摄宿主拒绝确认、保存或执行云端付费操作。完成后取消拍摄草稿并清理临时目录。
- 下载卡片对应本次实际下载的岩石模型，包含源 GLB 与真实解码副本。截图中的临时保存路径是拍摄当时的实际路径。

本次截图证明浏览器宿主中的实际界面与读取结果；原生 Codex 宿主验证和各项付费生成的端到端验证另行记录。

原始截图保存在本地 `output/playwright/readme-capture/`。分发图片与原始截图逐字节一致，每张图片的源路径、拍摄时间、尺寸和 SHA-256 见 [capture-manifest.json](capture-manifest.json)。
