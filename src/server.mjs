import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { OpenAIExtensions } from "@openai/mcp-extensions/server";
import { z } from "zod";
import { uvContext } from "./ops/studio-extras.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TripoError } from "./errors.mjs";
import { fail, ok } from "./mcp/result.mjs";
import { listAnimationPresets } from "./ops/animation-presets.mjs";
import { getOperation, operationCatalog } from "./ops/registry.mjs";
import { projectCapabilities } from "./ops/capabilities.mjs";
import { RECONCILE_CONFIRMATION, stripUrls } from "./ops/service.mjs";
import { createRuntime } from "./runtime.mjs";
import { downloadArtifact } from "./studio/downloader.mjs";
import { downloadResolvedArtifact } from "./studio/model-download.mjs";
import { prepareExportDownload } from "./studio/export-resolution.mjs";
import { localArtifact } from "./studio/local-artifacts.mjs";
import { glbNodeNames } from "./util/model-inspect.mjs";
import { SERVER_NAME, SERVER_VERSION, STUDIO_ORIGIN, WORKBENCH_RESOURCE_URI, RESULT_CARD_RESOURCE_URI } from "./constants.mjs";
import { createWorkbenchMedia, registerWorkbenchMedia } from "./ui/media.mjs";
import { ConfigurationReviews } from "./ui/reviews.mjs";
import { characterName, taskContextShape } from './ops/task-groups.mjs';
import { assetCharacterIndex, assetCharacterGroups, characterAssetPage } from './ops/asset-groups.mjs';
import { AssetLibrary } from './ui/asset-library.mjs';
import { applyAssetAssignments } from './store/asset-groups.mjs';
import { registerAssetGroupTools } from './ops/asset-group-tools.mjs';
import { modelGenerationMetadata } from './studio/model-metadata.mjs';

const identifier = z.string().regex(/^[^\s\u0000-\u001f\u007f]{1,256}$/);
const taskIdShape = z.string().uuid().describe("Plugin task id returned by any tripo_* creation tool.");

const OPERATION_TOOLS = {
  "image.generate": "tripo_generate_image",
  "image.multiview": "tripo_generate_multiview",
  "image.regenerate": "tripo_regenerate_image",
  "model.animate": "tripo_animate_model",
  "model.export": "tripo_export_model",
  "model.uv_generate": "tripo_generate_uv",
  "model.uv_apply": "tripo_apply_uv",
  "motion.generate": "tripo_generate_motion",
  "model.apply_motion": "tripo_apply_motion",
  "image.upscale": "tripo_upscale_image",
  "image.split": "tripo_split_image",
  "local.render": "tripo_render_model",
  "local.inspect_parts": "tripo_inspect_local_parts",
  "local.edit_parts": "tripo_edit_parts",
  "local.project_texture": "tripo_bake_texture_projection",
  "local.paint": "tripo_paint_texture",
  "local.crop": "tripo_crop_image",
  "model.complete_parts": "tripo_complete_parts",
  "model.generate": "tripo_generate_model",
  "model.import": "tripo_import_model",
  "model.remesh": "tripo_remesh_model",
  "model.rig": "tripo_rig_model",
  "model.segment": "tripo_segment_model",
  "texture.edit_apply": "tripo_apply_texture_edits",
  "texture.edit_preview": "tripo_preview_texture_edit",
  "texture.generate": "tripo_generate_texture",
  "texture.pbr": "tripo_generate_pbr",
  "texture.upscale": "tripo_upscale_texture"
};

async function main() {
  const runtime = await createRuntime();
  const { auth, config, gateway, service, session, store, pricing } = runtime;

  const icon = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "ui", "tripo-logo.png"));
  const icons = [{ src: `data:image/png;base64,${icon.toString("base64")}`, mimeType: "image/png", sizes: ["60x60"] }];
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION, icons });
  // SDK 1.32.1 registerTool omits icons from tools/list. Decorate the public
  // handler registration so the host receives the workbench's brand mark.
  const setRequestHandler = server.server.setRequestHandler.bind(server.server);
  server.server.setRequestHandler = (schema, handler) => setRequestHandler(schema, async (request, extra) => {
    const result = await handler(request, extra);
    if (request.method !== "tools/list") return result;
    return { ...result, tools: result.tools.map(tool => tool.name === "tripo_open_workbench" ? { ...tool, icons } : tool) };
  });
  new OpenAIExtensions(server);
  const media = createWorkbenchMedia(runtime);
  registerWorkbenchMedia(server, media);
  const assetLibrary = new AssetLibrary({...runtime,media});
  server.registerTool('tripo_ui_asset_library', {
    description:'Browse asset/group cards and persist multi-selected assets in a named local group. Group membership never submits Studio operations or consumes credits.',
    _meta:{ui:{visibility:['app']}},
    inputSchema:{action:z.enum(['list','assign']),type:z.enum(['models','images']).default('models'),filter:z.enum(['all','rigged','smart_mesh','textured','untextured']).default('all'),group_id:z.string().max(80).optional(),name:characterName.optional(),assets:z.array(z.union([z.object({project_id:identifier}).strict(),z.object({asset_id:identifier}).strict()])).min(1).max(500).optional(),offset:z.number().int().min(0).max(1e6).default(0),limit:z.number().int().min(1).max(100).default(20),search:z.string().max(1000).default(''),sort:z.enum(['recent','name']).default('recent'),refresh:z.boolean().default(false)}
  },async input=>{try{return ok(await (input.action==='list'?assetLibrary.list(input):assetLibrary.assign(input)));}catch(error){return fail(error);}});
  const reviews = new ConfigurationReviews({ ...runtime, media });
  await reviews.recover();
  server.registerTool("tripo_ui_review", {
    description: "Configuration card actions: acknowledge visible controls to start the 60-second window, pause editing, save and requote, confirm, cancel, or read status. Confirmation or the authorized deadline submits the durable task once.",
    _meta: { ui: { visibility: ["app"] } },
    inputSchema: { review_id: taskIdShape, action: z.enum(["get", "ready", "edit", "save", "confirm", "cancel", "preview"]), slot: z.string().max(100).optional(), revision: z.number().int().optional(), input: z.record(z.string(), z.unknown()).optional() }
  }, async input => { try { if(input.action==="preview") { const preview=await reviews.preview(input.review_id,input.slot);return {...ok({mime_type:preview.mime_type,bytes:preview.bytes}),_meta:{tripo:{preview}}}; } return ok(await reviews.action(input)); } catch (error) { return fail(error); } });

  // Data tools must not replace the user's current preview. Only creation
  // cards and the explicit presentation tool opt into a UI resource.
  const tool = (name, { card = false, ...meta }, handler) =>
    registerAppTool(server, name, { ...meta, _meta: { ui: { ...(card ? { resourceUri: RESULT_CARD_RESOURCE_URI } : {}), visibility: name === "tripo_auth_import" ? ["model"] : ["model", "app"] } } }, async (input) => {
      let result;
      try {
        result = await handler(input);
      } catch (error) {
        result = fail(error);
      }
      return { ...result, _meta: { ...result._meta, tripo: { ...result._meta?.tripo, tool_name: name, presentation: card ? "card" : "data" } } };
    });

  registerAssetGroupTools(tool,assetLibrary);

  // ---- Account / session -------------------------------------------------
  tool(
    "tripo_auth_login",
    {
      description:
        "Log into Tripo Studio. Reuses your existing browser session when one is valid; otherwise opens Tripo Studio once in your default browser and waits for sign-in. Afterwards everything runs headlessly — no browser stays open. headless_only=true only re-reads the browser session without opening anything.",
      inputSchema: { headless_only: z.boolean().optional() }
    },
    async ({ headless_only }) => {
      if (headless_only) {
        const refreshed = await auth.refresh();
        if (!refreshed) throw new TripoError("AUTH_REQUIRED", "No usable Tripo Studio session was found in the browser cookie store; run tripo_auth_login without headless_only to sign in.", { nextAction: "tripo_auth_login" });
        return ok({ refreshed: true, session: await session.status() });
      }
      const status = await auth.login();
      return ok({ session: status }, "Tripo Studio session captured; the plugin now works headlessly.");
    }
  );

  tool("tripo_auth_status", { description: "Report whether a usable Tripo Studio session exists (no credentials returned).", inputSchema: {} }, async () =>
    ok({ session: await session.status(), account_fingerprint: session.activeAccountFingerprint() })
  );

  tool(
    "tripo_auth_import",
    {
      description: "Import a Tripo Studio session cookie directly (ory_kratos_session value) — for machines without a browser. Validated against the API before it is stored.",
      inputSchema: { session_cookie: z.string().min(10).max(8192) }
    },
    async ({ session_cookie }) => ok({ session: await auth.importCookie(session_cookie) }, "Tripo Studio session imported and validated.")
  );

  tool("tripo_auth_logout", { description: "Clear the persisted Tripo session. The browser's own sign-in is untouched.", inputSchema: {} }, async () =>
    ok(await auth.logout())
  );

  tool("tripo_get_payment", { description: "Read-only Tripo account plan/credit summary (fields depend on Studio's response).", inputSchema: {} }, async () =>
    ok({ payment: await gateway.getPaymentSummary() })
  );

  // ---- Catalog / read ----------------------------------------------------
  tool(
    "tripo_list_models",
    {
      description: "List Studio model projects. Returns paging offsets, card metadata and url_available flags (never raw URLs).",
      inputSchema: {
        asset_scope: z.enum(["mine", "collected", "team"]).default("mine"),
        filter: z.enum(["all", "rigged", "smart_mesh", "textured", "untextured"]).default("all"),
        offset: z.number().int().min(0).max(1e6).default(0),
        character_group_id: z.string().max(80).optional().describe('Filter assets by a local character group before pagination; ungrouped selects assets without a recorded character.')
      }
    },
    async (input) => {
      const account = await session.accountFingerprint();
      const index = applyAssetAssignments(assetCharacterIndex(await store.list({limit:5000}),account),await assetLibrary.groupStore.read(account));
      const page = await characterAssetPage({
        characterGroupId:input.character_group_id, offset:input.offset,
        annotate:asset => ({...asset,character_group:index.get(`project_id:${asset.id}`) ?? null}),
        fetchPage:async offset => {
          const remote = await gateway.listModels({assetScope:input.asset_scope,filter:input.filter,offset});
          media.rememberProjects(remote.projects);
          const consumed = offset + remote.projects.length;
          return {...remote,items:remote.projects,next_offset:consumed < remote.total && remote.projects.length ? consumed : null};
        }
      });
      return ok({
        asset_scope: input.asset_scope,
        filter: input.filter,
        max_assets: page.max_assets,
        character_groups: assetCharacterGroups(index),
        models: page.items.map((asset) => ({
          ...modelGenerationMetadata(asset),
          character_group: asset.character_group,
          collected: asset.collected === true,
          content_warning: asset.is_nsfw === true || ["nsfw", "sensitive"].includes((asset.content_risk_level ?? "").toLowerCase()),
          created_at: asset.create_time ?? null,
          description: asset.biz_info?.short_description ?? null,
          is_owner: asset.is_owner === true,
          name: asset.project_name ?? asset.biz_info?.short_description ?? asset.id,
          open_path: `/workspace/generate/${encodeURIComponent(asset.id)}`,
          page_offset: input.offset,
          project_id: asset.id,
          running: asset.running_operator !== undefined && asset.running_operator !== null,
          source_type: asset.type ?? null,
          thumbnail_available: Boolean(asset.cover_image?.[0] || asset.cover_image_object?.[0]?.url),
          visibility: asset.visibility ?? null
        })),
        next_offset: page.next_offset,
        offset: input.offset,
        page_size: 20,
        total: page.total
      });
    }
  );

  tool(
    "tripo_get_model",
    {
      description:
        "Project detail for one Studio model: capability flags (textured/segmented/rigged/rig_type/…), optional animation presets, and optional GLB part names. include: capabilities (default), animation_presets, parts, operator_detail.",
      inputSchema: {
        include: z.array(z.enum(["capabilities", "animation_presets", "parts", "operator_detail"])).default(["capabilities"]),
        project_id: identifier
      }
    },
    async (input) => {
      const detail = await gateway.getProject(input.project_id);
      if (detail.id && detail.id !== input.project_id) {
        throw new TripoError("INSUFFICIENT_EVIDENCE", "Tripo returned a different project than requested.", { stage: "project" });
      }
      const capabilities = projectCapabilities(input.project_id, detail);
      const out = {
        capabilities,
        model_url_available: Boolean(detail.model_url),
        project_id: input.project_id,
        project_name: detail.project_name ?? null,
        remote_status: detail.status ?? null,
        visibility: detail.visibility ?? null
      };
      if (input.include.includes("animation_presets")) {
        out.animation_presets = capabilities.rig_type ? listAnimationPresets({ rigType: capabilities.rig_type }) : listAnimationPresets();
      }
      if (input.include.includes("operator_detail")) {
        out.operator_detail = stripUrls(detail.operator ?? {});
      }
      if (input.include.includes("parts")) {
        out.parts = await loadPartNames(config, gateway, input.project_id, detail);
      }
      return ok(out);
    }
  );

  tool(
    "tripo_list_image_assets",
    { description: "List Studio image assets including generation, multiview, upscale and subject split results, with local character groups.", inputSchema: { page_num: z.number().int().min(1).max(1e5).default(1), page_size: z.number().int().min(1).max(100).default(20), character_group_id:z.string().max(80).optional().describe('Filter assets by character before pagination; ungrouped selects assets without a recorded character.') } },
    async (input) => {
      const account = await session.accountFingerprint();
      const index = applyAssetAssignments(assetCharacterIndex(await store.list({limit:5000}),account),await assetLibrary.groupStore.read(account));
      const page = await characterAssetPage({
        characterGroupId:input.character_group_id,offset:(input.page_num-1)*input.page_size,limit:input.page_size,
        annotate:asset => ({...asset,character_group:index.get(`asset_id:${asset.asset_id}`) ?? null}),
        fetchPage:async offset => {
          const remote = await gateway.listStudioImageAssets(Math.floor(offset/input.page_size)+1,input.page_size);
          return {items:remote.assets,next_offset:remote.assets.length >= input.page_size ? offset+input.page_size : null};
        }
      });
      return ok({
        character_groups: assetCharacterGroups(index),
        assets: page.items.map((asset) => ({
          character_group: asset.character_group,
          asset_id: asset.asset_id,
          created_at: asset.create_time ?? null,
          input: {
            model_version: asset.input.model_version ?? null,
            prompt: typeof asset.input.prompt === "string" ? asset.input.prompt.slice(0, 1000) : asset.input.prompt_text?.slice(0, 1000) ?? null
          },
          output_count: asset.output.data.length,
          outputs: asset.output.data.map((output, index) => ({ content_warning: ["sensitive", "nsfw"].includes(output.image_audit_result ?? ""), index })),
          status: asset.status,
          type: asset.type
        })),
        has_more: page.next_offset !== null,
        page_num: input.page_num,
        page_size: input.page_size
      });
    }
  );

  tool(
    "tripo_get_image_asset",
    { description: "One Studio image asset with its output slots (urls resolvable via tripo_download).", inputSchema: { asset_id: identifier } },
    async ({ asset_id }) => {
      const asset = await gateway.getStudioImageAsset(asset_id);
      return ok({
        asset_id: asset.asset_id,
        input: stripUrls(asset.input),
        outputs: asset.output.data.map((output, index) => ({
          content_warning: ["sensitive", "nsfw"].includes(output.image_audit_result ?? ""),
          index,
          url_available: Boolean(output.url)
        })),
        status: asset.status,
        type: asset.type
      });
    }
  );

  tool(
    "tripo_list_image_templates",
    { description: "Studio image-generation templates (style presets) with tags/categories.", inputSchema: { category: z.string().optional(), query: z.string().optional() } },
    async (input) => {
      const response = await gateway.listStudioImageTemplates();
      const category = input.category?.trim().toLowerCase();
      const query = input.query?.trim().toLowerCase();
      const templates = response.templates.filter((template) => {
        const tags = template.tag.map((tag) => tag.toLowerCase());
        if (category && category !== "all" && !tags.includes(category)) return false;
        if (query && !`${template.title}\n${template.description ?? ""}\n${template.tag.join("\n")}`.toLowerCase().includes(query)) return false;
        return true;
      });
      return ok({
        categories: [...new Set(response.templates.flatMap((t) => t.tag))].sort(),
        templates: templates.map((template) => ({
          description: template.description ?? null,
          has_preview: Boolean(typeof template.image === "string" ? template.image : template.image?.[0]),
          tags: template.tag,
          template_id: template.template_id,
          title: template.title
        }))
      });
    }
  );

  tool(
    "tripo_list_animation_presets",
    { description: "Studio animation retarget presets (preset:<rig_type>:<name>).", inputSchema: { query: z.string().optional(), rig_type: z.string().optional() } },
    async (input) => ok({ presets: listAnimationPresets({ query: input.query, rigType: input.rig_type }) })
  );

  tool("tripo_list_operations", { description: "Capability catalog: available operation kinds, descriptions and credit flags. Input schemas are in each registered tool definition.", inputSchema: {} }, async () =>
    ok({ operations: operationCatalog(), session: await session.status() })
  );

  tool("tripo_quote_operation", {
    description: "Read-only credit estimate from reviewed official frontend rules and live member discounts/free quotas. Give kind + cost-related input (IDs/prompts/paths can be omitted), or task_id to quote frozen parameters. No upload, staging or paid request. Returns unknown for unverified billing; this is not a server billing guarantee. Model generation requires tier, mode and face_limit. Smart UV needs action or a staged task.",
    inputSchema: { kind: z.enum(Object.keys(OPERATION_TOOLS)).optional(), input: z.record(z.string(), z.unknown()).optional(), task_id: taskIdShape.optional(), refresh: z.boolean().default(false) }
  }, async ({ kind, input, task_id, refresh }) => {
    if (task_id !== undefined) {
      if (kind !== undefined || input !== undefined) throw new TripoError("INVALID_INPUT", "Use task_id alone, or kind + input.");
      const task = await store.get(task_id);
      const fingerprint = getOperation(task.kind).category === "local" ? "local" : await session.accountFingerprint();
      if (task.account_fingerprint !== fingerprint) throw new TripoError("INVALID_INPUT", "Task belongs to another account.");
      return ok({ quote: await pricing.quote(task.kind, {}, { task, refresh }), task_id, request_hash: task.request_hash });
    }
    if (!kind) throw new TripoError("INVALID_INPUT", "Specify kind or task_id.");
    return ok({ quote: await pricing.quote(kind, input ?? {}, { refresh }) });
  });

  // ---- Operation tools (shared registry) ---------------------------------
  for (const [kind, toolName] of Object.entries(OPERATION_TOOLS)) {
    const operation = getOperation(kind);
    tool(
      toolName,
      {
        card: kind !== "local.inspect_parts",
        description: `${operation.description}${operation.consumesCredits ? " Consumes Studio credits." : ""} AI: supply character_name from the user's context for character work; reuse canonical names or parent_task_id across follow-up operations for automatic UI grouping.`,
        inputSchema: { ...operation.inputShape, ...taskContextShape, review: z.boolean().default(true).describe("Render an editable configuration card; auto-submit 60 seconds after the card is displayed unless editing or canceled. Set false only for draft-only/workbench flows.") }
      },
      async (input) => {
        const { review, ...operationInput } = input;
        const prepared = await service.prepare(kind, operationInput);
        const result = review !== false && prepared.task.status === "staged" ? await reviews.create(kind, operationInput, prepared) : prepared;
        return ok(result, result.review ? "配置卡片已准备就绪：可修改、确认或取消；60 秒后自动提交，编辑时暂停。" : `${toolName} → task ${prepared.task.task_id} (${prepared.task.status})${prepared.deduplicated ? " [deduplicated]" : ""}`);
      }
    );
  }

  // ---- Task management ----------------------------------------------------
  tool(
    "tripo_submit_task",
    {
      description: "Dispatch a previously staged task to Studio. Requires the exact confirmation string returned at staging; the paid write crosses the durable boundary exactly once.",
      inputSchema: { confirmation: z.string(), request_hash: z.string().length(64).optional(), task_id: taskIdShape }
    },
    async (input) => ok(await service.submit(input.task_id, { confirmation: input.confirmation, requestHash: input.request_hash }))
  );

  tool("tripo_task_sync", { description: "Refresh one task's remote progress/status from Studio.", inputSchema: { task_id: taskIdShape } }, async (input) =>
    ok(await service.sync(input.task_id))
  );

  tool(
    "tripo_task_wait",
    {
      description: "Poll a task until it reaches a terminal state or the timeout elapses.",
      inputSchema: { poll_seconds: z.number().min(1).max(120).default(5), task_id: taskIdShape, timeout_seconds: z.number().min(1).max(3600).default(300) }
    },
    async (input) => ok(await service.wait(input.task_id, input.timeout_seconds, input.poll_seconds))
  );

  tool("tripo_task_cancel", { description: "Cancel a staged (never-submitted) task. Already-submitted remote work cannot be withdrawn.", inputSchema: { task_id: taskIdShape } }, async (input) =>
    ok(await service.cancel(input.task_id))
  );

  tool(
    "tripo_task_reconcile",
    {
      description: `Adopt confirmed remote IDs into an outcome_unknown task (Studio Studio UI lists operator/asset ids). Requires confirmation "${RECONCILE_CONFIRMATION}".`,
      inputSchema: {
        confirmation: z.string(),
        remote: z.object({ motion_task_id: identifier.optional(), asset_id: identifier.optional(), operator_id: identifier.optional(), operator_ids: z.array(identifier).min(1).max(120).optional(), project_ids: z.array(identifier.nullable()).min(1).max(120).optional(), project_id: identifier.optional() }).strict(),
        task_id: taskIdShape
      }
    },
    async (input) => ok(await service.reconcile(input.task_id, input))
  );

  tool(
    "tripo_list_tasks",
    {
      description: "List plugin tasks (optionally filtered). Newest first.",
      inputSchema: { character_group_id:z.string().max(80).optional().describe('Use an id from tripo_list_task_groups, or ungrouped. Filter is applied before pagination.'),kind: z.string().optional(), limit: z.number().int().min(1).max(200).default(50), offset: z.number().int().min(0).max(5000).default(0), status: z.string().optional(), statuses: z.array(z.string()).min(1).max(12).optional() }
    },
    async (input) => ok(await service.list(input))
  );

  tool('tripo_list_task_groups',{description:'Read character groups and full retained task counts (up to 5000 tasks), optionally filtered by status. Use these names/ids to reuse existing character identities; grouping does not consume credits.',inputSchema:{statuses:z.array(z.string()).min(1).max(12).optional()}},async input=>ok(await service.listGroups(input)));
  tool('tripo_set_task_character',{description:'Correct one existing task\'s local character group without changing frozen Studio inputs, request hash, confirmation or dispatch. character_name:null moves it to ungrouped. Existing descendants are unchanged; future tasks inherit the corrected group.',inputSchema:{task_id:taskIdShape,character_name:characterName.nullable()}},async input=>ok(await service.setCharacter(input.task_id,input.character_name)));

  tool(
    "tripo_get_task",
    {
      description: "Full public view of one task: status, frozen snapshot summary, remote ids, result, error and (optionally) the event log.",
      inputSchema: { include_events: z.boolean().default(false), task_id: taskIdShape }
    },
    async (input) => {
      const result = await service.get(input.task_id);
      return ok(input.include_events ? result : { task: result.task });
    }
  );

  tool("tripo_show_result", {
    card: true,
    description: "Show a task, Studio model/image, or saved GLB/image in a persistent result preview card. Use once when presenting a completed artifact if no creation card is already following that task, or when the user asks to view an existing result. Background get/list/sync/wait/quote/download tools return data only and must not be followed by repeated presentation calls for the same artifact. Does not submit generation or consume credits.",
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      task_id: taskIdShape.optional(), project_id: identifier.optional(), asset_id: identifier.optional(),
      local_path: z.string().optional().describe("Saved GLB, PNG, JPEG or WebP inside an allowed output root."),
      output_index: z.number().int().min(0).max(119).default(0)
    }
  }, async input => {
    if ([input.task_id, input.project_id, input.asset_id, input.local_path].filter(Boolean).length !== 1)
      throw new TripoError("INVALID_INPUT", "Provide exactly one of task_id, project_id, asset_id, or local_path.");
    let data, preview;
    if (input.task_id) {
      data = { task: (await service.get(input.task_id)).task };
      preview = { task_id: input.task_id, type: data.task.kind.startsWith("image.") || ["local.render", "local.crop", "local.paint", "local.project_texture"].includes(data.task.kind) ? "image" : "model", output_index: input.output_index };
    } else if (input.project_id) {
      const detail = await gateway.getProject(input.project_id);
      if (detail.id && detail.id !== input.project_id) throw new TripoError("INSUFFICIENT_EVIDENCE", "Tripo returned a different project than requested.");
      data = { project_id: input.project_id, project_name: detail.project_name ?? null };
      preview = { project_id: input.project_id, type: "model" };
    } else if (input.asset_id) {
      const asset = await gateway.getStudioImageAsset(input.asset_id);
      data = { asset_id: input.asset_id, status: asset.status };
      preview = { asset_id: input.asset_id, type: "image", output_index: input.output_index };
    } else {
      const extension = path.extname(input.local_path).toLowerCase();
      if (![".glb", ".png", ".jpg", ".jpeg", ".webp"].includes(extension)) throw new TripoError("INVALID_INPUT", "Only saved GLB, PNG, JPEG or WebP files can be previewed.");
      preview = { local_path: input.local_path, type: extension === ".glb" ? "model" : "image" };
      // Validate containment and the actual file before opening a local preview.
      await media.preview(preview);
      data = { download: { path: input.local_path } };
    }
    return ok({ ...data, preview_target: preview }, "产物预览已准备就绪。");
  });

  tool("tripo_list_motions", { description: "List generated motion assets and active motion tasks; URLs remain private.", inputSchema: {} }, async () => ok(stripUrls(await gateway.listMotionAssets())));
  tool("tripo_get_motion", { description: "Inspect a generated motion asset (use tripo_download motion_asset_id to download).", inputSchema: { motion_asset_id: identifier } }, async (input) => ok(stripUrls(await gateway.getMotionAsset(input.motion_asset_id))));
  tool("tripo_get_uv_context", { description: "Read Smart UV candidates, current operator, next action and running task without submitting.", inputSchema: { project_id: identifier } }, async (input) => ok(stripUrls((await uvContext(runtime, input.project_id)).context)));

  // ---- Downloads ----------------------------------------------------------
  tool(
    "tripo_download",
    {
      description:
        "Save remote model/image/motion/export/UV artifacts, or copy local render/paint/bake outputs into an allowed output root. GLB downloads retain the source at path and return blender_path for an automatically Meshopt-decoded copy when needed. Choose GLB/FBX/OBJ/USDZ/STL/3MF with tripo_export_model format first, then download its task_id; download has no format conversion parameter. Signed URLs stay private; output_index selects batch models, images or baked part textures.",
      inputSchema: {
        asset_id: identifier.optional().describe("Studio image asset id (alternative to task_id/project_id)."),
        motion_asset_id: identifier.optional(),
        artifact: z.enum(["model", "uv_layout", "image", "render", "texture"]).default("model"),
        output_index: z.number().int().min(0).max(119).optional(),
        path: z.string().optional().describe("Absolute destination path inside an allowed output root; default: <asset_root>/downloads/."),
        project_id: identifier.optional().describe("Studio project id; downloads its current model."),
        task_id: taskIdShape.optional()
      }
    },
    async (input) => {
      const resolved = await resolveDownloadTarget(runtime, input);
      const downloaded = await downloadResolvedArtifact(config, resolved, input.path);
      if (input.task_id) {
        await store
          .update(input.task_id, (record) => {
            if (resolved.verification) record.result = { ...record.result, ...resolved.verification, export_model_path: resolved.localPath };
            record.downloads.push({ ...downloaded, output_index: input.output_index ?? 0, artifact: input.artifact, at: new Date().toISOString(), name: resolved.defaultName });
            record.events.push({ at: new Date().toISOString(), detail: { bytes: downloaded.bytes, name: resolved.defaultName }, type: "download.completed" });
            return record;
          })
          .catch(() => {});
      }
      return ok({ download: downloaded, source: resolved.source, ...(resolved.verification ? { texture_resolution: resolved.verification } : {}) });
    }
  );

  // ---- Workflow (shared operation path) -----------------------------------
  tool(
    "tripo_run_workflow",
    {
      description:
        "Chain up to eight operations through the shared durable lifecycle. Copy previous project, motion asset, UV candidate, local model, render camera or baked textures with the corresponding *_from_previous flags. wait_between waits for success before dependencies.",
      inputSchema: {
        steps: z
          .array(
            z
              .object({
                input: z.record(z.string(), z.unknown()).default({}),
                operation: z.enum(Object.keys(OPERATION_TOOLS)),
                project_id_from_previous: z.boolean().optional(),
                motion_asset_id_from_previous: z.boolean().optional(),
                candidate_operator_id_from_previous: z.boolean().optional(),
                model_path_from_previous: z.boolean().optional(),
                render_from_previous: z.boolean().optional(),
                textures_from_previous: z.boolean().optional(),
                submit: z.boolean().optional()
              })
              .strict()
          )
          .min(1)
          .max(8),
        submit: z.boolean().default(true).describe("Execute each reached step; only operations marked consumes_credits are billed."),
        ...taskContextShape,
        wait_between: z.boolean().default(true),
        workflow_name: z.string().max(120).optional()
      }
    },
    async (input) => {
      const workflowId = crypto.randomUUID();
      const tasks = [];
      let previous;
      for (const [index, step] of input.steps.entries()) {
        const stepInput = { ...step.input };
        const result = previous?.task.result;
        const requireResult = (field) => { if (!result?.[field]) throw new TripoError("STAGING_REQUIRED", `Previous step has no ${field}; wait for it to succeed before chaining.`); return result[field]; };
        if (step.project_id_from_previous) stepInput.project_id = requireResult("project_id");
        if (step.motion_asset_id_from_previous) stepInput.motion_asset_id = requireResult("motion_asset_id");
        if (step.candidate_operator_id_from_previous) stepInput.candidate_operator_id = requireResult("candidate_operator_id");
        if (step.model_path_from_previous) stepInput.model_path = requireResult("model_path");
        if (step.textures_from_previous) stepInput.textures = requireResult("textures");
        if (step.render_from_previous) for (const field of ["camera_matrix", "fov_degrees", "viewport_width", "viewport_height"]) stepInput[field] = requireResult(field);
        stepInput.submit = (step.submit ?? input.submit) && !(step.project_id_from_previous && !previous);
        const prepared = await service.prepare(step.operation, stepInput, { parentTaskId: previous?.task.task_id ?? input.parent_task_id, workflowId, characterName:previous ? undefined : input.character_name });
        tasks.push({ operation: step.operation, step: index, task: prepared.task });
        previous = prepared;
        if (input.wait_between && !["staged", "succeeded"].includes(prepared.task.status)) {
          const waited = await service.wait(prepared.task.task_id, 1800, 10);
          previous = { task: waited.task };
          tasks[tasks.length - 1].task = waited.task;
          if (!["succeeded"].includes(waited.task.status)) break;
        }
      }
      return ok({ tasks, workflow_id: workflowId });
    }
  );

  tool(
    "tripo_open_in_studio",
    { description: "Return the Studio workspace deep link for a project (open it in any browser).", inputSchema: { project_id: identifier.optional() } },
    async (input) => ok({ url: `${STUDIO_ORIGIN}/workspace/generate${input.project_id ? `/${encodeURIComponent(input.project_id)}` : ""}` })
  );

  // ---- Workbench UI resource ----------------------------------------------
  const workbenchPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "ui", "workbench.html");
  const workbenchScript = path.join(path.dirname(workbenchPath), "..", "dist", "workbench.js");
  registerAppTool(server, "tripo_open_workbench", {
    title: "Tripo 工作台",
    description: "打开 Tripo 工作台：从侧边栏查看模型、图片与持久任务，或在对话旁继续处理指定项目/任务。只打开界面，不提交生成或消耗积分。",
    inputSchema: { view: z.enum(["assets", "tasks", "create"]).default("assets"), project_id: identifier.optional(), task_id: taskIdShape.optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    icons,
    _meta: { ui: { resourceUri: WORKBENCH_RESOURCE_URI, visibility: ["model", "app"] }, "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] } }
  }, async (input) => ok({ ...input, session: await session.status() }, "Tripo 工作台已准备就绪。"));
  const uiMeta = {
    ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: ["data:", "blob:"] } },
    "openai/ui": { preferredDisplayMode: "fullscreen", availableDisplayModes: ["fullscreen", "inline"] }
  };
  registerAppResource(
    server,
    "workbench",
    WORKBENCH_RESOURCE_URI,
    { description: "Tripo 工作台：侧边栏应用与对话面板。", mimeType: RESOURCE_MIME_TYPE, _meta: uiMeta },
    async () => {
      const [html, script] = await Promise.all([readFile(workbenchPath, "utf8"), readFile(workbenchScript, "utf8")]);
      return { contents: [{ mimeType: RESOURCE_MIME_TYPE, text: html.replace("<!-- WORKBENCH_SCRIPT -->", () => `<script>${script.replace(/<\/script/gi, "<\\/script")}</script>`), uri: WORKBENCH_RESOURCE_URI, _meta: uiMeta }] };
    }
  );

  const cardMeta = {
    ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: ["data:", "blob:"] } },
    "openai/ui": { preferredDisplayMode: "inline", availableDisplayModes: ["inline"] }
  };
  registerAppResource(server, "result-card", RESULT_CARD_RESOURCE_URI,
    { description: "Tripo 工具结果卡片：任务状态、图片与模型预览。", mimeType: RESOURCE_MIME_TYPE, _meta: cardMeta },
    async () => {
      const [html, script] = await Promise.all([
        readFile(path.join(path.dirname(workbenchPath), "result-card.html"), "utf8"),
        readFile(path.join(path.dirname(workbenchScript), "result-card.js"), "utf8")
      ]);
      return { contents: [{ uri: RESULT_CARD_RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE,
        text: html.replace("<!-- CARD_SCRIPT -->", () => `<script>${script.replace(/<\/script/gi, "<\\/script")}</script>`), _meta: cardMeta }] };
    });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] ready (recovered ${runtime.recovered} interrupted task(s))`);
}

// Resolve a signed URL for a download without exposing it in any result.
async function resolveDownloadTarget(runtime, input) {
  const { gateway, store } = runtime;
  const count = [input.task_id, input.project_id, input.asset_id, input.motion_asset_id].filter(Boolean).length;
  if (count !== 1) throw new TripoError("INVALID_INPUT", "Provide exactly one of task_id, project_id, asset_id, or motion_asset_id.", { stage: "download" });
  if (input.motion_asset_id) {
    const asset = await gateway.getMotionAsset(input.motion_asset_id);
    return { defaultName: `${input.motion_asset_id}-motion.glb`, source: { motion_asset_id: input.motion_asset_id }, url: asset.motion_url };
  }
  if (input.asset_id) {
    const asset = await gateway.getStudioImageAsset(input.asset_id);
    const index = input.output_index ?? 0;
    const output = asset.output.data[index];
    if (asset.status !== "success" || !output?.url) {
      throw new TripoError("INSUFFICIENT_EVIDENCE", "The image asset has no completed output at that index.", { stage: "download" });
    }
    return { defaultName: `${input.asset_id}-${index}.png`, source: { asset_id: input.asset_id, output_index: index }, url: output.url };
  }
  if (input.project_id) {
    const detail = await gateway.getProject(input.project_id);
    if (!detail.model_url) throw new TripoError("INSUFFICIENT_EVIDENCE", "This project has no downloadable model artifact yet.", { stage: "download" });
    return { defaultName: `${input.project_id}.glb`, source: { project_id: input.project_id }, url: detail.model_url };
  }
  const record = await store.get(input.task_id);
  if (record.status !== "succeeded" && !(record.result?.models?.[input.output_index ?? 0]?.status === "succeeded")) {
    throw new TripoError("STAGING_REQUIRED", `Task ${input.task_id} is ${record.status}, not succeeded.`, { stage: "download" });
  }
  if (record.kind.startsWith("local.")) {
    const localPath = localArtifact(record, input.artifact, input.output_index ?? 0);
    return { localPath, defaultName: path.basename(localPath), source: { task_id: record.task_id, artifact: input.artifact, output_index: input.output_index ?? 0 } };
  }
  if (record.result?.export_url) {
    return prepareExportDownload(runtime, record);
  }
  if (record.result?.motion_asset_id) {
    const asset = await gateway.getMotionAsset(record.result.motion_asset_id);
    return { defaultName: `${asset.asset_id}-motion.glb`, source: { task_id: record.task_id }, url: asset.motion_url };
  }
  if (record.kind === "model.uv_generate") {
    const context = await gateway.getUvContext({ project_id: record.payload.project_id, current_operator_id: record.payload.current_operator_id });
    const candidate = context.candidates.find((item) => item.operator_id === record.result.candidate_operator_id);
    const url = input.artifact === "uv_layout" ? candidate?.uv_layout.url : candidate?.model.url;
    if (!url) throw new TripoError("INSUFFICIENT_EVIDENCE", "UV candidate artifact is unavailable.");
    return { defaultName: `${record.task_id}.${input.artifact === "uv_layout" ? "png" : "glb"}`, source: { task_id: record.task_id, artifact: input.artifact }, url };
  }
  if (record.result?.models) {
    const model = record.result.models[input.output_index ?? 0];
    if (!model?.project_id || model.status !== "succeeded") throw new TripoError("INSUFFICIENT_EVIDENCE", "Selected model output is unavailable.");
    const detail = await gateway.getProject(model.project_id, model.operator_id);
    if (!detail.model_url) throw new TripoError("INSUFFICIENT_EVIDENCE", "Selected model output has no artifact.");
    return { defaultName: `${model.project_id}.glb`, source: { task_id: record.task_id, project_id: model.project_id, output_index: model.output_index }, url: detail.model_url };
  }
  // Image-asset tasks: resolve fresh output URLs from the asset.
  if (record.remote?.asset_id) {
    const asset = await gateway.getStudioImageAsset(record.remote.asset_id);
    const index = input.output_index ?? 0;
    const output = asset.output.data[index];
    if (!output?.url) throw new TripoError("INSUFFICIENT_EVIDENCE", "The task output index has no downloadable artifact.", { stage: "download" });
    return { defaultName: `${record.remote.asset_id}-${index}.png`, source: { asset_id: record.remote.asset_id, output_index: index, task_id: record.task_id }, url: output.url };
  }
  // Retarget results live under project.operator; prefer the recorded artifact.
  const animationUrl = record.result?.animation_model_url;
  if (animationUrl) {
    return { defaultName: `${record.task_id}-animation.glb`, source: { task_id: record.task_id }, url: animationUrl };
  }
  const projectId = record.result?.project_id ?? record.remote?.project_id;
  if (!projectId) throw new TripoError("INSUFFICIENT_EVIDENCE", "The task has no downloadable project artifact.", { stage: "download" });
  const detail = await gateway.getProject(projectId, record.remote?.operator_id);
  if (!detail.model_url) throw new TripoError("INSUFFICIENT_EVIDENCE", "The project has no downloadable model artifact.", { stage: "download" });
  return { defaultName: `${projectId}.glb`, source: { project_id: projectId, task_id: record.task_id }, url: detail.model_url };
}

// GLB part names: download the model into a private cache (bounded), extract
// node names. Part names feed model.complete_parts / remesh / texture ops.
async function loadPartNames(config, gateway, projectId, detail) {
  if (!detail.model_url) throw new TripoError("INSUFFICIENT_EVIDENCE", "The project has no downloadable GLB to inspect.", { stage: "parts" });
  const cacheDir = path.join(config.dataDir, "model-cache");
  const target = path.join(cacheDir, `${projectId}.glb`);
  const downloaded = await downloadArtifact({ ...config, outputRoots: [path.join(config.dataDir, "model-cache")] }, detail.model_url, target, `${projectId}.glb`);
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(downloaded.path);
  const names = glbNodeNames(bytes);
  return { part_names: names.slice(0, 500), truncated: names.length > 500 };
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal:`, error);
  process.exitCode = 1;
});
