---
name: tripo-studio
description: Generate, edit, rig, animate and export images or 3D models through the user's Tripo Studio member account without an API key. Also use for browsing existing Studio assets, organizing models/images into groups or character collections, moving/removing members, renaming groups, and local Blender model or texture edits.
---

# Tripo Studio 0.3.4

Use the `tripo_*` MCP tools. Read `tripo_list_operations` for the available operation kinds, descriptions and `consumes_credits` flags. It does not return input schemas. Get parameter names, types, enums and defaults from the currently registered tool definitions (MCP `tools/list`), not from this catalog or the workbench's example JSON. If a required tool or parameter is missing, report the mismatch and reload/update the plugin connection before relying on it.

## Workbench and host UI

Keep the user's artifact preview visible. Account/payment, quote, catalog, get/list, sync/wait, task management, inspection, workflow and download tools return data only. Creation/editing cards follow their task through completion automatically. Use `tripo_show_result` once when presenting an existing/completed task, project, image asset or saved GLB/image if no creation card is already showing that result. It accepts exactly one of `task_id`, `project_id`, `asset_id`, `local_path`, plus optional `output_index`. Do not re-open a result after every background query or download. Download files normally, report actual local links in the conversation, and let the existing task card update its saved-file details without replacing the viewer. For workflow/immediate execution with no existing task card, show the chosen result after waiting. Neither explicit presentation nor opening the workbench submits generation.

Use `tripo_open_workbench` when the user wants the plugin UI. It registers **Tripo 工作台** as both a global sidebar app and a conversation panel. Select `view:assets|tasks|create`, or pass the actual `project_id`/`task_id` to continue there. Opening the workbench never submits generation or consumes credits. The UI uses the same MCP tools and durable task records.

The 0.3.0 workbench has an asset library, a real GLB viewer with material/wireframe modes, structured remesh/texture/rig/export controls, paged task records, and image/text/multiview model creation. It quotes changed settings and confirms frozen parameters before dispatch. App-only `tripo_ui_preview` and `tripo_ui_import_image` provide bounded previews and user-selected local images; they do not generate or consume credits. Binary previews use tool-result metadata, never signed URLs. See [workbench implementation](../../docs/WORKBENCH_0_3_0.md).

After installation/update, the host must reload the plugin connection to discover new entrypoints. If the user cannot see it, verify the installed tool's `openai/ui.entrypoints` metadata and the MCP Apps resource before reporting installation success. The entry may be in the sidebar's More menu or the conversation panel's app picker. A Skill update alone does not create a sidebar entry. Distinguish registration and SDK/browser verification from actual native-host observation; see [UI verification](../../docs/UI_ENTRYPOINTS_2026-10-08.md).

`tripo_open_in_studio` returns an official Studio website URL; it does not open the plugin workbench or register a sidebar item. Open that URL through the host/browser only when the user wants the original Studio project. See [UI verification boundaries](../../docs/CAPABILITY_UPDATE_2026-10-08.md).

## Authentication and submission

1. Check `tripo_auth_status` before remote work; if needed use `tripo_auth_login`. It reuses a logged-in browser or opens the default browser once. Local tools do not require login.
2. For execution requests, creation/editing tools with omitted `submit` or `submit:false` now return an editable configuration card (`review:true` by default). The card displays actual inputs and quoted cost; users can edit, confirm now or cancel. The 60-second automatic submission window starts only after the app acknowledges that the mounted card is displayed in a visible page. Tool response creation, a hidden card or background preparation never starts the deadline. Editing pauses the durable server deadline; saving validates/requotes, then the displayed updated card starts a fresh 60-second window. A server restart requires the card to acknowledge display again. This timeout behavior is user-authorized product policy. Let the card own submission: do not immediately call `tripo_submit_task` on its staged task or bypass it with `submit:true`. If the user explicitly asks for an immediate execution without a card, `submit:true` remains available. For draft-only / preview-only requests always pass `review:false,submit:false`; workbench staging does this explicitly. Preserve the returned `review_id` when configuration changes replace its task; query `tripo_get_task` on the current task returned by the card. Card actions are app-only and update the model context after submission/cancel/failure. Never resubmit after an unknown result.

   Creation/editing tools stage by default: frozen settings, source snapshots, request hash, confirmation, `cost_estimate`. Show the actual inputs, model versions, defaults and known cost before a paid submission. Use `tripo_quote_operation` with `kind` + cost-related `input`, or `task_id` for frozen parameters; quotes never upload, stage or dispatch. Requote when the estimate expires. `estimated_credits:null` means unknown, not free. This is a reviewed frontend estimate with live membership/trial lookups, not a server billing guarantee. Do not fabricate a price.
3. Use `tripo_submit_task` with the exact confirmation, or `submit: true` when the user authorized execution. Only `consumes_credits=true` operations consume Studio credits. Follow the user's continuing authorization; do not demand a second approval for an already authorized generation.
4. Sync/wait, then download or inspect local output paths. GLB downloads keep the original at `download.path`; use `download.blender_path` for Blender. Meshopt compression is decoded automatically to a separate copy, and local Blender tools also handle compressed GLB inputs automatically. If `download.blender_error` is present, the source was saved but no compatible copy is available; inspect the reported error. A task's success does not prove visual/structural quality.
5. Never resubmit `outcome_unknown` writes. Reconcile observed remote IDs. Cancel works only for staged work.

## Organize existing assets

The **Assets** page presents each group as one card with member previews and an exact total count. Grouped models/images appear only inside that card. Clicking an individual asset directly toggles selection; the separate details button opens its viewer. Users can create a group, add selected assets to an existing group, or remove them, including older assets without task lineage. Membership is saved locally per account, independently of task metadata and paid operations. App-only `tripo_ui_asset_library` aggregates the catalog before root/member pagination. The Tasks page remains a chronological progress list with status filters. Public asset lists also expose local `character_group` metadata and accept `character_group_id` to filter before pagination. See [asset group cards](../../docs/ASSET_GROUP_CARDS_2026-10-09.md).

Use the five public asset-group tools directly for requests such as “把这些模型加入派蒙分组”, “新建一个角色素材组”, “把图片移出分组”, “修改分组名称” or “合并这两个分组”. These requests modify the Assets library; use task tools only when the user intends to correct task character metadata or inspect task history. A manual asset group may represent any user-selected collection, not only a character.

| User intent | Tool and essential input |
| --- | --- |
| Find groups or their counts | `tripo_list_asset_groups`; returns `groups[].id`, `model_count`, `image_count`, `total`. |
| Inspect members or find loose assets | `tripo_list_group_assets` with a returned `group_id`, or `group_id:"ungrouped"`; `type` defaults to `all`. |
| Create a group and optionally collect assets | `tripo_create_asset_group` with `name` and optional `assets`; same normalized name reuses the existing group. |
| Add or move assets into an existing group | `tripo_set_asset_group` with returned `group_id` and `assets`. |
| Remove assets from their group | `tripo_set_asset_group` with `group_id:null` and `assets`; retains the assets and overrides automatic membership. |
| Change a group name | `tripo_rename_asset_group` with returned `group_id` and `name`; preserves identity and members. |

Resolve the destination by name with the group query when its ID is unknown. Resolve selected members from actual model/image catalog or group-member results, using exactly `{project_id}` for a model or `{asset_id}` for an image; do not substitute task IDs, output indexes, filenames or local paths. Follow each result's `next_offset` until null when collecting **all** members. Both asset types can share a group; keep the user's requested model/image scope, and use `type:all` for a complete cross-type collection. Move at most 500 references per call. Any invalid member rejects that batch without partial writes.

These operations are local, scoped to the active Studio account, share persisted membership with the workbench, preserve the current preview and consume no credits. Complete an authorized grouping request directly; it does not need a generation quote or paid-task submission. Verify the requested outcome with group counts/member queries and report the returned group name and accepted member count; `assigned` includes members already in the destination. To show the asset page, use `tripo_open_workbench` with `view:assets` when helpful.

For concrete calls, merging, response fields, empty groups and error recovery, read [asset-group workflows](references/asset-groups.md). Renaming does not merge groups or alter task `character_name`. When continuing work after an asset-group rename, use the source `parent_task_id` and recorded task identity instead of copying its new asset display name into generation metadata.

## Character identity for new work

When creating character work, identify the **specific character identity** from the user's request and conversation, then include `character_name` in every creation/editing tool call. Use concise, consistent canonical names, e.g. `派蒙`, not an operation name (`建模`), profession (`法师`) or filename. Treat outfits, poses, views and technical stages of the same character as one group. Different characters use different names; do not split the same character by task kind.

If a character already has tasks, use `tripo_list_task_groups` to reuse its name. Supply `parent_task_id` when continuing from a specific plugin task; the service inherits that role and also follows exact recorded Studio project/image/motion IDs and downloaded local paths. A same-name explicit value preserves the source group's identity. `tripo_run_workflow` accepts `character_name` for the first task; subsequent steps inherit it, unless a step explicitly changes character. These fields are local metadata and never change Studio parameters, pricing or confirmation hashes.

For example, stage an image with `character_name:"派蒙"`; generate its model using the actual Studio image reference plus `parent_task_id:<image task id>`; continue remesh/texture/rig/export with that parent or its real project ID. Always use returned IDs, not invented examples. A batch containing several different characters should use separate per-character calls/workflows; a single task has one character group.

If context does not identify one character, omit the name: the task stays `未分组`, unless an exact source inherits a group or the description explicitly labels one name (`角色：派蒙`). Do not guess identity from generic prose, UUID filenames, or visual similarity. Mixed or ambiguous source groups need an explicit intended character. Grouping never requires a separate paid AI request.

Use `tripo_set_task_character` to correct an existing task (or `character_name:null` to ungroup it). It changes only local grouping; existing descendants keep their recorded group. For future continuations, pass the corrected task as `parent_task_id`. Identical live paid inputs in a different group return `TASK_GROUP_CONFLICT`: correct the existing task's group rather than dispatching duplicate work. Older tasks without group metadata remain ungrouped until corrected. See [character grouping](../../docs/CHARACTER_GROUPING_0_3_1.md).

## Choose the operation

- Credits: `tripo_get_payment` reads the wallet/plan; `tripo_quote_operation` estimates a specific operation and returns base credits, component costs, applied discount/free count, effective settings and dated source hashes. Model generation quotes require `tier`, `mode` and `face_limit`; omit paths/prompts for quote-only use except batch paths needed to count independent inputs (files are not read). Smart UV needs explicit `action` or a staged task. Rigging, animation, motion, image multiview/regeneration/splitting and texture-edit apply return unknown until their billing formulas are verified. Segmentation/part-generation campaigns expose base cost only. See [pricing quotes](../../docs/PRICING_QUOTES_2026-10-08.md) for review expiry and validation boundaries.

- Image generation/editing: `tripo_generate_image`; use `studio_references: [{asset_id, output_index}]` to edit an existing successful output directly. Combined local/Studio references ≤10. GPT Image 2.5 is `gpt_image_2.5_sunburst`. The general `midjourney` alias does not pin a release version.
- Four-view generation/re-roll: `tripo_generate_multiview` / `tripo_regenerate_image`. Existing-image transforms: `tripo_upscale_image` / `tripo_split_image` (automatic subject cutout). `tripo_crop_image` is a local explicit rectangle.
- 3D: `tripo_generate_model`. Real multiview uses fixed view fields or `studio_multiview`; `mode=batch` takes ≤30 independent images and produces independent models. Batch is not multiview fusion.
- Smart Mesh P2: `Nexus-v2.0-20260801`, quad default true, 500–25K faces, amount 1/2/4 and optional matching `face_limits`. P1 remains selectable with legacy limits.
- High Detail: explicit geometry quality, texture quality, `delight`, PBR and topology. For the star-maker configuration explicitly set `tier:high_detail`, `geometry_quality:standard`, `texture:true`, `texture_quality:detailed`, `delight:true`, `pbr:true`, `quad:false`, actual multiview inputs and a purpose-specific face budget. Do not silently fall back if capabilities are missing.
- Existing models: `tripo_import_model`, `tripo_segment_model`, `tripo_complete_parts`, `tripo_remesh_model`, `tripo_generate_texture`, Magic Brush preview/apply, upscale and PBR.
- Smart UV: `tripo_get_uv_context` → `tripo_generate_uv` → inspect/download candidate → `tripo_apply_uv`. Candidate generation does not replace the current model. Stale operator/context changes reject before submission.
- Rigging: `tripo_rig_model`, default V3 `v3.0-20260909`; humanoid skeleton presets actorcore/mixamo/unreal/vrm/unity. Select `rigging_type:other` for animal rigs; the precheck must identify a valid type.
- Preset animation: `tripo_list_animation_presets` / `tripo_animate_model`. AI animation: `tripo_generate_motion` (1–5 segments, each 1–10 seconds), then `tripo_apply_motion`. Optional [x,z] waypoints must connect. Find existing motion with `tripo_list_motions` / `tripo_get_motion`.
- Export: `tripo_export_model`, owned projects only; GLB/FBX/OBJ/USDZ/STL/3MF plus skeleton/animation/texture/UV/FBX settings. Always finish with `tripo_download` on the export task. It verifies actual texture sizes, locally downsamples oversized ZIP/GLB textures without upscaling, and records `texture_resolution` plus source/output hashes. Remote task success alone leaves `actual_texture_size_verified:false`. Source quality flags can be wrong for uploads; staging inspects actual GLB images. Live ZIP FBX 1K/2K/4K downloads and skeleton re-import passed. Embedded FBX or USDZ needing resizing is explicitly rejected; use ZIP FBX/OBJ or GLB. See [export resolution verification](../../docs/EXPORT_RESOLUTION_FIX_2026-10-08.md).
  Set `format` on `tripo_export_model`; `tripo_download` has no format argument and does not convert formats. Download the export task's `task_id`, not the original generation task or current `project_id`, to get the chosen format. ZIP packaging can return the model plus textures in `.zip`. Local Blender tools take self-contained GLB, including automatically decoded Meshopt input.
- Project capability check: `tripo_get_model` (capabilities are included by default); include parts or operator_detail as needed. There is no separate `tripo_project_capabilities` tool.

## Local editing chain

Local render/mesh/projection tools require Blender and a self-contained GLB. They preserve original files and run in background; never require a captured mouse.

1. `tripo_inspect_local_parts` returns names, polygon/triangle counts, UV and skinning, plus estimated per-part UV utilization (256x256 [0,1] tile union, not Studio's exact statistic).
2. `tripo_edit_parts` supports merge, hide, delete and split by imported face indices in a new GLB. Structural skinned edits are rejected. Inspect the result before importing a new Studio model.
3. `tripo_render_model` gives a 2x WebP and Three.js Y-up camera world matrix/FOV/viewport dimensions; retain the actual camera.
4. Send that viewport to `tripo_preview_texture_edit` or edit an image locally. UV strokes use `tripo_paint_texture`.
5. `tripo_bake_texture_projection` projects an edited 2x viewport to base-color per-part UV textures. Face-center ray casting approximates visibility; large triangles and complex materials require inspection. This is not exact Studio rendering.
6. `tripo_apply_texture_edits` takes the inspected per-part textures for an existing Studio project. Do not apply textures after geometry/UV changes without checking compatibility.

`tripo_run_workflow` shares the durable lifecycle, but defaults to `submit:true`, unlike individual creation tools. For a preview-only request, explicitly set `submit:false` and do not let a step override it. Dependent steps need a completed previous result; stage the first unresolved step separately instead of promising a complete frozen dependent workflow. Dependency flags copy previous project/motion/candidate/model/camera/textures; camera-copy does not supply the edited image. Signed URLs stay private and downloads use configured output roots.

## Results and provenance

Use returned asset/project/task IDs and actual part or preset names. Follow `next_offset` for model pages and `has_more` for image pages when the user requests all assets; the workbench's first-page list is not the full account library.

For a source/history question, read `tripo_get_task` with `include_events:true` and follow recorded `parent_task_id` links. Report frozen parameters, snapshots, hashes, remote IDs and downloads from the records. Use `workflow_id` to identify related recorded tasks when available; do not reconstruct missing history from the chat. Show downloaded images/renders through their actual local paths and link model files. Distinguish a rendered preview, a completed task, and an inspected asset.

Never claim disabled video-to-motion, future realtime mesh editing, full external edit history, or untested paid execution is supported/verified. Capability and validation boundaries are in [the capability record](../../docs/CAPABILITY_UPDATE_2026-10-08.md).
