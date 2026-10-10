import { z } from "zod";
import { TripoError } from "../errors.mjs";
import {
  HIGH_DETAIL_MODEL_VERSIONS,
  NEXUS_MAX_FACES,
  NEXUS_MIN_FACES,
  NEXUS_MODEL_VERSION,
  NEXUS_V2_MODEL_VERSION,
  SMART_MESH_MODEL_VERSIONS,
  TEXT_IMAGE_MODEL_VERSION
} from "../constants.mjs";
import { pendingInputWire, stageLocalImage, stageLocalModelFile } from "./images.mjs";
import { assertLocalPathSpecifier } from "../security/path-policy.mjs";
import { inspectModel } from "../util/model-inspect.mjs";

const identifier = z.string().regex(/^[^\s\u0000-\u001f\u007f]{1,256}$/);
const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const generationSettingsShape = {
  delight: z.boolean().optional().describe("Remove lighting from generated textures; independent of PBR."),
  amount: z.union([z.literal(1), z.literal(2), z.literal(4)]).optional().describe("Smart Mesh variants per input; default 1."),
  face_limits: z.array(z.number().int()).min(1).max(4).optional().describe("Smart Mesh per-variant budgets; length must match amount."),
  allow_sensitive: z.boolean().optional().describe("Permit a Studio image output marked 'sensitive' as an input."),
  enable_image_autofix: z.boolean().optional().describe("Studio image auto-fix (single-image or batch high_detail only)."),
  face_limit: z.number().int().describe("Target face budget. Bounds depend on tier/options."),
  generate_parts: z.boolean().optional().describe("Generate segmented parts (high_detail)."),
  geometry_quality: z.enum(["standard", "detailed"]).optional().describe("v3.1-20260211 only."),
  model_version: z.enum([...HIGH_DETAIL_MODEL_VERSIONS, ...SMART_MESH_MODEL_VERSIONS]).optional().describe("Tier-specific version; defaults H3.1 or P2.0."),
  pbr: z.boolean().optional().describe("Generate PBR maps; requires texture=true. Defaults true when texture enabled."),
  quad: z.boolean().optional().describe("Quad-dominant topology; default true for Smart Mesh P2, false for high_detail."),
  segmentation_granularity: z.enum(["coarse", "balanced", "fine"]).optional(),
  smart_poly: z.boolean().optional().describe("Smart Poly low-poly mode (high_detail)."),
  texture: z.boolean().optional().describe("Generate textures (high_detail)."),
  texture_alignment: z.enum(["original_image", "geometry"]).optional(),
  texture_quality: z.enum(["standard", "detailed", "ultra"]).optional().describe("standard=2K, detailed=4K, ultra=8K."),
  visibility: z.enum(["private", "public", "shareable"]).default("private")
};

export function normalizeSettings(input, mode) {
  if (input.tier !== "smart_mesh" && input.tier !== "high_detail") {
    throw new TripoError("INVALID_INPUT", "tier must be smart_mesh or high_detail.", { stage: "model_generation_prepare" });
  }
  if (!Number.isSafeInteger(input.face_limit)) {
    throw new TripoError("INVALID_INPUT", "face_limit must be a safe integer.", { stage: "model_generation_prepare" });
  }
  const visibility = input.visibility ?? "private";
  const allowSensitive = input.allow_sensitive ?? false;
  if (allowSensitive && visibility !== "private") {
    throw new TripoError("INVALID_INPUT", "allow_sensitive=true requires private visibility.", { stage: "model_generation_prepare" });
  }
  if (input.tier === "smart_mesh") {
    const version = input.model_version ?? NEXUS_V2_MODEL_VERSION;
    if (!SMART_MESH_MODEL_VERSIONS.includes(version)) throw new TripoError("INVALID_INPUT", "Smart Mesh requires a Nexus model version.");
    const maximum = version === NEXUS_MODEL_VERSION ? 20000 : NEXUS_MAX_FACES;
    const amount = input.amount ?? input.face_limits?.length ?? 1;
    if (![1, 2, 4].includes(amount) || (input.face_limits && input.face_limits.length !== amount)) throw new TripoError("INVALID_INPUT", "face_limits length must match amount (1, 2, or 4).");
    if (version === NEXUS_MODEL_VERSION && (input.quad === true || amount > 1)) throw new TripoError("INVALID_INPUT", "Quad topology and multiple variants require Smart Mesh P2.");
    const budgets = input.face_limits ?? Array(amount).fill(input.face_limit);
    if (budgets.some((budget) => !Number.isSafeInteger(budget) || budget < NEXUS_MIN_FACES || budget > maximum)) {
      throw new TripoError("INVALID_INPUT", `Smart Mesh face_limit must be from ${NEXUS_MIN_FACES} through ${maximum}.`, { stage: "model_generation_prepare" });
    }
    if (
      input.generate_parts === true || input.smart_poly === true || input.texture === true || input.pbr === true || input.delight !== undefined ||
      input.enable_image_autofix === true || input.geometry_quality !== undefined ||
      input.segmentation_granularity !== undefined || input.texture_alignment !== undefined || input.texture_quality !== undefined
    ) {
      throw new TripoError("INVALID_INPUT", "Smart Mesh supports face budgets, variants, quad topology, version, symmetry, and visibility; high-detail texture/geometry/parts options are unavailable.", { stage: "model_generation_prepare" });
    }
    return {
      allow_sensitive: allowSensitive,
      enable_image_autofix: false,
      face_limit: budgets[0],
      generate_parts: false,
      model_version: version,
      amount,
      face_limits: budgets,
      pbr: false,
      quad: input.quad ?? (version === NEXUS_V2_MODEL_VERSION),
      smart_poly: false,
      texture: false,
      visibility
    };
  }
  if (input.amount !== undefined || input.face_limits !== undefined) throw new TripoError("INVALID_INPUT", "amount and face_limits are Smart Mesh settings.");
  const modelVersion = input.model_version ?? "v3.1-20260211";
  if (!HIGH_DETAIL_MODEL_VERSIONS.includes(modelVersion)) {
    throw new TripoError("INVALID_INPUT", "The high-detail model_version is not supported by the current Studio contract.", { stage: "model_generation_prepare" });
  }
  const quad = input.quad ?? false;
  const smartPoly = input.smart_poly ?? false;
  const generateParts = input.generate_parts ?? false;
  const texture = input.texture ?? false;
  const geometryQuality = modelVersion === "v3.1-20260211" ? input.geometry_quality ?? (smartPoly ? "standard" : "detailed") : undefined;
  if (modelVersion !== "v3.1-20260211" && input.geometry_quality !== undefined) {
    throw new TripoError("INVALID_INPUT", "geometry_quality is only sent by Studio for v3.1-20260211.", { stage: "model_generation_prepare" });
  }
  if (generateParts && quad) throw new TripoError("INVALID_INPUT", "generate_parts cannot be combined with quad topology.", { stage: "model_generation_prepare" });
  if (generateParts && texture) throw new TripoError("INVALID_INPUT", "Studio does not combine generate_parts with texture generation.", { stage: "model_generation_prepare" });
  if (smartPoly && geometryQuality === "detailed") {
    throw new TripoError("INVALID_INPUT", "smart_poly and detailed geometry_quality are mutually exclusive in Studio.", { stage: "model_generation_prepare" });
  }
  const minimumFaces = generateParts ? 10000 : 500;
  const maximumFaces = smartPoly ? (quad ? 10000 : 20000) : quad ? 50000 : geometryQuality === "detailed" ? 2e6 : 1e6;
  if (input.face_limit < minimumFaces || input.face_limit > maximumFaces) {
    throw new TripoError("INVALID_INPUT", `face_limit must be from ${minimumFaces} through ${maximumFaces} for these options.`, { stage: "model_generation_prepare" });
  }
  if (input.segmentation_granularity !== undefined && !generateParts) {
    throw new TripoError("INVALID_INPUT", "segmentation_granularity requires generate_parts=true.", { stage: "model_generation_prepare" });
  }
  if (input.enable_image_autofix === true && !["image", "batch"].includes(mode)) {
    throw new TripoError("INVALID_INPUT", "enable_image_autofix is supported only for image or batch mode.", { stage: "model_generation_prepare" });
  }
  if (!texture && (input.delight !== undefined || input.texture_alignment !== undefined || input.texture_quality !== undefined || input.pbr === true)) {
    throw new TripoError("INVALID_INPUT", "delight, texture_alignment, texture_quality, and pbr require texture=true.", { stage: "model_generation_prepare" });
  }
  return {
    allow_sensitive: allowSensitive,
    enable_image_autofix: ["image", "batch"].includes(mode) ? input.enable_image_autofix ?? false : false,
    face_limit: input.face_limit,
    generate_parts: generateParts,
    ...(geometryQuality === undefined ? {} : { geometry_quality: geometryQuality }),
    model_version: modelVersion,
    pbr: texture ? input.pbr ?? true : false,
    quad,
    ...(generateParts ? { segmentation_granularity: input.segmentation_granularity ?? "balanced" } : {}),
    smart_poly: smartPoly,
    texture,
    ...(texture ? { delight: input.delight ?? true } : {}),
    ...(texture ? { texture_alignment: input.texture_alignment ?? "original_image" } : {}),
    ...(texture ? { texture_quality: input.texture_quality ?? "detailed" } : {}),
    visibility
  };
}

function commonWire(settings, mode) {
  const body = {
    face_limit: settings.face_limit,
    quad: settings.quad,
    visibility: settings.visibility,
    model_version: settings.model_version
  };
  if (settings.tier === "smart_mesh" && settings.amount > 1) {
    body.variations = settings.face_limits.map((face_limit) => ({ face_limit }));
    delete body.face_limit;
  }
  if (settings.tier === "high_detail") {
    body.generate_parts = settings.generate_parts;
    body.smart_poly = settings.smart_poly;
    body.texture = settings.texture;
    if (settings.generate_parts) body.segmentation_granularity = settings.segmentation_granularity;
    if (settings.texture) {
      body.pbr = settings.pbr;
      body.delight = settings.delight;
      body.texture_alignment = settings.texture_alignment;
      body.texture_quality = settings.texture_quality;
    }
    if (["image", "batch"].includes(mode)) body.enable_image_autofix = settings.enable_image_autofix;
    if (settings.model_version === "v3.1-20260211") body.geometry_quality = settings.geometry_quality;
  }
  return body;
}

function wireImage(image) {
  return {
    bucket: image.uploaded.bucket,
    image_audit_result: image.audit.result,
    image_source: image.studio_asset_id === undefined ? "upload" : "generate",
    key: image.uploaded.key
  };
}

async function studioImageRecord(ctx, assetId, expectedType, outputIndex, slot, allowSensitive) {
  const asset = await ctx.gateway.getStudioImageAsset(assetId);
  if (asset.asset_id !== assetId || asset.status !== "success" || asset.type !== expectedType) {
    throw new TripoError("INSUFFICIENT_EVIDENCE", `Studio image asset ${assetId} is not a successful ${expectedType} asset.`, { stage: "model_generation_prepare" });
  }
  const output = asset.output.data[outputIndex];
  if (!output) throw new TripoError("PLAN_NOT_FOUND", "The selected Studio image output index does not exist.", { stage: "model_generation_prepare" });
  const audit = output.image_audit_result;
  if ((audit === "sensitive" || audit === "nsfw") && !allowSensitive) {
    throw new TripoError("CONTENT_AUDIT_REJECTED", "The selected Studio image output is marked sensitive.", { stage: "model_generation_prepare" });
  }
  if (audit === "nsfw" || audit === "reject") {
    throw new TripoError("CONTENT_AUDIT_REJECTED", `The selected Studio image output audit is ${audit}.`, { stage: "model_generation_prepare" });
  }
  return {
    audit: { result: audit === "pass" || audit === "sensitive" ? audit : "pass" },
    slot,
    source_name: `Studio ${asset.type} output ${outputIndex}`,
    studio_asset_id: asset.asset_id,
    studio_output_index: outputIndex,
    uploaded: { bucket: output.bucket, key: output.key }
  };
}

function normalizeMatrix(input) {
  const matrix = input === undefined ? [...IDENTITY_MATRIX] : [...input];
  if (matrix.length !== 16 || matrix.some((entry) => !Number.isFinite(entry) || Math.abs(entry) > 1e6)) {
    throw new TripoError("INVALID_INPUT", "transform_matrix must contain exactly 16 finite values between -1,000,000 and 1,000,000.", { stage: "model_import_prepare" });
  }
  if (Math.abs(matrix[3]) > 1e-9 || Math.abs(matrix[7]) > 1e-9 || Math.abs(matrix[11]) > 1e-9 || Math.abs(matrix[15] - 1) > 1e-9) {
    throw new TripoError("INVALID_INPUT", "transform_matrix must be an affine Three.js column-major matrix with final row [0,0,0,1].", { stage: "model_import_prepare" });
  }
  const determinant =
    matrix[0] * (matrix[5] * matrix[10] - matrix[9] * matrix[6]) -
    matrix[4] * (matrix[1] * matrix[10] - matrix[9] * matrix[2]) +
    matrix[8] * (matrix[1] * matrix[6] - matrix[5] * matrix[2]);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    throw new TripoError("INVALID_INPUT", "transform_matrix must have a non-singular 3D scale/rotation component.", { stage: "model_import_prepare" });
  }
  return matrix;
}

export const modelOperations = {
  "model.generate": {
    category: "model",
    consumesCredits: true,
    description:
      "Generate 3D from text, an image, actual multiview, existing Studio outputs, or a batch of up to 30 independent images. Smart Mesh P2 supports quad topology and 1/2/4 budget variants; high_detail supports independent geometry quality, texture, delight, PBR and parts.",
    inputShape: {
      ...generationSettingsShape,
      back_image_path: z.string().optional(),
      front_image_path: z.string().optional().describe("Local front view for mode=multiview."),
      image_path: z.string().optional().describe("Local reference image for mode=image."),
      left_image_path: z.string().optional(),
      mode: z.enum(["text", "image", "multiview", "batch", "studio_image", "studio_multiview"]).describe("batch generates a separate model for each image; multiview is one model from fixed views."),
      image_paths: z.array(z.string()).min(1).max(30).optional().describe("mode=batch: up to 30 independent input images."),
      symmetry: z.boolean().optional().describe("P2.0 symmetry override; omitted uses Studio symmetry check on image inputs."),
      output_index: z.number().int().min(0).max(15).optional().describe("studio_image: which output of the asset to use."),
      prompt: z.string().max(1000).optional().describe("Required for mode=text."),
      right_image_path: z.string().optional(),
      studio_image_asset_id: identifier.optional().describe("studio_image: a successful generate_image asset id."),
      studio_multiview_asset_id: identifier.optional().describe("studio_multiview: a successful multiview_images asset id."),
      submit: z.boolean().optional(),
      t_pose: z.boolean().optional().describe("text mode: generate in T-pose."),
      tier: z.enum(["smart_mesh", "high_detail"]).describe("Generation tier.")
    },
    title: "Generate 3D model",
    async build(ctx, input, taskId) {
      const mode = input.mode;
      const settingsMode = mode === "studio_image" ? "image" : mode === "studio_multiview" ? "multiview" : mode;
      const settings = { ...normalizeSettings(input, settingsMode), tier: input.tier };
      const snapshots = [];
      const metadata = { mode };
      const body = commonWire(settings, settingsMode);
      if (mode === "text") {
        const prompt = (input.prompt ?? "").trim();
        if (prompt.length < 1 || prompt.length > 1000) {
          throw new TripoError("INVALID_INPUT", "prompt must contain 1 through 1,000 characters.", { stage: "model_generation_prepare" });
        }
        Object.assign(body, { gen_image_model_version: TEXT_IMAGE_MODEL_VERSION, prompt, sketch_to_render: false, t_pose: input.t_pose ?? false });
        metadata.prompt = prompt;
      } else if (mode === "image" || mode === "multiview" || mode === "batch") {
        if (mode === "batch" && !input.image_paths?.length) throw new TripoError("INVALID_INPUT", "image_paths is required for batch mode.");
        const slots = mode === "batch" ? input.image_paths.map((filePath, index) => [`input_${index}`, filePath, true]) : mode === "image" ? [["image", input.image_path, true]] : [["front", input.front_image_path, true], ["left", input.left_image_path, false], ["back", input.back_image_path, false], ["right", input.right_image_path, false]];
        const wireImages = mode === "image" ? null : [];
        let single;
        for (const [slot, filePath, required] of slots) {
          if (!filePath) {
            if (required) throw new TripoError("INVALID_INPUT", `${slot}_image_path is required for mode=${mode}.`, { stage: "model_generation_prepare" });
            if (wireImages) wireImages.push(null);
            continue;
          }
          assertLocalPathSpecifier(filePath, "model_generation_input_policy");
          const staged = await stageLocalImage(ctx.config, ctx.gateway, ctx.uploader, filePath, true, {
            deferUpload: ctx.deferUploads,
            index: snapshots.length + 1,
            label: `${slot} view`,
            slot,
            taskId
          });
          snapshots.push(staged.provenance);
          const wire = { bucket: staged.uploaded.bucket, image_audit_result: staged.audit.result, image_source: "upload", key: staged.uploaded.key, ...(mode === "batch" && settings.texture ? { texture_quality: settings.texture_quality } : {}) };
          if (wireImages) wireImages.push(wire);
          else single = wire;
        }
        if (mode === "multiview" && wireImages.filter(Boolean).length < 2) {
          throw new TripoError("INVALID_INPUT", "Multiview generation requires front plus at least one of left, back, or right.", { stage: "model_generation_prepare" });
        }
        if (new Set(snapshots.map((s) => s.sha256)).size !== snapshots.length) {
          throw new TripoError("INVALID_INPUT", "Every multiview input must have distinct image content.", { stage: "model_generation_prepare" });
        }
        body.image = mode === "image" ? single : wireImages;
      } else {
        // Studio-asset modes: the images already live in Studio storage.
        const allowSensitive = input.allow_sensitive ?? false;
        if (mode === "studio_image") {
          if (!input.studio_image_asset_id) throw new TripoError("INVALID_INPUT", "studio_image_asset_id is required.", { stage: "model_generation_prepare" });
          const record = await studioImageRecord(ctx, input.studio_image_asset_id, "generate_image", input.output_index ?? 0, "image", allowSensitive);
          body.image = wireImage(record);
          metadata.studio_inputs = [{ asset_id: record.studio_asset_id, output_index: record.studio_output_index, slot: "image" }];
        } else {
          if (!input.studio_multiview_asset_id) throw new TripoError("INVALID_INPUT", "studio_multiview_asset_id is required.", { stage: "model_generation_prepare" });
          const slots4 = ["front", "left", "back", "right"];
          const records = await Promise.all(slots4.map((slot, index) => studioImageRecord(ctx, input.studio_multiview_asset_id, "multiview_images", index, slot, allowSensitive)));
          body.image = records.map(wireImage);
          metadata.studio_inputs = records.map((record) => ({ asset_id: record.studio_asset_id, output_index: record.studio_output_index, slot: record.slot }));
        }
      }
      if (settings.model_version === NEXUS_V2_MODEL_VERSION) {
        const reference = Array.isArray(body.image) ? body.image.find(Boolean) : body.image;
        if (input.symmetry !== undefined) body.symmetry = input.symmetry;
        else if (reference) {
          if (ctx.deferUploads) metadata.pending_symmetry = true;
          else body.symmetry = await ctx.gateway.checkSymmetry(reference);
        }
      } else if (input.symmetry !== undefined) throw new TripoError("INVALID_INPUT", "symmetry is a P2.0 setting.");
      return { metadata, payload: { body, mode: settingsMode }, settings, snapshots };
    },
    async submitRemote(ctx, task) {
      const receipts = await ctx.gateway.submitModelGeneration(task.payload);
      return { operator_ids: receipts.map((entry) => entry.operator_id), project_ids: receipts.map((entry) => entry.project_id ?? null), project_id: receipts[0].project_id ?? null };
    },
    async syncRemote(ctx, task) {
      return syncGeneratedModels(ctx, task);
    }
  },

  "model.import": {
    category: "model",
    consumesCredits: false,
    description:
      "Import a local GLB/OBJ/FBX/STL model (up to 150 MiB, 3M faces) into the Studio workspace. The file is content-inspected, snapshotted, uploaded, then registered as a Studio project.",
    inputShape: {
      file_path: z.string().describe("Local .glb/.obj/.fbx/.stl model path."),
      name: z.string().min(1).max(255).optional().describe("Studio project name; defaults to the file name."),
      submit: z.boolean().optional(),
      transform_matrix: z.array(z.number()).length(16).optional().describe("Three.js column-major affine matrix; identity by default."),
      use_original_uv: z.boolean().default(false)
    },
    title: "Import local model",
    async build(ctx, input, taskId) {
      assertLocalPathSpecifier(input.file_path, "import_input_policy");
      const staged = await stageLocalModelFile(ctx.config, input.file_path, { index: 1, label: "model", slot: "model", taskId });
      const inspected = await inspectModel(staged.path);
      const matrix = normalizeMatrix(input.transform_matrix);
      const name = (input.name ?? staged.metadata.source_name).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
      if (!name || name.length > 255) throw new TripoError("INVALID_INPUT", "The model name must be 1-255 safe characters.", { stage: "model_import_prepare" });
      if (ctx.deferUploads) staged.provenance.pending_upload = true;
      const uploaded = ctx.deferUploads ? pendingInputWire(staged.provenance) : await ctx.uploader.upload(staged.path, await ctx.gateway.requestTemporaryToken(inspected.format));
      return {
        metadata: {
          face_count: inspected.faceCount,
          format: inspected.format,
          has_uv: inspected.isUvMapped,
          name
        },
        payload: {
          format: inspected.format,
          model: uploaded,
          name,
          transform_matrix: matrix,
          use_original_uv: input.use_original_uv
        },
        snapshots: [staged.provenance]
      };
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.submitModelImport(task.payload);
      return { operator_id: receipt.operator_id, project_id: receipt.project_id ?? null };
    },
    async syncRemote(ctx, task) {
      const items = await ctx.gateway.getProgress([task.remote.operator_id]);
      const item = selectProgress(items, task.remote.operator_id);
      if (item.project_id && task.remote.project_id && item.project_id !== task.remote.project_id) {
        throw new TripoError("INSUFFICIENT_EVIDENCE", "Progress returned a different project ID for this import.", { stage: "model_import_progress" });
      }
      const projectId = item.project_id ?? task.remote.project_id;
      const status = remoteStatus(item.status);
      let result;
      if (status === "succeeded" && projectId) {
        const detail = await ctx.gateway.getProject(projectId, task.remote.operator_id);
        result = { model_url: detail.model_url || null, project_id: projectId, project_name: detail.project_name ?? null };
      } else if (projectId) {
        result = { project_id: projectId };
      }
      return { progress: { left_time: item.left_time ?? null, progress: item.progress ?? null, status: item.status }, result, status };
    }
  }
};

function selectProgress(items, operatorId) {
  const exact = items.find((entry) => entry.operator_id === operatorId || entry.id === operatorId);
  if (exact) return exact;
  if (items.length === 1 && items[0]?.operator_id === undefined && items[0]?.id === undefined) return items[0];
  throw new TripoError("INSUFFICIENT_EVIDENCE", "Tripo omitted progress for an expected operator.", { stage: "task_progress" });
}

function remoteStatus(status) {
  if (status === "success") return "succeeded";
  if (status === "cancelled") return "canceled";
  if (status === "expired") return "expired";
  if (status === "banned") return "banned";
  if (status === "failed") return "failed";
  if (status === "prepare" || status === "queued") return "queued";
  return "running";
}

function normalizeOperatorStatus(statuses) {
  if (statuses.every((s) => s === "success")) return "succeeded";
  if (statuses.every((s) => s === "cancelled")) return "canceled";

  if (statuses.some((s) => s === "running")) return "running";
  if (statuses.some((s) => ["queued", "prepare"].includes(s))) return "queued";
  return "failed";
}

export { remoteStatus as mapRemoteStatus, selectProgress };

export async function syncGeneratedModels(ctx, task) {
  const ids = task.remote.operator_ids;
  const items = await ctx.gateway.getProgress(ids);
  const selected = ids.map((id) => selectProgress(items, id));
  const models = [];
  for (const [index, item] of selected.entries()) {
    // Legacy records tracked only the first project; other variants may differ.
    const expected = task.remote.project_ids?.[index] ?? (index === 0 ? task.remote.project_id : null);
    if (expected && item.project_id && expected !== item.project_id) throw new TripoError("INSUFFICIENT_EVIDENCE", "Progress returned a different project for this model variant.");
    const projectId = item.project_id ?? expected;
    const model = { output_index: index, operator_id: ids[index], project_id: projectId, status: remoteStatus(item.status) };
    if (model.status === "succeeded") {
      if (!projectId) throw new TripoError("INSUFFICIENT_EVIDENCE", "Successful generation has no project ID.");
      const detail = await ctx.gateway.getProject(projectId, ids[index]);
      if (detail.id && detail.id !== projectId) throw new TripoError("INSUFFICIENT_EVIDENCE", "Model detail returned a different project.");
      Object.assign(model, { model_url: detail.model_url || null, project_name: detail.project_name ?? null });
    }
    models.push(model);
  }
  return { status: normalizeOperatorStatus(selected.map((item) => item.status)), progress: { items: selected.map((item, index) => ({ ...item, operator_id: ids[index] })) }, result: { ...models[0], models } };
}
