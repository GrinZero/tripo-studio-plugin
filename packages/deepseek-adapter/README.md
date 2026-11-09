# Tripo Studio for DeepSeek Harness

Embedded configuration cards, a sidebar 3D workbench, and Tripo Studio tools for
official DeepSeek Harness Web and Desktop. This preview targets DSH
`0.2.2-rc.1` and pins its shared Tripo runtime. Codex users continue to install
`tripo-studio-plugin` separately.

From a repository checkout, run `pnpm install --frozen-lockfile` and
`pnpm run build`, then install this built package with:

```bash
dsh plugin --profile web add "link:$PWD/packages/deepseek-adapter"
```

Use the matching Desktop profile for Desktop. Once both packages are published,
install the exact published adapter version through DSH's Plugins page or CLI.
This source preview is not evidence that an npm version has been published.

Configuration cards submit **60 seconds after server-side creation**, including
collapsed cards and background sessions. Editing pauses; saving submits; canceling
stops the configuration. Closing the UI does not cancel. New configurations require
an initialized Tripo UI in the same session. Read-only tools remain usable without
it. Never retry an operation with an unknown remote outcome.

The adapter starts one local stdio process, uses DSH's authenticated API carrier,
and keeps UI-only metadata out of model history. Login and Blender run on the Host
machine. Existing Tripo data is shared with Codex; UI presentation records are kept
under `deepseek-presentations` in that data directory.

See [setup, limits and verification](https://github.com/GrinZero/tripo-studio-plugin/blob/main/docs/DEEPSEEK.md)
and the [implementation plan](https://github.com/GrinZero/tripo-studio-plugin/blob/main/docs/DEEPSEEK_SUPPORT_PLAN.md).
