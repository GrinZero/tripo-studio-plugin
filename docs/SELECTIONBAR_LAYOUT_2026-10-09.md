# 资产操作条与 Codex 输入框并排

仅在识别到 Codex 宿主时启用并排布局。优先识别初始化响应的 `hostInfo.client_type` 及明确的 Codex 标识；也识别原生桌面 widget 的 context 组合：`userAgent: chatgpt`、`platform: desktop`、`openai/interactionCursor` 字符串。普通 ChatGPT、浏览器及未知宿主保持全宽的底部 sticky 横条。

当前安装的 Codex widget 代码使用上述 context 组合，宿主名称和 userAgent 都为 `chatgpt`。MCP Apps 初始化结果 schema 会删除 `hostInfo.client_type`。此前仅在应用的 transport 保存扩展字段，无法处理上游 sandbox 已经解析过的响应。0.3.3 补上 schema 解析后仍保留的 context 识别。先以真实 SDK schema 生成失败用例，再修正识别；浏览器回归也先失败后通过。未直接捕获当前原生页面的宿主消息，因此上游解析导致本次截图失败是由代码及回归证据支持的判断。

Codex 模式中工作台高度跟随 `containerDimensions.height` / `maxHeight`，缺省使用 `100dvh`；资产列表在主内容区内部滚动，操作条固定在左下角。1100px 以上给右下角输入框预留 560px 宽度、16px 外边距和12px 间距，底边对齐。横向坐标并非宿主提供的实时数据：当前协议只有容器尺寸和 safe-area insets，没有输入框矩形，因此这个停靠布局适配当前右下角输入框。1100px 以下改为输入框上方布局，使用宿主底部 inset 跟随输入框增高。长资产名省略显示，悬停可看完整名称，手机上按钮分行。

验证使用隔离的 AppBridge 宿主，分别模拟 Codex 原始初始化、经过真实 SDK schema 解析的初始化以及普通宿主。`test/browser/check-selectionbar-layout.js` 检查三种宿主、两种语言、六种尺寸、两种滚动位置以及输入框占位高度更新，共120项检查；包含宿主高度、并排对齐、窄窗口回退、普通宿主全宽、长名称和取消/详情跳转。没有调用真实 Studio 或执行下载、付费操作。截图：`output/playwright/selectionbar-codex-normalized.png`、`selectionbar-standard.png`、`selectionbar-mobile.png`。这不是原生 Codex 页面视觉验收。

运行：`npm run build`，`TRIPO_TEST_PORT=43914 node test/browser/i18n-server.mjs`，随后 `playwright-cli run-code --filename test/browser/check-selectionbar-layout.js`。

本机已正式卸载旧插件并使用 `codex plugin add tripo-studio-plugin@tripo-studio-local --json` 安装 0.3.3，安装记录为 enabled。工作台资源改为 `ui://tripo-studio/workbench-v0.3.3.html`，避免宿主复用旧资源地址。通过安装目录启动独立 MCP 连接，验证服务版本为 0.3.3、打开工具指向新版资源、返回 HTML 包含 Codex 停靠逻辑，8 个关键文件与工作区哈希一致。记录保存在 `.local/verification/reinstall-0.3.3.json`。原生 Codex 窗口的 Computer Use 访问被宿主禁止，因此未声称原生界面已完成视觉验收。
