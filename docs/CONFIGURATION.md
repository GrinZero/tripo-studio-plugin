# 配置与本地数据

[返回 README](../README.md) · [开发说明](../CONTRIBUTING.md)

## 环境变量

| 变量 | 用途与默认值 |
| --- | --- |
| `TRIPO_PLUGIN_DATA_DIR` | 会话、任务、快照、分组与锁的目录，平台默认路径见下表 |
| `TRIPO_ASSET_ROOT` | 下载和本地产物根目录；默认 `~/Documents/TripoStudio` |
| `TRIPO_OUTPUT_ROOTS` | 允许写入的输出目录列表，以平台路径分隔符分隔；默认使用资产根目录 |
| `TRIPO_BROWSER_PROFILE_DIR` | 显式指定浏览器 Cookie 存储根目录 |
| `TRIPO_BLENDER_EXECUTABLE` | Blender 可执行文件；macOS 默认 `/Applications/Blender.app/Contents/MacOS/Blender`，其他平台默认 `blender` |
| `TRIPO_DEVICE_ID` | 覆盖根据本地数据目录派生的稳定设备 ID |
| `TRIPO_PLAN_TTL_MS` | 草稿有效期；默认 30 分钟 |
| `TRIPO_REQUEST_TIMEOUT_MS` | 请求超时；默认 60 秒 |
| `TRIPO_TOKEN_CAPTURE_TIMEOUT_MS` | 登录后等待浏览器会话的时限；默认 20 秒 |

`.mcp.json` 的 `env_vars` 声明传入插件进程的变量；配置时须确保目标变量实际传给 MCP 进程。使用源码 MCP 连接时，也可在 `codex mcp add` 中用 `--env KEY=VALUE` 指定。

## 数据目录

| 平台 | 默认任务／会话目录 |
| --- | --- |
| macOS | `~/Library/Application Support/TripoStudioPlugin` |
| Windows | `%LOCALAPPDATA%\TripoStudioPlugin`；未设置时使用用户目录下的 `AppData\Local\TripoStudioPlugin` |
| Linux / 其他 | `$XDG_STATE_HOME/tripo-studio-plugin`；未设置时使用 `~/.local/state/tripo-studio-plugin` |

会话与任务目录应保留，以便重启后延续任务记录。资产分组按账号保存于本地；公开结果与日志经过脱敏，签名下载链接由服务端解析。

配置卡片先在本地准备快照与费用预估，不等待图片上传或在线报价。卡片展示后，图片在后台预上传与审核；修改参数复用按账号和文件内容缓存的上传结果，替换图片只上传新内容。预上传与保存配置不会发起生成请求，只有手动确认或展示后 60 秒倒计时结束才提交。编辑时暂停计时，保存后重新计时。

上传结果保存在数据目录的 `input-uploads/`，有效期与草稿有效期一致，过期后重新上传；会员优惠与免费次数在确认时在线核验。草稿取消不会取消已经开始的预上传，但不会发起生成请求。

卡片使用稳定的 `review_id`；保存配置更新同一草稿，不新建或取消任务记录。提交前卡片仅返回本地 `draft_id`，拿到提交回执后才返回可查询的 `task_id` 与 Tripo 远端标识。助手使用 `tripo_get_configuration_review` 查询当前卡片，提交后再跟踪最终任务。

## 修改资产根目录

数据目录中的 `settings.json` 若已保存 `asset_root`，其优先级高于 `TRIPO_ASSET_ROOT`。文件格式如下，路径需替换为你自己的绝对路径：

```json
{
  "schema_version": 1,
  "asset_root": "/absolute/path/to/TripoStudio"
}
```

根目录必须是专用子目录，不能直接使用文件系统根目录、用户主目录或系统临时目录。显式设置 `TRIPO_OUTPUT_ROOTS` 时，允许写入的路径仍受该列表约束。
