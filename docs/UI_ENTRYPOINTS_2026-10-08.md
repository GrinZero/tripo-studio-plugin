# Tripo 工作台侧边栏接入（0.2.3）

0.2.2 只有普通 HTML resource，没有侧边栏或对话面板入口。0.2.3 新增 `tripo_open_workbench`：标题为 **Tripo 工作台**，绑定 `ui://tripo-studio/workbench.html`，声明 `openai/ui.entrypoints` 的 `global` 和 `thread` 两种入口。图标来自随包分发的 `ui/icon.svg`。打开操作只返回视图、项目/任务引用及登录状态，不创建生成任务。

资源采用 `text/html;profile=mcp-app`。服务端使用 MCP Apps 注册助手；界面通过标准 App SDK 完成初始化后调用同一组 MCP tools。浏览器脚本在构建时打包，读取 resource 时内联，因此宿主无需连接开发服务器或外部 CDN。CSP 不允许直接连接外部服务；账号凭据留在后台。界面支持宿主主题、资产翻页、任务来源查询及本地任务下载。插件和扩展 SDK 要求 Node >=22。

宿主重新发现插件后，可从侧边栏更多菜单中的 **Tripo 工作台** 或对话面板应用选择器打开。`tripo_open_workbench` 可指定 `view`、`project_id` 或 `task_id`。仍未显示入口时，需要先重载插件连接，不能把 Skill 文档更新当作入口安装。

## 验证

- 构建成功。stdio 握手测试验证新增工具、两种入口元数据、资源关联及 MIME、打包脚本读取、未登录时无付费调用的打开结果。
- 全套测试 63 项通过，无失败或跳过，含真实 Blender 与 stdio MCP。
- 在仅监听 127.0.0.1 的临时验证宿主中，使用标准 `AppBridge` 和 `PostMessageTransport`，界面完成 `ui/initialize`，复用真实登录会话并读取账户资产。模型总数 54，翻页通过真实 MCP 工具获取下一批；没有提供示例模型。
- 临时宿主仅允许只读及固定 fixture 的本地裁切，拒绝远端提交和上传。原生 Codex 侧边栏的可见性需在插件更新后独立确认；当前 Computer Use 明确禁止操作 Codex 原生窗口，不能把这个浏览器宿主当成原生验收证据。
- 面板实测本地 fixture：准备裁切、执行、查询成功、下载及查看来源均通过。128×128 原图裁切为 64×64 PNG；任务 `paid_request_sent:false`，保留输入哈希、冻结裁切矩形及五个生命周期事件。
- 已通过本机 marketplace 安装到 0.2.3 缓存。独立启动安装包确认 55 个工具、两种入口、标准资源 MIME；源码/打包脚本/图标/Skill 与工作区逐文件一致。Skill 格式验证及安装包内所有参考文档链接均通过。

本轮解决入口注册和连接。创建页面仍有 JSON 参数编辑区，列表缩略图为类型标签，尚未交付交互式 3D 查看器或完整可视化来源链。

协议依据：[OpenAI Plugin Extensions](https://developers.openai.com/plugins/build/extensions)、[MCP Apps UI](https://developers.openai.com/plugins/build/chatgpt-ui)。
