# Tool inventory — 53 MCP tools (0.2.1)

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

All operations stage by default. `submit: true` executes in one call. Only the credits column marked yes can consume Studio credits. Local operations use Blender/sharp and require no account.

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

## Tasks (7)

| Tool | Purpose |
|---|---|
| `tripo_submit_task` | Execute a staged task with its exact confirmation |
| `tripo_task_sync` | Refresh task progress |
| `tripo_task_wait` | Bounded wait for completion |
| `tripo_task_cancel` | Cancel staged work only |
| `tripo_task_reconcile` | Adopt observed remote IDs after an ambiguous write |
| `tripo_list_tasks` | Filter persisted tasks |
| `tripo_get_task` | Frozen settings, provenance, lineage, results and events |

## Artifacts / workflow (3)

| Tool | Purpose |
|---|---|
| `tripo_download` | Remote artifacts or local copies within allowed output roots |
| `tripo_run_workflow` | Shared lifecycle with previous-result dependencies |
| `tripo_open_in_studio` | Project deep link |

The `ui://tripo-studio/workbench.html` resource provides the workbench. Download artifacts include model/UV layout/image/render/per-part texture selections; `output_index` selects independent batch results.
