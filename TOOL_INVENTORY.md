# Tool inventory — 67 MCP tools (0.3.3)

[README](README.md) · [Usage guide](docs/USAGE.md) · [Agent guide](skills/tripo-studio/SKILL.md)

The server registers 63 agent-visible tools and 4 app-only tools. Parameter names, types, enums and defaults come from the current MCP `tools/list` schemas; `tripo_list_operations` returns operation descriptions and credit flags, not input schemas.

## Workbench

| Tool | Role |
|---|---|
| `tripo_open_workbench` | Open the sidebar app or conversation panel; optional view/project/task routing; no paid submission |

## Account / session (5)

| Tool | Purpose |
|---|---|
| `tripo_auth_status` | Usable session status, no credentials |
| `tripo_auth_login` | Reuse browser session, opens browser only when needed |
| `tripo_auth_import` | Import user-provided existing session cookie |
| `tripo_auth_logout` | Clear plugin session |
| `tripo_get_payment` | Read plan and credit summary |

## Catalog / read (10)

| Tool | Purpose |
|---|---|
| `tripo_list_models` | Page model projects |
| `tripo_get_model` | Project capabilities, optional operator details/parts/presets |
| `tripo_list_image_assets` | Page generated/edited/multiview/upscaled/split image assets |
| `tripo_get_image_asset` | Selected image asset inputs and output slots |
| `tripo_list_image_templates` | Image style templates |
| `tripo_list_animation_presets` | Preset animation catalog |
| `tripo_list_operations` | 28 operation kinds, descriptions and credit flags; input schemas are in tools/list |
| `tripo_list_motions` | Generated motions and active tasks |
| `tripo_get_motion` | Generated motion asset |
| `tripo_get_uv_context` | Smart UV candidates/current operator/running task |

## Operations (28)

Individual operation tools default to an editable configuration card (`review:true`): confirmation or the 60-second deadline submits the staged task. Editing pauses the deadline; saving validates/requotes and restarts it. Use `review:false, submit:false` for a draft only, or `submit:true` for explicit immediate execution. Only entries marked yes below can consume Studio credits. Local operations use Blender/ImageMagick WASM and require no account. See [submission behavior](docs/USAGE.md#提交报价与草稿).

| Tool | Kind | Credits |
|---|---|---|
| `tripo_generate_image` | image.generate | yes |
| `tripo_generate_multiview` | image.multiview | yes |
| `tripo_regenerate_image` | image.regenerate | yes |
| `tripo_generate_model` | model.generate | yes |
| `tripo_import_model` | model.import | no |
| `tripo_segment_model` | model.segment | yes |
| `tripo_complete_parts` | model.complete_parts | yes |
| `tripo_remesh_model` | model.remesh | yes |
| `tripo_generate_texture` | texture.generate | yes |
| `tripo_preview_texture_edit` | texture.edit_preview | yes |
| `tripo_apply_texture_edits` | texture.edit_apply | yes |
| `tripo_upscale_texture` | texture.upscale | yes |
| `tripo_generate_pbr` | texture.pbr | yes |
| `tripo_rig_model` | model.rig | yes |
| `tripo_animate_model` | model.animate | yes |
| `tripo_upscale_image` | image.upscale | yes |
| `tripo_split_image` | image.split | yes |
| `tripo_generate_motion` | motion.generate | yes |
| `tripo_apply_motion` | model.apply_motion | yes |
| `tripo_export_model` | model.export | no |
| `tripo_generate_uv` | model.uv_generate | yes |
| `tripo_apply_uv` | model.uv_apply | no |
| `tripo_render_model` | local.render | no |
| `tripo_inspect_local_parts` | local.inspect_parts | no |
| `tripo_edit_parts` | local.edit_parts | no |
| `tripo_bake_texture_projection` | local.project_texture | no |
| `tripo_paint_texture` | local.paint | no |
| `tripo_crop_image` | local.crop | no |

## Asset groups (5)

These tools manage local, account-scoped membership shared with the workbench. They preserve assets and consume no credits.

| Tool | Purpose |
|---|---|
| `tripo_list_asset_groups` | List groups and model/image/member counts |
| `tripo_list_group_assets` | Page group members or ungrouped assets |
| `tripo_create_asset_group` | Create a group, optionally with members; reuse the same normalized name |
| `tripo_set_asset_group` | Add/move model or image references; `group_id:null` removes membership |
| `tripo_rename_asset_group` | Change the name while retaining the group ID and members |

See [asset-group workflows](skills/tripo-studio/references/asset-groups.md) for exact references, pagination and merging.

## Tasks (9)

| Tool | Purpose |
|---|---|
| `tripo_submit_task` | Execute a staged task with its exact confirmation |
| `tripo_task_sync` | Refresh task progress |
| `tripo_task_wait` | Bounded wait for completion |
| `tripo_task_cancel` | Cancel staged work only |
| `tripo_task_reconcile` | Adopt observed remote IDs after an ambiguous write |
| `tripo_list_tasks` | Filter persisted tasks |
| `tripo_get_task` | Frozen settings, provenance, lineage, results and events |
| `tripo_list_task_groups` | Character groups and retained task counts |
| `tripo_set_task_character` | Correct local task character metadata; existing descendants retain their group |

## Artifacts / workflow (4)

| Tool | Purpose |
|---|---|
| `tripo_download` | Remote artifacts or local copies within allowed output roots |
| `tripo_show_result` | Explicitly present one task, project, image asset or saved local GLB/image |
| `tripo_run_workflow` | Shared lifecycle with previous-result dependencies; `submit` defaults to `true` |
| `tripo_open_in_studio` | Project deep link |

The `ui://tripo-studio/workbench.html` resource provides the workbench. Download artifacts include model/UV layout/image/render/per-part texture selections; `output_index` selects independent batch results.

## Quotes (1)

| Tool | Purpose |
|---|---|
| `tripo_quote_operation` | Estimate an operation or staged task without submitting; unknown cost is not zero |

## App-only tools (4)

These tools have `ui.visibility:["app"]` and are not exposed to the agent.

| Tool | Purpose |
|---|---|
| `tripo_ui_preview` | Bounded image/model previews for the workbench |
| `tripo_ui_import_image` | Import a user-selected local image for the workbench |
| `tripo_ui_asset_library` | Aggregate/paginate asset and group cards; persist selections into groups |
| `tripo_ui_review` | Configuration-card status, editing, requoting, confirmation and cancellation |
