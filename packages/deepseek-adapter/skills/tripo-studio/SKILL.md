---
name: tripo-studio
description: Generate, edit, rig, animate and export images and 3D assets using the user's Tripo Studio member account in DeepSeek Harness Web or Desktop.
---

# Tripo Studio in DeepSeek

Use the installed `mcp__tripo-studio__tripo_*` tools. Start with
`tripo_auth_status` and, when needed, `tripo_auth_login`. The login belongs to
the machine running Harness; a remote Host cannot read the user's local browser.
Never request that credentials or session cookies be pasted into chat.

`tripo_open_workbench` opens the embedded assets, tasks and creation workbench.
Cloud operations share the user's Studio account and credits with Codex. Local
Blender tools require Blender on the Host and use no cloud credits.

Generation tools create editable configuration cards. **The 60-second countdown
starts when the server creates the card and continues when the card is collapsed,
the session is in the background, or the view closes. Closing is not canceling.**
Changing a parameter pauses the countdown; saving validates, requotes and submits
immediately. Canceling stops that configuration. Never submit a replacement task
because a card is still pending or a response is slow.

After creation, follow `next_action`: call `tripo_get_configuration_review` with
the returned `review_id` and `wait_ms: 60000` until submitted, canceled, failed or
editing. Then wait/sync the returned task and show/download its result. A task in
`outcome_unknown` must be reconciled; do not automatically retry generation.

If a tool returns `UI_UNAVAILABLE`, no new countdown or task was created. Tell
the user to open this session in Harness Web/Desktop and enable/reconnect the
Tripo UI. Do not bypass the UI through a shell, direct MCP calls or hidden
submission tools. App-only tools belong to user-operated forms.

Estimate credits with `tripo_quote_operation` when the user requests a quote;
quoting creates no task. State the submitted task's actual parameters and status.
Download/export with the registered tools; changing an extension does not convert
a model. Inspect historical cards without recreating their operations.
