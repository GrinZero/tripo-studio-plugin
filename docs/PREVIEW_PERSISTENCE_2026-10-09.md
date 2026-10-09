# Preserve the artifact preview

Previously every ordinary tool shared the result-card resource. Account/payment,
quote, catalog, get/list, sync/wait and download calls could therefore open or
update the same host UI with ancillary results. The card also disposed its
viewer on every result. This made a completed model disappear behind payment
JSON or a download status.

Data tools now omit `ui.resourceUri` while retaining model/app visibility and
structured results. Creation/editing tools (except local part inspection) retain
configuration cards and their task polling. `tripo_show_result` is the explicit
read-only presentation tool for an existing task, project, image asset or saved
GLB/image. Agent guidance asks for one presentation when needed, avoiding
repeated presentation after background operations. Workflow execution returns
data; the agent can explicitly present its selected completed output.

Cards use `ui://tripo-studio/result-card-v2.html` so hosts do not reuse an old UI
bundle. Data results carry `_meta.tripo.presentation: data`; the card ignores
these as replacement content, including failures. A matching download updates
only the saved-file section. The existing viewer and camera remain mounted.

Completed task cards read local task records every five seconds, showing agent
initiated downloads without remote synchronization or reloading model bytes.
Downloads record artifact and output index so another batch slot or UV layout
cannot overwrite the selected artifact's saved-file details. Project/image
cards offer an in-place download button; downloads invoked outside a task card
remain available as links in the conversation. No host-wide singleton limit is
assumed or asserted by this design.

Verification:

- 96 automated tests passed, including the real stdio tool descriptors,
  creation-versus-data result metadata, explicit presentation, saved-file
  containment, and download records.
- A local MCP App SDK bridge fixture rendered a real GLB in Chromium. Membership
  queries, matching and unrelated downloads, failed background downloads and
  local record updates preserved the exact canvas node; the model preview was
  fetched once. This is browser/SDK verification, not a native Codex host test.
- Browser fixture: `output/playwright/serve-preview-persistence.mjs`.
- Screenshot: `output/playwright/preview-persistent.png`.

Reload the plugin connection to discover the changed descriptors and new tool.
Existing host tool schemas and already-open cards do not update in place.
