# CORE.md — 核心架构抉择

## 决策 1：浏览器 Cookie 复用（替代常驻浏览器 / Playwright）

**结论**：不用 Playwright、不用专用浏览器 profile、不复制 JWT。

- `tripo_auth_login` 只干一件事：先重读本机所有受支持浏览器的 cookie 库——如果存在有效的 `ory_kratos_session`，直接复用（用户已经登录过就**完全不打开浏览器**）；没有才 `open`/`xdg-open`/`start` 默认浏览器一次，然后轮询 cookie 库直到会话出现。
- `api.tripo3d.ai` 直接接受 `ory_kratos_session` cookie 鉴权（已实测验证：profile/payment、模型列表、项目详情、付费生图全部 200）。**不需要 Bearer JWT**。
- 会话持久化在 `<dataDir>/session.json`(0600)。"刷新"= 重读浏览器 cookie 库——只要用户在任何受支持浏览器里保持登录，插件永远无需再开浏览器。
- Cookie 提取（`src/auth/cookies.mjs`)：复制 SQLite DB → `node:sqlite`（优先）或 `sqlite3` CLI 读出 → macOS 用 `security find-generic-password` 拿 "Chrome Safe Storage" 等 keychain 项派生 AES-128-CBC 密钥解密 v10 cookie（剥离 32 字节 host-hash 前缀）。Firefox 为明文 sqlite，天然跨平台。
- 支持 Chrome/Chrome Beta/Chromium/Edge/Brave/Arc/Vivaldi(macOS、Linux)+ Firefox（全平台）。Windows 的 v20 app-bound cookie 不支持 → 用 Firefox 或 `tripo_auth_import` 手动导入。
- 逃生口：`tripo_auth_import` 直接粘贴 `ory_kratos_session`（无浏览器机器 / CI);session 也兼容 `TRIPO_BEARER_TOKEN` 式 JWT。

**依据**：参考插件要求 Chrome 常驻 + CDP 嗅探，用户明确否决；实测 Kratos cookie 可被 API 直接消费，把「自动化浏览器」这整块复杂度删掉了。

## 决策 2：无常驻后端，stdio 进程自足

每个 MCP stdio 进程就是完整服务。会话、任务、快照、锁全部落在 `<dataDir>` 的文件上，多进程经 `FileLock` 互斥共享。不复制参考实现的 32175 端口常驻 backend。

## 决策 3：单一操作注册表

`src/ops/registry.mjs` 注册全部 28 种操作。独立工具、workflow、workbench UI 共用同一套 schema/validate/build/submit/sync——保证契约一致，新操作的 schema 和生命周期在注册表统一；工具名映射与 UI 示例仍需同步检查。

## 决策 4：付费边界用 durable task + 显式确认

- `prepare` 创建 staged task（冻结 payload、request hash、provenance)，返回确认串。
- `submit` 需要确认串；dispatch 失败分「明确拒绝」(failed）和「结果不明」(outcome_unknown)——后者禁止重提，只能 reconcile。
- 同账号同输入的 live 请求去重；进程重启时 dispatching→outcome_unknown。

## 决策 5：凭据与 URL 不出圈

- 公开 task/结果一律剥离 URL，只留 `url_available: true`；下载由 `tripo_download` 内部解析（域名白名单 + 输出根目录约束 + 4 GiB 上限）。
- session/日志/事件经过 `redactDeep` 递归脱敏（authorization/cookie/token/jwt/sts)。

## 实测验证（2026-10-08，本机真实账号）

- 从默认 Chrome cookie 库提取 `ory_kratos_session` → `refresh()` true → session.json 持久化。
- `listModels` 返回 20 个真实项目；`getPaymentSummary` 返回 premium 订阅。
- `image.generate`(prompt=green apple）付费提交 → 远端 asset `056e2f8f…` → 同步 succeeded → 下载 1,065,500B PNG(1024×1024)。
- `getProject` + `model_url` 下载 205,084B GLB。
- `npm test` 22/22 通过（含 MCP handshake,37 个工具）。

## 0.2.0 能力补齐（2026-10-08）

- 新增 13 种操作和 3 个读取工具，共 28 种操作、53 个 MCP 工具。
- 新付费链路按生产网页已加载的公开脚本核对契约，未为升级测试提交付费生成。
- 本地编辑使用后台 Blender/sharp；不伪造网页客户端编辑的服务端接口。
- Smart UV / export 的只读过期检查放在 durable dispatch 边界之前。
- 本地任务无需账户，consumes_credits=false；中断恢复为 failed，远端中断仍 outcome_unknown。
- 实际新版验证和限制见 [能力补齐记录](docs/CAPABILITY_UPDATE_2026-10-08.md)。

## 已知限制

- Windows Chrome v20 app-bound cookie 无法解密（需 Firefox 或 auth_import)。
- `whoami` 取 identity 为 best-effort；失败时 fingerprint 退化为 cookie 哈希（重登后 dedupe 范围变化，可接受）。
- 仅支持 region rg1。
