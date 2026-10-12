# 开发与贡献

[返回 README](README.md) · [配置说明](docs/CONFIGURATION.md) · [工具清单](TOOL_INVENTORY.md)

## 本地开发

开发使用 Node.js 24（见 `.node-version`）与 `package.json` 固定的 pnpm 版本。插件运行时仍支持 Node.js ≥ 22。启用 Corepack 的 pnpm shim 后，在仓库根目录执行；也可用 `corepack pnpm` 代替下列 `pnpm`：

```bash
corepack enable pnpm
corepack install
pnpm install --frozen-lockfile
pnpm run build
pnpm run check
pnpm test
```

提交 `pnpm-lock.yaml`，不使用 `package-lock.json`。安装依赖时，`prepare` 自动安装 Husky hooks。依赖构建脚本只允许 `pnpm-workspace.yaml` 中声明的 esbuild。

## 代码质量与提交检查

- `pnpm run lint` / `pnpm run lint:fix`：ESLint flat config 的 recommended 规则，分别声明 Node 与浏览器环境，警告也会导致检查失败。
- `pnpm run format` / `pnpm run format:check`：Prettier 负责格式；ESLint 的格式规则通过 eslint-config-prettier 关闭。生成的 `dist/`、测试 fixtures 与第三方许可证文本不参与自动格式修改。`test/browser/*.js` 不参与 Prettier 格式化，以保留 playwright-cli `run-code --filename` 所需的函数表达式格式；这些文件仍接受 ESLint 检查，测试会验证其表达式语法。
- `pnpm run check`：lint、格式检查与分发一致性检查。
- Husky `pre-commit`：lint-staged 只修复暂存文件，再执行完整测试与分发检查。仓库是 JavaScript ESM，没有 TypeScript 编译或 typecheck 步骤。
- Husky `commit-msg`：commitlint 校验 Conventional Commits，例如 `fix: pause submission only for changed parameters`、`chore: migrate development tooling to pnpm`。
- CI 使用固定 pnpm 与 frozen lockfile，验证 lint、格式、提交消息、跨平台测试及真实发布包。CI 设置 `HUSKY=0`，通过显式检查代替 Git hooks。

配置依据 [ESLint flat config](https://eslint.org/docs/latest/use/configure/configuration-files)、[Prettier 与 lint-staged](https://prettier.io/docs/precommit)、[Husky](https://typicode.github.io/husky/get-started.html) 和 [commitlint](https://commitlint.js.org/guides/local-setup.html) 的官方说明。

本地插件的首次安装和后续更新统一使用：

```bash
pnpm run install:local
```

脚本构建后同步到 `~/.local/share/codex-integrations/tripo-studio-local/runtime`，本地插件只携带技能、图标和指向该固定目录的 MCP 配置。每次构建都会刷新版本时间戳及工作台资源 URI，安装时同步 MCP 配置并重新注册插件。工作台版本标记是重新加载按钮：点击会通过 MCP 重新读取最新界面，替换当前页面，并保留页签和未提交表单；右侧刷新按钮仅刷新数据。界面更新后无需重启 Codex。后端代码或 MCP 配置更新仍需重连 Tripo MCP。首次从没有此按钮的旧界面升级时，重连后关闭并重新打开工作台；旧页面仍被宿主缓存时完全退出并重新打开 Codex。

同步使用预先准备的完整构建，失败时保留或恢复旧目录。登录、任务、账号数据与下载文件继续使用原配置，不进入运行目录。此命令只更新 `tripo-studio-local` 本地安装，不修改固定 npm 版本的正式发布配置。

`mcp/bootstrap.mjs` 优先加载 `dist/server.mjs`，没有构建产物时回退到源码。修改源码后重新构建，再重新加载宿主的 MCP 连接；界面也需重新打开。

开发时可直接启动源码服务：

```bash
pnpm run serve:src
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

仓库中的 `.agents/plugins/marketplace.json` 指向固定版本的 npm 插件包。开发与打包使用 pnpm；`package.json` 使用发布文件白名单，`pnpm pack` 自动构建服务器和界面，并移除开发用的 packageManager 与 prepare 生命周期。JavaScript 依赖全部打进服务器文件；图片处理使用 ImageMagick WASM，构建时将固定版本的 WASM 复制到 `dist/magick.wasm`，没有外部运行时依赖或平台原生二进制。正式插件使用 npx 启动同版本运行时，不需要安装时构建脚本。

提交发布前执行：

```bash
pnpm run check:distribution
pnpm run test:package
```

发布包验收从仓库外的临时目录、空 npm 缓存启动真实 npx，验证 MCP 握手、68 个工具、工作台与结果卡片、图片导入和裁剪，再验证缓存可离线启动。CI 在 Linux、macOS、Windows 的 Node 22 和 Linux Node 24 上运行发布包验收。

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
