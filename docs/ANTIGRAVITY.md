# Antigravity / agy 预览接入

原生插件复用 Tripo Studio 的 MCP 后端、技能、账号、任务和 MCP Apps 工作台。需要 Node.js ≥ 22，开发时使用仓库固定版本的 pnpm。本地 Blender 操作另需 Blender。工作台和配置卡需要当前 Antigravity App 连接启用 MCP Apps。agy 1.5.8 和 Antigravity App 2.32.1 的初次测试结果见下方验证记录。

## 从源码安装

```bash
git clone https://github.com/GrinZero/tripo-studio-plugin.git
cd tripo-studio-plugin
pnpm install --frozen-lockfile
pnpm run build
agy plugin validate . --json
agy plugin install .
agy plugin list --json
```

安装后在 Antigravity App 打开 **Tripo Studio** 侧栏入口或会话侧面板的应用入口。也可以要求 Agent “打开 Tripo 工作台”。首次使用先检查登录状态，需要时通过 `tripo_auth_login` 登录。不要再手动添加第二份 Tripo MCP 服务。

工作台需要宿主已开放 MCP Apps，只有版本号并不足以保证该能力。`UI_UNAVAILABLE` 表示当前连接未声明 UI 能力；此时查询和报价可用，创建工具不会建立配置或启动倒计时。使用已开放 MCP Apps 的 App 连接后再创建任务。

尚未发布的变更需要从包含这些文件的源码目录安装；本说明不代表 npm 或 Marketplace 已发布新版本。已有源码安装更新后，重启 Tripo MCP 服务以载入新构建，再重新打开工作台。

## 宿主与数据

- `plugin.json` 是原生清单；根目录 `mcp_config.json` 直接用 Node 启动随包携带的构建，不需要安装运行时依赖或执行 npm 生命周期。
- 使用根目录清单兼容本机 App 2.32.1；CLI 支持的 `.antigravity-plugin/plugin.json` 在该 App 的扩展加载路径中产生缺失根目录清单的错误，因此没有采用它。
- AGY 为插件内服务器添加命名空间。查看已注册工具和参数，使用实际名称；技能中的 `tripo_*` 表示原始工具名。
- 默认保留宿主的 lazy tool discovery，不把全部 68 个 schema 强制加载。6 个 App 专用工具继续对模型隐藏。
- CLI 可查询账号、操作目录、资产和任务；配置编辑与 3D 预览使用已开放 MCP Apps 的 Antigravity App。没有 UI 能力的连接会在创建配置前返回 `UI_UNAVAILABLE`；只想询价时使用 `tripo_quote_operation`。
- 默认共用 Codex 已有的 Tripo 登录、任务及资产目录。`${PLUGIN_DATA}` 不会覆盖公共数据目录；环境变量和 Blender 路径见 [配置说明](CONFIGURATION.md)。安装路径可只读，持久数据不写入插件目录。
- 全局工作台不依赖会话上下文更新能力。主题和语言跟随宿主，也可在工作台选择。预览批量请求在每个视图内排队，最多同时调用四个工具。

## 提交与恢复

创建/编辑工具建立配置卡后，服务端立即开始 **60 秒自动提交倒计时**。卡片折叠、关闭或后台会话不会取消任务。修改参数暂停倒计时；保存校验、重新报价后立即提交；取消终止配置。调用前确认操作、参数、数量与积分花费已在用户授权范围内。

Agent 使用 `tripo_get_configuration_review`、相同 `review_id` 和 `wait_ms:60000` 读取最新状态，再等待最终 `task_id`。重开已有卡片不重新生成。`outcome_unknown` 需要核对实际远端结果，不能自动重发。

## 验证范围

2026-11-16，macOS / Node.js 24.14.0 / agy 1.5.8 / Antigravity App 2.32.1：

| 检查                          | 结果                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 原生 CLI loader 与安装        | 发现一个技能和一个 MCP server，安装后启用成功                                                                              |
| 原生 App                      | 插件详情页可见；MCP 服务就绪；MCP Apps 启动接口返回 `failed_precondition: MCP Apps support is not enabled`，未绕过宿主限制 |
| 无 UI 能力连接                | 62 个模型工具；隐藏六个内部工具并拒绝直接调用；创建返回 `UI_UNAVAILABLE`，没有新任务；查询和报价正常                       |
| 声明标准 UI 能力的 MCP 客户端 | 68 个工具、两个 UI 资源、空参数工作台入口、本地配置取消及重启恢复通过                                                      |
| 标准 MCP Apps 浏览器测试宿主  | 独立 opaque-origin sandbox、全局视图、GLB 加载、配置编辑和取消通过；无会话能力亦可使用                                     |
| 发布包                        | 全新 npx、离线缓存、AGY 配置直接 Node 启动及本地 WASM 图片处理通过                                                         |

浏览器测试使用本地模拟资产及操作，不消耗云端积分。上表记录初次测试时的宿主能力。当时的原生 App 验证到 MCP 服务就绪为止。真实账号登录、付费云端生成和跨平台界面未纳入该轮验证。

验证命令：

```bash
pnpm run build
pnpm run check:distribution
pnpm run check
pnpm test
pnpm run test:package
agy plugin validate . --json
```

多宿主源码目录的 `.mcp.json` 被 AGY 忽略可能产生提示；AGY 使用 `mcp_config.json`。发布包需包含原生清单、MCP 配置、技能参考文件与构建资源。维护者发布新版本时使用 `pnpm version` 的既有同步流程。

浏览器回归使用 `test/browser/i18n-server.mjs` 和 `test/browser/check-antigravity.py`，需要 Python Playwright 与 Chromium。测试宿主会声明标准 UI 能力，原生 App 的能力取决于安装环境中的连接。
