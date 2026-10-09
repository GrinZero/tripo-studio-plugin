# 开发与贡献

[返回 README](README.md) · [配置说明](docs/CONFIGURATION.md) · [工具清单](TOOL_INVENTORY.md)

## 本地开发

使用 Node.js ≥ 22，在仓库根目录执行：

```bash
npm ci
npm run build
npm test
```

`mcp/bootstrap.mjs` 优先加载 `dist/server.mjs`，没有构建产物时回退到源码。修改源码后重新构建，再重新加载宿主的 MCP 连接；界面也需重新打开。

开发时可直接启动源码服务：

```bash
npm run serve:src
```

它是 stdio MCP 服务，需要由 MCP 客户端连接。工作台与结果卡片仍加载 `dist/` 中的界面脚本，修改 `ui/` 后也要执行构建。

调试未发布的修改时，单独注册源码仓库中的 MCP 服务：

```bash
codex mcp add tripo-studio-dev -- node "$(pwd)/mcp/bootstrap.mjs"
```

调试结束后执行 `codex mcp remove tripo-studio-dev`，避免与正式插件重复提供同名工具。正式插件的 `.mcp.json` 使用固定版本的 npm 运行时，不会加载工作区里的未发布代码。

## 测试与文档核对

测试覆盖操作契约、任务恢复、来源快照、多输出身份、报价、资产分组、界面及真实 stdio MCP 握手。Blender 集成测试在安装 Blender 时运行，否则明确跳过；路径可通过 `TRIPO_BLENDER_EXECUTABLE` 指定。

新增或修改操作时，核对共享注册表、工具映射与工作台配置。文档中的参数和工具数量应依据当前 `tools/list`、`tripo_list_operations` 与源码，而不是旧版验证记录。README 的图片来源见[截图记录](docs/images/README.md)，历史验证数字须保留对应版本与日期。

## 分发

仓库中的 `.agents/plugins/marketplace.json` 指向固定版本的 npm 插件包。`package.json` 使用发布文件白名单，`npm pack` 自动构建服务器和界面。JavaScript 依赖全部打进服务器文件；图片处理使用 ImageMagick WASM，构建时将固定版本的 WASM 复制到 `dist/magick.wasm`，没有外部运行时依赖或平台原生二进制。正式插件使用 npx 启动同版本运行时，不需要安装时构建脚本。

提交发布前执行：

```bash
npm run check:distribution
npm run test:package
```

发布包验收从仓库外的临时目录、空 npm 缓存启动真实 npx，验证 MCP 握手、67 个工具、工作台与结果卡片、图片导入和裁剪，再验证缓存可离线启动。CI 在 Linux、macOS、Windows 的 Node 22 和 Linux Node 24 上运行发布包验收。

GitHub Release 发布后，Action 先完成验证，再将已经验收的同一份 tarball 发布到 npm。首次 npm 配置、版本同步与发布步骤见[分发说明](docs/DISTRIBUTION.md)。安装入口见 [README](README.md#安装与快速上手-quick-start)。

## 架构与产品文档

- [核心架构](CORE.md)：会话复用、stdio 服务、共享注册表与持久任务设计。
- [产品规格](PRODUCT_SPEC.md)与[工具体验](docs/TOOL_EXPERIENCE.md)。
- [工作台实现](docs/WORKBENCH_0_3_0.md)与[工作台设计](docs/WORKBENCH_DESIGN_2026-10-09.md)。
- [Agent 使用指南](skills/tripo-studio/SKILL.md)：操作选择、任务与来源规则。

## 验证记录

以下是按版本和日期保存的证据。已核对契约与自动化测试的能力，不等于每种付费操作都完成了真实计费端到端验证。

实际验证记录包括浏览器会话复用、资产读取、早期图片生成与下载、自有模型 FBX 导出及 Blender 重新导入、1K／2K／4K 导出贴图检查，以及本地 Blender 编辑与烘焙。

界面记录使用标准 MCP Apps bridge 与隔离浏览器宿主，覆盖参数卡片、报价失效、分组、多语言和窄屏布局。浏览器验收与原生 Codex 宿主验收分别记录，截图不能替代原生宿主或付费生成验证。

- [0.2.0 能力覆盖](docs/COVERAGE.md)与[能力契约／本地处理验证](docs/CAPABILITY_UPDATE_2026-10-08.md)。
- [宿主入口验证](docs/UI_ENTRYPOINTS_2026-10-08.md)。
- [配置卡片](docs/CONFIRMATION_CARD_0_3_1.md)、[报价机制](docs/PRICING_QUOTES_2026-10-08.md)与[预览持久化](docs/PREVIEW_PERSISTENCE_2026-10-09.md)。
- [资产分组工具](docs/ASSET_GROUP_TOOLS_2026-10-09.md)、[分组卡片与多选](docs/ASSET_GROUP_CARDS_2026-10-09.md)及[角色来源继承](docs/CHARACTER_GROUPING_0_3_1.md)。
- [多语言界面](docs/MULTILINGUAL_UI_2026-10-09.md)、[窄屏布局](docs/WORKBENCH_LAYOUT_FIX_2026-10-09.md)及[多选操作栏](docs/SELECTIONBAR_LAYOUT_2026-10-09.md)。
- [导出贴图验证](docs/EXPORT_RESOLUTION_FIX_2026-10-08.md)、[下载卡片修复](docs/DOWNLOAD_CARD_FIX_2026-10-09.md)与[截图来源](docs/images/README.md)。
