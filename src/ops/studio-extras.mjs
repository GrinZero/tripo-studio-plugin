import { z } from "zod";
import path from "node:path";
import { TripoError } from "../errors.mjs";
import { preflight, postprocessSync } from "./postops.mjs";
import { mapRemoteStatus, selectProgress } from "./modelgen.mjs";
import { inspectModel } from "../util/model-inspect.mjs";
import { downloadArtifact } from "../studio/downloader.mjs";
import { sourceTextureInfo } from "../studio/export-resolution.mjs";

const id = z.string().regex(/^[^\s\u0000-\u001f\u007f]{1,256}$/);
const fail = (message) => { throw new TripoError("INSUFFICIENT_EVIDENCE", message, { stage: "studio_contract" }); };
export async function currentProject(ctx, projectId, expected) {
  const detail = await ctx.gateway.getProject(projectId);
  if (detail.id && detail.id !== projectId) fail("Project detail identity mismatch.");
  const operatorId = detail.operator?.operator_id;
  if (!operatorId) fail("Project has no current operator ID.");
  if (expected && operatorId !== expected) fail("Project changed after staging; stage a new task before submitting.");
  return { detail, operatorId };
}
export async function uvContext(ctx, projectId, expected) {
  const { detail, operatorId } = await currentProject(ctx, projectId, expected);
  const context = await ctx.gateway.getUvContext({ project_id: projectId, current_operator_id: operatorId });
  if (context.project_id !== projectId || context.current_operator_id !== operatorId) fail("UV context identity mismatch.");
  return { context, detail, operatorId };
}
async function uvEligibility(ctx, projectId, detail) {
  if (detail.operator?.is_segmented) throw new TripoError("INVALID_INPUT", "Smart UV does not support segmented projects.");
  if (!detail.model_url) fail("Smart UV requires a model to inspect.");
  const cache = path.join(ctx.config.dataDir, "model-cache");
  const saved = await downloadArtifact({ ...ctx.config, outputRoots: [cache] }, detail.model_url, undefined, `uv-${encodeURIComponent(projectId)}.glb`);
  const model = await inspectModel(saved.path);
  // GLB triangulates quads: the UI checks original quad faces, not triangle indices.
  const quad = detail.operator?.is_quad === true;
  const maximumTriangles = 80000;
  if (model.faceCount > maximumTriangles) throw new TripoError("INVALID_INPUT", "Smart UV allows at most 80K triangles or 40K original quads.");
  return { triangle_count: model.faceCount, original_topology: quad ? "quad" : "triangle", limit_triangles: maximumTriangles };
}
function uvIdentity(receipt, payload) {
  if (receipt.project_id !== payload.project_id || receipt.current_operator_id !== payload.current_operator_id || receipt.action !== payload.action) fail("UV receipt identity mismatch.");
}
const imageTransform = (endpoint, title) => ({
  category: "image", consumesCredits: true, title,
  description: `Studio ${endpoint}: transform one completed image output selected by output_index.`,
  inputShape: { asset_id: id, output_index: z.number().int().min(0).max(15).default(0), submit: z.boolean().optional() },
  async build(ctx, input) {
    const asset = await ctx.gateway.getStudioImageAsset(input.asset_id);
    const output = asset.output.data[input.output_index];
    if (asset.asset_id !== input.asset_id || asset.status !== "success" || !output?.key) fail("Selected image output is not complete.");
    return { payload: { asset_id: input.asset_id, resource_key: output.key }, snapshots: [], metadata: { source_output_index: input.output_index } };
  },
  async submitRemote(ctx, task) { return ctx.gateway.submitImageTransform(endpoint, task.payload); },
  async syncRemote(ctx, task) {
    const asset = await ctx.gateway.getStudioImageAsset(task.remote.asset_id);
    if (asset.asset_id !== task.remote.asset_id) fail("Image asset identity mismatch.");
    return { status: mapRemoteStatus(asset.status), result: { asset_id: asset.asset_id, outputs: asset.output.data }, progress: { status: asset.status } };
  }
});
export const studioExtraOperations = {
  "image.upscale": imageTransform("upscale", "Upscale image to 4K"),
  "image.split": imageTransform("split", "Automatically split image subjects"),
  "motion.generate": {
    category: "animation", consumesCredits: true, title: "Generate AI motion",
    description: "Text-to-motion or up to five stages, each 1–10 seconds. Optional two [x,z] waypoints per stage must connect exactly. Generate first, then model.apply_motion on a biped rig.",
    inputShape: {
      segments: z.array(z.object({ prompt: z.string().trim().min(1).max(1000), duration_seconds: z.number().int().min(1).max(10), waypoints: z.array(z.array(z.number().finite()).length(2)).length(2).optional() }).strict()).min(1).max(5),
      submit: z.boolean().optional()
    },
    async build(ctx, input) {
      for (let index = 1; index < input.segments.length; index++) {
        const previous = input.segments[index - 1].waypoints?.[1];
        const current = input.segments[index].waypoints?.[0];
        if (previous && current && previous.some((n, i) => n !== current[i])) throw new TripoError("INVALID_INPUT", "Adjacent motion waypoints must connect.");
      }
      return { payload: { segments: input.segments }, snapshots: [], metadata: { duration_seconds: input.segments.reduce((sum, item) => sum + item.duration_seconds, 0) } };
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.submitMotion(task.payload);
      return { motion_task_id: receipt.task_id };
    },
    async syncRemote(ctx, task) {
      const progress = await ctx.gateway.getMotionTask(task.remote.motion_task_id);
      if (progress.task_id !== task.remote.motion_task_id) fail("Motion task identity mismatch.");
      const status = mapRemoteStatus(progress.status);
      let result;
      if (status === "succeeded") {
        if (!progress.asset_id) fail("Completed motion has no asset ID.");
        const asset = await ctx.gateway.getMotionAsset(progress.asset_id);
        if (asset.asset_id !== progress.asset_id || (asset.task_id && asset.task_id !== progress.task_id)) fail("Motion asset identity mismatch.");
        result = { motion_asset_id: asset.asset_id, motion_url: asset.motion_url, title: asset.title ?? null, motion: asset.motion ?? null };
      }
      return { status, progress: { status: progress.status }, result };
    }
  },
  "model.apply_motion": {
    category: "animation", consumesCredits: true, title: "Apply AI motion to model",
    description: "Retarget a generated motion_asset_id to a rigged biped project through Studio retarget_model.",
    inputShape: { project_id: id, motion_asset_id: id, submit: z.boolean().optional() },
    async build(ctx, input) {
      const pf = await preflight(ctx, "animation_retarget", input.project_id, { rigType: "biped" });
      const asset = await ctx.gateway.getMotionAsset(input.motion_asset_id);
      if (asset.asset_id !== input.motion_asset_id) fail("Motion asset identity mismatch.");
      return { ...pf, payload: { project_id: input.project_id, model_version: "default", rig_type: "biped", motion_asset_id: input.motion_asset_id }, snapshots: [] };
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.submitPostprocess("retarget_model", task.payload);
      if (receipt.project_id && receipt.project_id !== task.payload.project_id) fail("Retarget receipt identity mismatch.");
      return { operator_id: receipt.operator_id, project_id: task.payload.project_id };
    },
    syncRemote: postprocessSync()
  },
  "model.export": {
    category: "export", consumesCredits: false, title: "Export model with settings",
    description: "Export an owned Studio project to GLB, FBX, OBJ, USDZ, STL, or 3MF; supports texture resolution, skeleton, animations, UV packing, FBX preset, in-place animation, and frame baking. Server permissions still apply.",
    inputShape: {
      project_id: id, format: z.enum(["glb", "fbx", "obj", "usdz", "stl", "3mf"]),
      name: z.string().trim().min(1).max(255).regex(/^[^/\\\u0000-\u001f\u007f]+$/).optional(),
      texture_size: z.union([z.literal(512), z.literal(1024), z.literal(2048), z.literal(4096), z.literal(8192)]).optional().describe("Maximum exported texture edge length, without upscaling. Defaults to the actual source textures. tripo_download verifies sizes and downsamples oversized ZIP/GLB textures locally."),
      texture_packaging: z.enum(["zip", "embedded"]).default("zip"),
      fbx_preset: z.enum(["blender", "mixamo", "3dsmax"]).default("blender"),
      with_animation: z.boolean().default(false), animations: z.array(id).max(256).default([]),
      pack_uv: z.boolean().default(false), animate_in_place: z.boolean().default(false),
      enable_bake_animation: z.boolean().default(false), bake_animation_frame: z.number().int().min(0).max(1000000).default(0),
      export_vertex_colors: z.boolean().default(false), export_orientation: z.enum(["-y"]).default("-y"), submit: z.boolean().optional()
    },
    async build(ctx, input) {
      const { detail, operatorId } = await currentProject(ctx, input.project_id);
      if (detail.is_owner !== true) throw new TripoError("INVALID_INPUT", "This export tool requires an owned project; public paid export is a separate capability.");
      if (!input.with_animation && input.animations.length) throw new TripoError("INVALID_INPUT", "animations requires with_animation=true.");
      if ((input.with_animation || input.enable_bake_animation) && !detail.operator?.is_rigged) throw new TripoError("INVALID_INPUT", "Skeleton and animation export require a rigged model.");
      if (input.export_vertex_colors && input.format !== "obj") throw new TripoError("INVALID_INPUT", "Vertex colors are an OBJ option.");
      const sourceTextures = await sourceTextureInfo(ctx, detail, operatorId);
      const sourceTextureSize = sourceTextures.source_texture_size;
      const textureSize = input.texture_size ?? ([8192, 4096, 2048, 1024, 512].find(size => size <= sourceTextureSize) ?? 512);
      if (textureSize > Math.max(512, sourceTextureSize)) throw new TripoError("INVALID_INPUT", "Export resolution cannot exceed the project's current texture resolution; upscale its textures first.");
      const { submit, ...params } = input;
      const name = input.name ?? `model-${input.project_id}`;
      return { payload: { ...params, texture_size: textureSize, name, format: input.format === "glb" ? "gltf" : input.format, model_version: "default" }, metadata: { source_operator_id: operatorId, output_format: input.format, requested_texture_size: textureSize, ...sourceTextures }, snapshots: [] };
    },
    async beforeSubmit(ctx, task) {
      await currentProject(ctx, task.payload.project_id, task.metadata.source_operator_id);
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.submitExport(task.payload);
      return { ...receipt, project_id: task.payload.project_id };
    },
    async syncRemote(ctx, task) {
      const texture = { requested_texture_size: task.payload.texture_size, actual_texture_size_verified: false };
      if (task.remote.model_url) return { status: "succeeded", result: { project_id: task.remote.project_id, export_url: task.remote.model_url, format: task.metadata.output_format, ...texture }, progress: { status: "success" } };
      const items = await ctx.gateway.getProgress([task.remote.operator_id]);
      const item = selectProgress(items, task.remote.operator_id);
      if (item.project_id && item.project_id !== task.payload.project_id) fail("Export progress project mismatch.");
      const status = mapRemoteStatus(item.status);
      const result = status === "succeeded" ? { project_id: task.payload.project_id, export_url: (await ctx.gateway.getExportDownload(task.remote.operator_id, task.payload.name)).model_url, format: task.metadata.output_format, ...texture } : undefined;
      return { status, result, progress: { status: item.status, progress: item.progress ?? null } };
    }
  },
  "model.uv_generate": {
    category: "postprocess", consumesCredits: true, title: "Generate Smart UV candidate",
    description: "Generate/retry Smart UV against a frozen current operator, inspect actual GLB polygon count, and return a candidate without replacing the model. Apply with model.uv_apply.",
    inputShape: { project_id: id, action: z.enum(["generate", "retry"]).optional(), submit: z.boolean().optional() },
    async build(ctx, input) {
      const { context, detail, operatorId } = await uvContext(ctx, input.project_id);
      if (context.running_task) throw new TripoError("INVALID_INPUT", "A Smart UV task is already running; inspect context instead of submitting again.");
      if (input.action && input.action !== context.next_action) throw new TripoError("INVALID_INPUT", "Requested UV action does not match the current context.");
      const stats = await uvEligibility(ctx, input.project_id, detail);
      return { payload: { project_id: input.project_id, current_operator_id: operatorId, action: context.next_action }, snapshots: [], metadata: { mesh_stats: stats, candidate_count: context.candidates.length }, warnings: ["Generates a candidate; apply it separately after inspection."] };
    },
    async beforeSubmit(ctx, task) {
      const { context } = await uvContext(ctx, task.payload.project_id, task.payload.current_operator_id);
      if (context.running_task || context.next_action !== task.payload.action || context.candidates.length !== task.metadata.candidate_count) fail("UV context changed after staging.");
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.submitUv(task.payload);
      uvIdentity(receipt, task.payload);
      return { operator_id: receipt.operator_id, project_id: receipt.project_id };
    },
    async syncRemote(ctx, task) {
      const item = selectProgress(await ctx.gateway.getProgress([task.remote.operator_id]), task.remote.operator_id);
      const status = mapRemoteStatus(item.status);
      let result;
      if (status === "succeeded") {
        const { context } = await uvContext(ctx, task.payload.project_id, task.payload.current_operator_id);
        const candidate = context.candidates.find((entry) => entry.operator_id === task.remote.operator_id);
        if (!candidate) fail("Completed UV operator has no candidate in context yet.");
        result = { project_id: task.payload.project_id, candidate_operator_id: candidate.operator_id, model_url: candidate.model.url, uv_layout_url: candidate.uv_layout.url };
      }
      return { status, progress: { status: item.status, progress: item.progress ?? null }, result };
    }
  },
  "model.uv_apply": {
    category: "postprocess", consumesCredits: false, title: "Apply Smart UV candidate",
    description: "Apply an inspected UV candidate. Validates candidate membership and current operator both before staging and before applying.",
    inputShape: { project_id: id, candidate_operator_id: id, submit: z.boolean().optional() },
    async build(ctx, input) {
      const { context, operatorId } = await uvContext(ctx, input.project_id);
      if (context.running_task || !context.candidates.some((entry) => entry.operator_id === input.candidate_operator_id)) fail("Candidate is unavailable or UV is still processing.");
      return { payload: { project_id: input.project_id, candidate_operator_id: input.candidate_operator_id, current_operator_id: operatorId }, snapshots: [] };
    },
    async beforeSubmit(ctx, task) {
      const { context } = await uvContext(ctx, task.payload.project_id, task.payload.current_operator_id);
      if (context.running_task || !context.candidates.some((entry) => entry.operator_id === task.payload.candidate_operator_id)) fail("UV candidate changed after staging.");
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.applyUv(task.payload);
      if (receipt.project_id !== task.payload.project_id || receipt.previous_operator_id !== task.payload.current_operator_id || receipt.current_operator_id !== task.payload.candidate_operator_id) fail("UV apply receipt mismatch.");
      return { project_id: receipt.project_id, operator_id: receipt.current_operator_id, applied: true };
    },
    async syncRemote(ctx, task) {
      return { status: "succeeded", result: { project_id: task.remote.project_id, operator_id: task.remote.operator_id, applied: true } };
    }
  }
};
