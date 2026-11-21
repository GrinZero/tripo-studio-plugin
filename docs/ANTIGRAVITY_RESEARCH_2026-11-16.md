# Antigravity / agy 支持调查

调查日期：2026-11-16（Asia/Taipei）。仓库版本：0.3.14；本机 Antigravity CLI：1.5.8。

## 建议

值得支持。优先做 Antigravity 原生插件，复用现有 stdio MCP、任务存储和标准 MCP Apps 工作台。已有官方插件分发机制和 MCP Apps 能力，技术切入点明确。新增宿主入口、配置与技能适配即可开始验证，无须先重写后端或另建 Webview 框架。

这是技术可行性判断；本次没有用户规模、安装转化或需求量数据，不能据此判断商业优先级。工作台尚未在 Antigravity 中实际加载，不能宣称完整支持已经完成。

## 官方依据

- `agy` 是 Antigravity CLI 的启动命令。[Get started](https://antigravity.google/docs/getting-started)
- 原生插件可将清单放在 `.antigravity-plugin/plugin.json`，配套根目录 `mcp_config.json` 与 `skills/`；支持 `${PLUGIN_ROOT}` 和 `${PLUGIN_DATA}`。适合与 Codex 清单并存。[Build plugins](https://antigravity.google/docs/build-plugins)
- 插件可从本地目录或 GitHub 安装；Marketplace 提交是后续分发路径。[Plugins](https://antigravity.google/docs/plugins)
- MCP 支持本地 stdio；配置使用 `timeoutSeconds`，需要针对长工具调用设置。[MCP](https://antigravity.google/docs/mcp)
- 官方博客明确提及 MCP Apps；更新记录也确认插件侧栏 UI 能力。[Knowledge Work 博客](https://antigravity.google/blog/antigravity-for-knowledge-work)、[Changelog](https://antigravity.google/docs/changelog)

此外，本机官方 `agy` 1.5.8 可执行文件内嵌 `mcp-app-development` 技能，明确描述标准 MCP Apps 的协议、入口和限制。以下宿主细节来自该本地一手材料，不等于已经运行过我们的 UI，也不保证其他版本完全一致。

## 已执行的本地验证

| 检查                                                     | 结果                                                           | 能证明什么                                        |
| -------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| `agy --version`、插件与 MCP 帮助                         | 1.5.8；存在 install、validate、MCP 管理命令                    | 本机有可用于后续验收的 CLI                        |
| `agy plugin validate . --json`                           | 失败：找不到 Antigravity 插件清单                              | 当前仓库不能直接当作 AGY 原生插件安装             |
| 临时目录放置 AGY 清单、MCP 配置和现有技能                | 发现 1 个 MCP server、1 个 skill；严格模式失败                 | 技能正文 28,587 字节，宿主只加载前 24,000 字节    |
| 临时目录改用短技能入口，完整正文移到 reference           | `validate --strict --json` 退出码 0                            | 打包结构可行；不验证 reference 的语义或服务器启动 |
| SDK 客户端连接现有打包版服务器，客户端无 UI capabilities | 初始化、工具列表、资源读取成功；操作目录及未登录状态查询无错误 | 标准 stdio MCP 基础可用；不是 AGY 宿主集成测试    |

协议检查返回 68 个工具，其中 62 个对模型可见，6 个仅供 App：`tripo_ui_preview`、`tripo_ui_import_image`、`tripo_ui_asset_library`、`tripo_ui_review`、`tripo_submit_task`、`tripo_run_workflow`。

两个 HTML 资源均使用 `text/html;profile=mcp-app`。检查时工作台为 2,341,740 字节，结果卡片为 2,249,748 字节，低于内置指南记载的单 HTML 10 MiB 限制。构建后大小可能变化。

临时目录均已删除。没有安装插件、修改 AGY 配置、读取真实 Tripo 登录数据或创建付费任务。协议检查使用临时数据与资产目录。本次仓库交付为调查文档及按 AGENTS.md 重建的分发产物。

## 与现有代码的对应关系

| 部分       | 现状                                                                            | 建议改动                                                            |
| ---------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 启动与后端 | `mcp/bootstrap.mjs` 启动已打包的 stdio server；`src/runtime.mjs` 构建公共运行时 | 保留公共后端，新增 AGY 启动配置                                     |
| 插件发现   | `.codex-plugin/plugin.json` 与 `.mcp.json` 属于现有 Codex 接入                  | 新增 `.antigravity-plugin/plugin.json`、`mcp_config.json`           |
| 工作台入口 | `src/server.mjs` 已发布标准 UI resource，但侧栏入口元数据为 `openai/ui`         | 增加 AGY 入口元数据；两种宿主分别验收                               |
| UI 协议    | `ui/workbench.mjs`、`ui/result-card.mjs` 已使用标准 `App`                       | 先复用；核查 OpenAI 扩展协商、布局和上下文能力                      |
| 技能       | 现有正文超出 AGY 加载限制，且存在 Codex 专用表述                                | 短入口保留必要流程，详细操作拆入 references；核对相对路径与发布文件 |
| 本地数据   | `src/config.mjs` 默认数据在插件安装目录之外                                     | 优先沿用已有账号与资产目录；不要盲目切换到 AGY 专属目录             |
| 发布       | npm files 白名单、版本同步和分发检查覆盖现有产物                                | 新增清单/config 时同步打包白名单、version 生命周期和验证            |

内置指南给出的 AGY 入口元数据可以与标准 `_meta.ui` 一起使用：

```js
_meta: {
  ui: { resourceUri: WORKBENCH_RESOURCE_URI },
  "com.google.antigravity/ui": {
    entrypoints: [
      { type: "aux_pane", title: "Tripo Studio" },
      { type: "global", title: "Tripo Studio" },
    ],
  },
}
```

本机内置材料的只读复核方法：对 `~/.local/bin/agy` 读取二进制字节，定位 UTF-8 字符串 `name: mcp-app-development`，检查紧随其后的技能文本。本次找到该文本的字节偏移为 66,100,678；升级后偏移和内容都可能改变。它是内嵌说明材料，不是实际 UI 执行证据。

## 最需要验证的交互边界

1. **App-only 隔离。** 六个内部工具必须由 App 调用，不应因接入 AGY 而全部暴露给模型。
2. **全局与会话入口。** 内置指南描述全局视图缺少会话消息和上下文更新能力；按能力处理。入口会用空参数调用，现有可选参数/default view 方向吻合。
3. **资源与布局。** 核查 CSP、blob/data、WebGL、模型加载、侧栏尺寸；内置指南描述单 App 最多四个并发工具调用，工具轨迹结果超过 1 MiB 时 UI 可能只收到输入。
4. **生命周期。** 不依赖 iframe 存储或关闭时 teardown 保存业务状态；继续以服务器持久任务为准。需验证关闭页面、重启和重新进入后的恢复。
5. **配置卡片。** `src/ui/reviews.mjs` 的 60 秒自动提交由服务端计时，卡片未显示也会继续。不能将“未看到卡片”当作不会提交的保证；在 UI 能力未验收前，PoC 只做查询和无付费操作。若发布只支持工具调用的受限模式，应明确禁用或拦截尚未支持的创建流程。
6. **宿主扩展。** `ui/host-capabilities.mjs` 当前仅对 DeepSeek 跳过 OpenAI 扩展。需实测 AGY 下的协商与降级，不能仅凭依赖存在就认定会失败，也不能直接假设无须适配。

## 推荐实施顺序与投入

1. 原生清单、MCP 配置、短技能、版本同步及打包检查；用 AGY loader 验证组件发现。
2. 在 Antigravity App 中验证工作台与结果卡、只读资产浏览、GLB 预览、App-only 回调和全局/会话入口。CLI 工具可用与 App 图形界面可用分别记录。
3. 验证授权范围内的配置编辑、取消、持久任务恢复，再验证真实生成、下载与 Blender 交付。
4. 发布明确宿主版本和验证范围的预览支持，再考虑 Marketplace 提交。

工程估计：基础清单/技能/打包约 0.5–1 天；首轮 UI 适配与回归约 1–3 天。按 2–4 个工作日规划预览版本较合理，但这是代码与协议调查后的估算，未含未知宿主缺陷、跨平台环境和 Marketplace 审核时间。

首个完成标准应是“原生安装后，查询与工作台交互可用且持久状态正确”，随后补齐真实生成验收。现阶段证据足以启动这项工作，还不足以直接在 README 中宣布完整兼容。
