# Asset-group workflows

Use this reference when organizing existing Studio models/images, merging collections, or diagnosing group operations. All five public tools are data tools: they keep the existing viewer visible. The saved membership is local to this plugin and active account, shared across its server instances; it does not create folders on the Studio website. Catalog queries and validation read Studio, but group writes never dispatch generation or consume credits.

## IDs, scope and results

`tripo_list_asset_groups` returns `{groups,total,offset,next_offset}`. Each group has `{id,name,model_count,image_count,total}`. Counts cover the complete currently fetched model/image catalogs, not just one page. `include_empty:true` is the default. `search` matches group names by case-insensitive substring; if the user provided an exact destination name, choose the matching group rather than the first search result.

`tripo_list_group_assets` returns `{assets,group,groups,total,asset_count,offset,next_offset}`. `assets` contains model entries with `project_id` and image entries with `asset_id`. `total` is the number of matching members after the selected type/search filters; `asset_count` is the whole account catalog count for that type, not the group's size. `type:all` is the default; use `models` or `images` when requested. `group_id:"ungrouped"` reads loose assets and returns `group:null`. Pass `next_offset` as the next `offset` until it is null.

Queries may reuse remote catalogs for up to 30 seconds; `refresh:true` forces a fresh fetch. Names and membership are reread from local storage on every query. Membership writes validate against freshly fetched catalogs. A model and an image can belong to the same group, but each asset belongs to only one group. One image asset counts as one member even if it has several image outputs.

Creation and membership changes return `{group,assigned,paid_request_sent:false}`. `assigned` is the number of distinct supplied assets accepted, including those already in the destination; it is not necessarily the number newly added. Removal returns `group:null`. Rename returns `{group,paid_request_sent:false}` and preserves `group.id`.

## Create, add, move and remove

The following examples show argument shapes. Replace each bracketed value with an actual returned ID before calling a tool; do not send placeholders.

Create a group and collect selected model/image assets in one batch:

```json
{"name":"派蒙素材","assets":[{"project_id":"<returned model project_id>"},{"asset_id":"<returned image asset_id>"}]}
```

Call `tripo_create_asset_group` with these arguments. Omit `assets` or pass `[]` to prepare an empty group. A name matching an existing group after NFKC, whitespace and case normalization reuses that group. Provided members move out of their old groups. A new manual group has a stable ID independent of its name; use the result's `group.id` for subsequent calls.

Add or move selected assets to an existing group with `tripo_set_asset_group`:

```json
{"group_id":"<returned destination group id>","assets":[{"project_id":"<returned model project_id>"}]}
```

Remove selected members with the same tool:

```json
{"group_id":null,"assets":[{"asset_id":"<returned image asset_id>"}]}
```

Use JSON `null`, not `"null"` or `"ungrouped"`, for removal. The latter is only a read selector. Removal keeps the asset and saves an explicit ungrouped override so its original task lineage does not immediately restore membership.

Each `assets` entry must have exactly one of `project_id` or `asset_id`. Mixed batches are allowed; duplicate references count once. The maximum is 500 entries per call. Validate every selected ID against real tool results; an invalid or foreign-account member rejects the complete batch. Larger operations require multiple batches and are atomic per batch, not across the entire operation. If a later batch fails, report the completed batches and remaining work accurately.

## Rename or merge

Rename with `tripo_rename_asset_group`:

```json
{"group_id":"<returned group id>","name":"派蒙 · 角色资产"}
```

Names must be readable single-line strings of 1–80 characters. Rename changes both model and image asset-page display names and preserves membership, including future outputs carrying the same automatic group identity. It does not rename Studio projects/images or change historical task `character_name` and parent links. Use task records and `parent_task_id` when continuing generation; an asset display name is not a replacement for recorded task identity.

Renaming to another group's normalized name returns `GROUP_NAME_CONFLICT`; it does not merge. If the user asked to merge A into B:

1. Resolve both exact IDs with `tripo_list_asset_groups`. If they are the same ID, no move is needed.
2. Collect A's entire `tripo_list_group_assets` result with `type:all` and all `next_offset` pages **before moving any members**, so shrinking A cannot skip pages. If only models/images were requested, select that type instead.
3. Convert the collected assets into references containing only `{project_id}` or `{asset_id}`, then call `tripo_set_asset_group` with B's ID in batches of at most 500.
4. Query A and B again to verify the requested scope. A can remain as an empty group; there is no group-delete tool. Do not claim it was deleted.

Do not merge solely to resolve a failed rename unless the user's request already authorizes merging. Otherwise report the name conflict and ask for the desired alternate name or destination.

## Workbench behavior and recovery

The Assets root shows populated groups as preview cards. Grouped members disappear from the root and are listed inside their group. Models and images have separate views: a group's card count reflects members of that view, while `tripo_list_asset_groups.total` combines both. Empty groups remain discoverable through tools and can receive members later, but have no root card. Clicking an individual asset card toggles selection; its details button opens the viewer. Grouping does not rearrange the Tasks page.

For `INVALID_INPUT` about an unknown group/member, refresh the relevant query and resolve the IDs again; do not repeatedly retry stale IDs. For `PLAN_MISMATCH`, the active account changed: query the current account again and ensure it is the one intended before continuing. Never carry group IDs or asset selections across accounts. For `GROUP_NAME_CONFLICT`, follow the rename/merge distinction above. For schema errors, correct the reported arguments rather than inventing IDs. Group writes are idempotent for the same arguments; after an uncertain response, query the persisted outcome before retrying.

If these tools are absent from MCP `tools/list`, report the installed/connected version mismatch and reload the plugin connection. A workbench-only `tripo_ui_asset_library` tool is not an agent-callable substitute. Do not claim a group was changed without a successful public tool result and verification.
