# 插件分发与发布

[返回 README](../README.md) · [开发说明](../CONTRIBUTING.md)

## 分发链路

用户通过 `codex plugin marketplace add GrinZero/tripo-studio-plugin` 添加 Git 市场，再通过 `codex plugin add tripo-studio-plugin@tripo-studio-plugins` 安装。仓库的 `.agents/plugins/marketplace.json` 使用 Codex 支持的 npm 来源，指定完整插件包的精确版本；它是独立市场，尚未在官方公共插件目录上架。

Codex 下载插件包不会运行 npm 生命周期脚本，也不能假定会为包安装运行时依赖。因此 `.mcp.json` 通过 `npx --yes --ignore-scripts --prefix=./mcp --package=tripo-studio-plugin@<精确版本> tripo-studio` 启动服务。显式 prefix 防止 npx 把插件根目录的同名 package.json 误认为已经安装的运行时。npm 下载完整运行包并复用缓存；图片处理所需的 JavaScript 和 WASM 随包提供，不安装平台原生依赖。首次需要网络、Node.js ≥ 22 和 npm / npx；不需要用户手动执行 `npm install`。

市场、插件清单、npm 包和 MCP 运行时使用同一个版本。不会在每次启动时跟随 `latest` 自动换版；更新由 Codex 的市场刷新和插件安装机制控制。任务、会话和资产沿用[原有数据目录](CONFIGURATION.md#数据目录)，与 npm 缓存和 Codex 插件缓存分离。

此方案依据 [OpenAI 插件市场文档](https://developers.openai.com/plugins/build/plugins#marketplace-metadata) 与 [npm exec 文档](https://docs.npmjs.com/cli/v11/commands/npm-exec/)。

## npm 发布包

`package.json` 的 `files` 白名单包含插件清单、MCP 配置、启动入口、构建产物、HTML 与图标、技能及引用、本地 Blender worker 和用户文档。README 的截图也随包分发。源码、测试、设计稿、开发依赖和本地账号数据不会进入 tarball。

`npm pack` 的 `prepack` 会重新构建并检查分发配置。SDK、AWS 客户端、Zod、Three.js 等 JavaScript 依赖全部打进服务器或界面文件。图片处理使用固定版本的 `@imagemagick/magick-wasm`，其 JavaScript 打进服务器，约 15 MiB 的 WASM 复制到 `dist/magick.wasm`，首次处理图片时从本地懒加载。发布包没有外部运行时依赖，无需安装系统 ImageMagick。开发依赖不会安装到消费端。发布包没有 `install`、`postinstall` 或 `prepare` 构建步骤。

本地验收：

```bash
npm ci
npm run build
npm test
npm run test:package
```

`test:package` 输出 tarball 到被 Git 忽略的 `artifacts/`，并从全新临时目录通过 npm exec 启动，安装时禁用生命周期脚本。它验证 MCP 握手、67 个工具、图标、工作台和结果卡片资源，以及使用包内 WASM 的图片导入、WebP 预览和裁剪；之后使用同一缓存、`--offline` 再次启动。验收不登录真实账号、不提交付费任务，临时数据与 npm 缓存自动清理。CI 的 Windows 和 Linux 结果仍需在 GitHub 上实际运行确认。

## 首次发布配置

包名为 `tripo-studio-plugin`，以 [MIT License](../LICENSE) 公开发布。第三方依赖的许可证声明随包提供于 `dist/THIRD_PARTY_NOTICES.txt`。首次发布前确认维护者的 npm 账号有权使用这个包名。

工作流为 `.github/workflows/publish.yml`，由稳定版 GitHub Release 的 `published` 事件触发。CI 通过后，将已经验证的 tarball 上传到该 Release 的 Assets，并发布到 npm，附带 provenance。源码仓库需要公开，才能生成公共包的 provenance。

Release 附件上传使用 GitHub Actions 自动提供的 `GITHUB_TOKEN`，仅上传任务授予 `contents: write`，无需额外配置 token。附件上传与 npm 发布分别在 CI 通过后执行；即使 npm 凭据未配置或发布失败，Release 附件仍可上传。重跑附件上传任务会替换同名 `.tgz` 文件。

首次创建 npm 包时，可以在 GitHub 仓库的 Actions secrets 中配置具有发布权限的 **`NPM_TOKEN`**。使用支持发布的 granular token，并根据账号的 2FA 策略设置适用于 CI 的权限。Action 将它传入 `NODE_AUTH_TOKEN`，无需把凭据提交到仓库。

也可在本机登录 npm 后发布经过验收的 tarball来创建包，再配置下述可信发布。无论采用哪种方式，先完成首个 npm 版本发布，市场安装入口才可用。

## 后续可信发布

推荐在包创建后配置 npm Trusted Publisher，使用 GitHub OIDC，避免维护长期发布 token。在 npm 包的 Settings → Trusted Publisher 中填写：

| 设置 | 值 |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `GrinZero` |
| Repository | `tripo-studio-plugin` |
| Workflow filename | `publish.yml` |
| Environment | 留空（工作流未指定 environment） |
| Allowed actions | 允许直接 `npm publish` |

工作流已配置 `id-token: write`，使用 Node 24 与 npm 11。配置可信发布后，可以移除 `NPM_TOKEN`，npm 使用 OIDC；首次 token 配置与 OIDC 都需由有权限的维护者在对应平台完成。

参见 [npm 可信发布](https://docs.npmjs.com/trusted-publishers/)和 [provenance 要求](https://docs.npmjs.com/generating-provenance-statements/)。

## 发布新版本

1. 在发布分支更新版本，例如 `npm version 0.3.5 --no-git-tag-version`。npm 的 `version` 钩子自动同步插件清单、市场版本、MCP 的 npm 版本、服务／界面版本和 README 徽章。
2. 执行 `npm run build`、`npm test` 和 `npm run test:package`，提交版本修改与构建产物，然后推送到 GitHub。
3. 创建对应的 `v0.3.5` 标签，并发布该标签的 GitHub Release。发布稳定版本；当前工作流跳过 prerelease，拒绝标签与包版本不一致。
4. 等待 **Publish npm plugin** 工作流中的验证、**Upload tested package to Release** 和 npm 发布任务成功，确认 Release 的 Assets 中出现 `tripo-studio-plugin-<版本>.tgz`，再通知用户更新。npm 发布版本不可覆盖；失败重试前先确认该版本是否已在注册表中。

Action 会在 Linux、macOS、Windows 上验收发布包，Release 附件与 npm 发布复用同一个 Linux Node 22 验收后保存的 tarball，不会重新打包。PR 和 `main` 的 push 只触发验证，不会上传 Release 附件或发布 npm。

市场 `main` 分支上的新版本清单与 npm 发布之间可能有短暂间隔；在对应 npm 版本发布完成前不要宣布安装／更新可用。

## 用户更新与卸载

```bash
# 刷新 Git 市场，并安装该市场指定的发布版本
codex plugin marketplace upgrade tripo-studio-plugins
codex plugin add tripo-studio-plugin@tripo-studio-plugins

# 卸载插件，保留任务、会话与下载文件
codex plugin remove tripo-studio-plugin@tripo-studio-plugins
```

安装或更新后开启新聊天，使用新版本的技能与 MCP 连接。无需运行 `npm update`、全局安装 npm 包或编辑 Codex 配置文件。
