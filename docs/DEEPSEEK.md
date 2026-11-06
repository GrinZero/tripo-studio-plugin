# DeepSeek Harness Web / Desktop

`tripo-studio-deepseek` 是独立的 DeepSeek 适配包，复用 Tripo Studio 插件的账号、资产、任务和本地 Blender 能力。Codex 安装方式不变。

当前为 `0.1.0-preview.1`，固定对应共享运行时 `0.3.14` 和 DSH `0.2.2-rc.1`。源码包含实现不等于 npm 已发布；不要在发布完成前使用尚不存在的 npm 版本安装命令。

## 从源码接入

需要 Node.js ≥24.9、仓库固定版本的 pnpm，以及官方 DSH `0.2.2-rc.1`。使用已经安装的 DSH CLI；本仓库不替换宿主版本。

```bash
git clone https://github.com/GrinZero/tripo-studio-plugin.git
cd tripo-studio-plugin
pnpm install --frozen-lockfile
pnpm run build
dsh plugin --profile web add "link:$PWD/packages/deepseek-adapter"
```

最后一条命令以链接方式使用已经安装好依赖并构建的源码包，适用于本地开发。Desktop 使用它自己的 profile；在对应安装的 `dsh` CLI 中将 `web` 改为 `desktop`。需要重启时按 DSH 的提示操作。不要再为同一实例手动添加一份 Tripo MCP 服务。

维护者发布运行时和适配包后，用户可通过对应 profile 的 Plugins 页面安装确切版本 `tripo-studio-deepseek@0.1.0-preview.1`，或通过 `dsh plugin --profile <profile> add <package@version>` 安装。`engines.dsh` 会限制未经验证的宿主版本；不要通过版本豁免绕过检查。

## 使用

在一个已打开的会话中等待 Tripo 界面完成初始化，然后发送：

1. “检查 Tripo Studio 登录状态，需要的话帮我登录。”
2. “打开 Tripo 工作台。”
3. 输入你的建模需求，或在工作台的创建页面选择参数。

模型工具名称为 `mcp__tripo-studio__tripo_*`。App 专用工具不会注册给模型。`tripo-studio` 技能随插件启用和撤回。

生成配置卡创建后，**服务端立即开始 60 秒自动提交倒计时**。修改参数暂停计时，保存校验并重新报价后立即提交；取消终止该配置。折叠卡片、切换会话或关闭工作台不取消已创建的任务。任务状态和截止时间由服务端持久化，重新打开历史卡片不会再次生成。

完整工作台在右侧标签页打开，可使用 DeepSeek 的侧栏全屏按钮。模型结果和配置卡直接在工具调用中显示。主题与语言跟随宿主；工作台内也保留原有语言选择。

## 数据与故障处理

- 登录会话、任务、资产目录与 Codex 共用；默认目录和环境变量见 [配置说明](CONFIGURATION.md)。浏览器会话与 Blender 必须在运行 Harness 的同一台机器上。
- 界面展示记录另存于数据目录的 `deepseek-presentations`，按会话和调用恢复。安装、更新和停用插件不删除用户资产。
- `UI_UNAVAILABLE`：新配置未创建。打开对应会话、启用客户端插件或使用卡片中的 Reconnect Tripo 重连。不要改用直接提交绕过界面。
- `VIEW_EXPIRED`：该界面的就绪租约已过期；重连视图。既有任务不因此取消或重新计时。
- `RUNTIME_INCOMPATIBLE`：适配包与共享运行时不匹配；重新安装固定依赖并构建。
- 子进程断线会撤回工具并有限重连；连续失败后重新启用插件。`outcome_unknown` 任务须先对账，不能自动重发。
- Blender 缺失只影响相应本地工具；纯云端工作流不依赖 Blender。Windows Chromium 的 app-bound cookie 限制沿用现有支持边界。

## 验证和发布状态

实现及自动化验证以 DSH `0.2.2-rc.1` 为基线。单元、共享核心、真实 stdio 桥接、实际 npm 包与 Harness Web 的验证结果应分别记录；原生 Desktop、真实云端积分消费及 Blender 实测不能由这些检查推断。

2026-11-06 验证记录（Linux，Node.js 24.22.1）：

| 检查                                  | 结果                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 完整测试套件                          | 222 项通过，2 项依赖外部环境的实测跳过，0 失败                                                                         |
| 构建、lint、格式、分发一致性          | 通过                                                                                                                   |
| Codex npm 包                          | 全新 npx 启动、离线缓存启动、68 工具、MCP Apps、WASM 图片处理通过                                                      |
| DeepSeek npm 包                       | 隔离安装、关闭生命周期脚本、资源读取、62 模型工具注册与卸载通过                                                        |
| 真实 Harness Web                      | 62 工具视图、工作台、配置卡编辑/保存/取消、未挂载卡片的真实 60 秒提交、本地结果下载、GLB 拖动旋转、主题/语言及窄屏通过 |
| Desktop 通信路径                      | 已验证 Desktop 风格 Fetch carrier；尚未完成原生 Desktop 应用实测                                                       |
| 云端付费生成、真实浏览器账号、Blender | 本次未执行，不消耗云端积分                                                                                             |

构建的适配包和运行时仍未发布到 npm。打包测试通过后分别保存在 `artifacts/tripo-studio-deepseek-0.1.0-preview.1.tgz` 与 `artifacts/tripo-studio-plugin-0.3.14.tgz`，供维护者审阅与后续发布。

维护命令：

```bash
pnpm run build
pnpm run check
pnpm test
pnpm run test:package
pnpm run test:deepseek:package
pnpm --filter tripo-studio-deepseek exec playwright install chromium
pnpm run test:deepseek:web
```

Web 验证启动临时的真实 DSH profile，并用测试专用界面挂载生产 `AppSurface`；不需要模型 API key。它检查已认证路由、工具视图注册、工作台、配置卡编辑/保存/取消、真实 60 秒后台本地任务及下载。测试不消耗云端积分。可通过 `TRIPO_CHROMIUM_EXECUTABLE` 指定已安装的 Chromium；`TRIPO_WEB_SCREENSHOT` 可保存最终界面截图。它不替代真实模型提供方驱动的对话或原生 Desktop 验证。

适配包不需要安装脚本，也不自建 HTTP 监听端口。发布共享运行时之后再发布适配包。本次改动不自动发布 npm 包或执行付费测试。
