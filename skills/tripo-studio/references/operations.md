# Operation workflows

Read the main skill for authentication, authorization, configuration waits, and task lineage before executing these workflows. Parameter schemas always come from the connected MCP server.

## Choose the operation

- Credits: `tripo_get_payment` reads the wallet/plan; `tripo_quote_operation` estimates a specific operation and returns base credits, component costs, applied discount/free count, effective settings and dated source hashes. Model generation quotes require `tier`, `mode` and `face_limit`; omit paths/prompts for quote-only use except batch paths needed to count independent inputs (files are not read). Smart UV needs explicit `action` or a staged task. Rigging, animation, motion, image multiview/regeneration/splitting and texture-edit apply return unknown until their billing formulas are verified. Segmentation/part-generation campaigns expose base cost only. See [pricing quotes](https://github.com/GrinZero/tripo-studio-plugin/blob/main/docs/PRICING_QUOTES_2026-10-08.md) for review expiry and validation boundaries.

- Image generation/editing: `tripo_generate_image`; use `studio_references: [{asset_id, output_index}]` to edit an existing successful output directly. Combined local/Studio references ≤10. GPT Image 2.5 is `gpt_image_2.5_sunburst`. The general `midjourney` alias does not pin a release version.
- Four-view generation/re-roll: `tripo_generate_multiview` / `tripo_regenerate_image`. Existing-image transforms: `tripo_upscale_image` / `tripo_split_image` (automatic subject cutout). `tripo_crop_image` is a local explicit rectangle.
- 3D: `tripo_generate_model`. Real multiview uses fixed view fields or `studio_multiview`; `mode=batch` takes ≤30 independent images and produces independent models. Batch is not multiview fusion.
- Smart Mesh P2: `Nexus-v2.0-20260801`, quad default true, 500–25K faces, amount 1/2/4 and optional matching `face_limits`. P1 remains selectable with legacy limits.
- Smart Mesh uses three separate stages: **untextured mesh → color textures → PBR maps**. `tripo_generate_model` produces a white/gray mesh, `tripo_generate_texture` adds color textures, and `tripo_generate_pbr` separately generates PBR maps on the same project. See the continuation rules below; color-texture success does not complete a request for PBR maps.
- If the user asks to add textures, remove lighting or add PBR to an existing model, reuse that model's `project_id` and retain its geometry. Do not call `tripo_generate_model` merely to enable those controls, change tiers silently, or treat generation-time settings as the current project's texture state. Regenerate geometry only when the user actually requests a new mesh.
- High Detail: explicit geometry quality, texture quality, `delight`, PBR and topology. For the star-maker configuration explicitly set `tier:high_detail`, `geometry_quality:standard`, `texture:true`, `texture_quality:detailed`, `delight:true`, `pbr:true`, `quad:false`, actual multiview inputs and a purpose-specific face budget. Do not silently fall back if capabilities are missing.
- Existing models: `tripo_import_model`, `tripo_segment_model`, `tripo_complete_parts`, `tripo_remesh_model`, `tripo_generate_texture`, Magic Brush preview/apply, upscale and PBR.
- Whole-model texturing: omit `part_names` or use `[]` with `tripo_generate_texture`; segmentation and part discovery are not prerequisites. Supply actual raw hierarchy names only for selected-part texturing. `tripo_get_model` with `include:["parts"]` reads both GLB and native Smart Mesh FBX names; never invent names to satisfy validation.
- Smart UV: `tripo_get_uv_context` → `tripo_generate_uv` → inspect/download candidate → `tripo_apply_uv`. Candidate generation does not replace the current model. Stale operator/context changes reject before submission.
- Rigging: `tripo_rig_model`, default V3 `v3.0-20260909`; humanoid skeleton presets actorcore/mixamo/unreal/vrm/unity. Select `rigging_type:other` for animal rigs; the precheck must identify a valid type.
- Preset animation: `tripo_list_animation_presets` / `tripo_animate_model`. AI animation: `tripo_generate_motion` (1–5 segments, each 1–10 seconds), then `tripo_apply_motion`. Optional [x,z] waypoints must connect. Find existing motion with `tripo_list_motions` / `tripo_get_motion`.
- Export: `tripo_export_model`, owned projects only; GLB/FBX/OBJ/USDZ/STL/3MF plus skeleton/animation/texture/UV/FBX settings. Always finish with `tripo_download` on the export task. It verifies actual texture sizes, locally downsamples oversized ZIP/GLB textures without upscaling, and records `texture_resolution` plus source/output hashes. Remote task success alone leaves `actual_texture_size_verified:false`. Source quality flags can be wrong for uploads; staging inspects actual GLB images. Live ZIP FBX 1K/2K/4K downloads and skeleton re-import passed. Embedded FBX or USDZ needing resizing is explicitly rejected; use ZIP FBX/OBJ or GLB. See [export resolution verification](https://github.com/GrinZero/tripo-studio-plugin/blob/main/docs/EXPORT_RESOLUTION_FIX_2026-10-08.md).
  Set `format` on `tripo_export_model`; `tripo_download` has no format argument and does not convert formats. Download the export task's `task_id`, not the original generation task or current `project_id`, to get the chosen format. ZIP packaging can return the model plus textures in `.zip`. Local Blender tools take self-contained GLB, including automatically decoded Meshopt input.
- Project capability check: `tripo_get_model` (capabilities are included by default); include parts or operator_detail as needed. There is no separate `tripo_project_capabilities` tool.

## Smart Mesh: white mesh → color textures → PBR maps

For a new Smart Mesh requested with textures and PBR, complete all three stages in order. Each stage is a separate operation with its own configuration form, task and cost; quote the requested stages and explain the sequence before starting. Wait for each task to succeed before creating its dependent stage, using actual returned IDs and `parent_task_id` for lineage.

1. **Generate the white mesh** — `tripo_generate_model` with `tier:smart_mesh` and the requested geometry settings. Omit `texture`, `texture_quality`, `texture_alignment`, `delight` and `pbr`, including false values: these controls do not apply during Smart Mesh generation. Success means the geometry is ready; it has no generated color textures or PBR maps yet.
2. **Generate color textures** — `tripo_generate_texture` on that mesh's returned `project_id`, using the approved reference images or prompt. Set `quality`, `alignment` and `delight` here; Remove Lighting is part of this color-texture step, not a separate generation stage. Omit `part_names` or use `[]` for the whole model. This operation adds color textures; it does **not** automatically generate the separate PBR map set.
3. **Generate PBR maps** — after color-texture success, call `tripo_generate_pbr` on the same project if PBR maps are part of the requested output. Do not regenerate the mesh or color textures to reach this step. Wait for PBR success, then export/download the resulting revision and verify its actual Normal, Roughness and Metallic channels (including packed channels). Do not claim a complete PBR map set from a preview, a color texture or material scalar factors alone.

For an existing Smart Mesh, read its latest state with `tripo_get_model` and consult the recorded tasks/artifacts, then resume at the first missing **requested** stage:

| Current state                                          | Next action for a request including PBR maps                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| White mesh, no color textures                          | Generate color textures, wait, then generate PBR maps.                      |
| Color textures already generated, PBR maps missing     | Call `tripo_generate_pbr` only; keep the existing mesh and color textures.  |
| PBR maps already generated and verified                | Export/download the existing result; do not create another generation task. |
| A required stage is running or has an uncertain result | Follow/reconcile that task before creating dependent or duplicate work.     |

Respect the requested scope: a white-mesh-only request ends after step 1; color textures only ends after step 2. A request to regenerate textures keeps the existing geometry and restarts at step 2; if PBR maps are also requested, generate them after the new color-texture task succeeds rather than treating maps from an earlier texture revision as the final result. If the user says color textures are already done and asks for PBR, proceed directly to step 3. Preserve cancellation: a canceled stage is not complete, and it must not be recreated without renewed user authorization.

Report progress as **white mesh ready**, **color textures ready; PBR maps pending**, or **PBR maps generated and verified**. A glTF/Blender PBR material using fixed roughness/metallic values is not the separate PBR map set. If a task succeeds but the downloaded channels cannot be verified, state that verification is still pending; do not rerun generation just to obtain evidence.

Texture quality inputs remain `standard` (2K), `detailed` (4K), and `ultra` (8K); the plugin maps public `ultra` to Studio's wire value `extreme`. After texture generation, upscaling, or PBR, inspect `task.result.texture_resolution`. Task `status:succeeded` describes remote execution only. Report 8K complete only when `actual_texture_size_verified:true` and `requested_texture_size_met:true`; `resolution_status:mismatch` means the actual textures missed the target, and `unverified` means resolution is still pending. Report actual per-image dimensions and warnings, preserve the existing artifact, and do not automatically repeat paid work to resolve a mismatch. PBR has no independent resolution input, so verify its actual channel dimensions against the user's request separately. Selected-part requests still need per-part artifact inspection.

## Local editing chain

Local render/mesh/projection tools require Blender and a self-contained GLB. They preserve original files and run in background; never require a captured mouse.

1. `tripo_inspect_local_parts` returns names, polygon/triangle counts, UV and skinning, plus estimated per-part UV utilization (256x256 [0,1] tile union, not Studio's exact statistic).
2. `tripo_edit_parts` supports merge, hide, delete and split by imported face indices in a new GLB. Structural skinned edits are rejected. Inspect the result before importing a new Studio model.
3. `tripo_render_model` gives a 2x WebP and Three.js Y-up camera world matrix/FOV/viewport dimensions; retain the actual camera.
4. Send that viewport to `tripo_preview_texture_edit` or edit an image locally. UV strokes use `tripo_paint_texture`.
5. `tripo_bake_texture_projection` projects an edited 2x viewport to base-color per-part UV textures. Face-center ray casting approximates visibility; large triangles and complex materials require inspection. This is not exact Studio rendering.
6. `tripo_apply_texture_edits` takes the inspected per-part textures for an existing Studio project. Do not apply textures after geometry/UV changes without checking compatibility.

Continue dependent work through the individual Agent-facing operation tools after the previous form submits and its task succeeds. Use the actual returned project, motion, UV candidate or local artifact IDs/paths and `parent_task_id` for lineage. `tripo_run_workflow` is app-only. Signed URLs stay private and downloads use configured output roots.
