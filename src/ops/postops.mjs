import { z } from "zod";
import { TripoError } from "../errors.mjs";
import {
  COMPLETION_MODEL_VERSION,
  REMESH_MIN_FACES,
  REMESH_NORMAL_QUAD_MAX_FACES,
  REMESH_NORMAL_TRIANGLE_MAX_FACES,
  REMESH_SMART_QUAD_MAX_FACES,
  REMESH_SMART_TRIANGLE_MAX_FACES,
  RIGGING_MODEL_VERSION_V1,
  RIGGING_MODEL_VERSION_V2_5,
  RIGGING_MODEL_VERSION_V3,
  SKELETON_PRESETS,
  SEGMENTATION_MODEL_VERSION,
  STUDIO_DEFAULT_MODEL_VERSION,
  TEXTURE_MODEL_VERSION
} from "../constants.mjs";
import { animationPresetRigType, isAnimationPreset, isRetargetRigType } from "./animation-presets.mjs";
import { assertProjectSupports, projectCapabilities } from "./capabilities.mjs";
import { auditedImageWire, directImageWire, stageLocalImage } from "./images.mjs";
import { assertLocalPathSpecifier } from "../security/path-policy.mjs";
import { mapRemoteStatus, selectProgress } from "./modelgen.mjs";

const PROJECT_ID = /^[^\s\u0000-\u001f\u007f]{1,256}$/;
const PART_NAME = /^[^\u0000-\u001f\u007f]{1,256}$/;
const MAX_PARTS = 200;
const MAX_PROMPT_LENGTH = 1000;

const projectId = z.string().regex(PROJECT_ID).describe("Studio project (model asset) id — see tripo_list_models.");
const partNames = z.array(z.string().regex(PART_NAME)).min(1).max(MAX_PARTS);

const BUILTIN_TEXTURE_STYLES = {
  heritage: { bucket: "tripo-data", key: "tripo-studio/style_image/heritage.png" },
  mecha: { bucket: "tripo-data", key: "tripo-studio/style_image/mecha.png" },
  mecha_pop: { bucket: "tripo-data", key: "tripo-studio/style_image/mecha_pop.png" },
  wood: { bucket: "tripo-data", key: "tripo-studio/style_image/wood.jpg" }
};

const POSTPROCESS_ENDPOINTS = {
  ai_completion: "ai_completion",
  animation_retarget: "retarget_model",
  apply_retexture: "apply_retexture",
  mesh_fill: "mesh_fill",
  pbr: "pbr_generate",
  remesh: "remesh",
  retexture_preview: "retexture_generate",
  rigging: "rigging_model",
  segmentation: "ai_segmentation",
  texture_generate: "texture_model",
  texture_upscale: "texture_upscaler"
};

function validateProjectId(value) {
  if (!PROJECT_ID.test(value)) {
    throw new TripoError("INVALID_INPUT", "project_id must be a non-empty Studio project identifier without whitespace.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  return value;
}

function validatePartNames(names, field = "part_names") {
  if (!Array.isArray(names) || names.length < 1 || names.length > MAX_PARTS) {
    throw new TripoError("INVALID_INPUT", `${field} must contain 1 through ${MAX_PARTS} raw hierarchy names.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  const normalized = names.map((name) => name.trim());
  if (normalized.some((name) => !PART_NAME.test(name))) {
    throw new TripoError("INVALID_INPUT", `${field} contains an empty, control-character, or overlong name.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new TripoError("INVALID_INPUT", `${field} must not contain duplicate names.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  return normalized;
}

function validatePrompt(prompt, field) {
  const normalized = prompt.trim();
  if (normalized.length < 1 || normalized.length > MAX_PROMPT_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    throw new TripoError("INVALID_INPUT", `${field} must contain 1 through ${MAX_PROMPT_LENGTH} safe characters.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  return normalized;
}

// Shared preflight for all postprocess ops: fetches project detail, derives
// capability flags, asserts the operation is admissible, returns warnings.
export async function preflight(ctx, internalKind, pid, options = {}) {
  validateProjectId(pid);
  const detail = await ctx.gateway.getProject(pid);
  if (detail.id && detail.id !== pid) {
    throw new TripoError("INSUFFICIENT_EVIDENCE", "Tripo returned a different project during operation staging.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  const capabilities = projectCapabilities(pid, detail);
  assertProjectSupports(internalKind, capabilities, options);
  const warnings = [];
  if ((internalKind === "texture_generate" || internalKind === "texture_upscale") && capabilities.is_ultra_textured === true) {
    warnings.push("This project is already 8K; Studio may only allow an 8K regenerate target.");
  }
  return { capabilities, warnings };
}

// Common postprocess submission: POST /v2/studio/operation/<endpoint> with the
// frozen payload; receipt = {operator_id, project_id?}.
export function postprocessSubmit(endpointKey) {
  return async (ctx, task) => {
    const receipt = await ctx.gateway.submitPostprocess(POSTPROCESS_ENDPOINTS[endpointKey], task.payload);
    if (receipt.project_id !== undefined && receipt.project_id !== task.payload.project_id) {
      throw new TripoError("INSUFFICIENT_EVIDENCE", "Tripo returned a different project ID for the submitted operation.", { stage: "operation_dispatch_receipt" });
    }
    return { operator_id: receipt.operator_id, project_id: task.payload.project_id };
  };
}

export function postprocessSync() {
  return async (ctx, task) => {
    const items = await ctx.gateway.getProgress([task.remote.operator_id]);
    const item = selectProgress(items, task.remote.operator_id);
    if (item.project_id && item.project_id !== task.remote.project_id) {
      throw new TripoError("INSUFFICIENT_EVIDENCE", "Progress returned a different project ID for this operation.", { stage: "operation_progress" });
    }
    const status = mapRemoteStatus(item.status);
    let result;
    if (status === "succeeded") {
      result = { project_id: task.remote.project_id };
      if (task.kind === "texture.edit_preview") {
        const preview = await ctx.gateway.getRetexture(task.remote.operator_id);
        if (!preview?.url) throw new TripoError("INSUFFICIENT_EVIDENCE", "Completed texture preview has no artifact yet; sync again.", { stage: "operation_progress" });
        result.retexture_preview = { camera_matrix: preview.camera_matrix, url: preview.url };
      }
      if (task.kind === "model.animate" || task.kind === "model.apply_motion") {
        const detail = await ctx.gateway.getProject(task.remote.project_id, task.remote.operator_id);
        if (detail.id && detail.id !== task.remote.project_id) throw new TripoError("INSUFFICIENT_EVIDENCE", "Animation artifact project identity mismatch.", { stage: "operation_progress" });
        const artifacts = detail?.operator?.Retarget ?? detail?.operator?.retarget ?? detail?.operator?.retarget_model ?? [];
        const expected = task.payload.animations?.[0];
        const match = artifacts.find((entry) => task.payload.motion_asset_id ? entry.motion_asset_id === task.payload.motion_asset_id : entry.name === expected);
        if (!match?.model_url) throw new TripoError("INSUFFICIENT_EVIDENCE", "The requested animation artifact is not available yet; sync again.", { stage: "operation_progress" });
        result.animation_model_url = match.model_url;
      }
    }
    return {
      progress: { left_time: item.left_time ?? null, progress: item.progress ?? null, reason: item.reason ?? null, status: item.status },
      result,
      status
    };
  };
}

function validateRiggingModelVersion(modelVersion) {
  if (![RIGGING_MODEL_VERSION_V1, RIGGING_MODEL_VERSION_V2_5, RIGGING_MODEL_VERSION_V3].includes(modelVersion)) {
    throw new TripoError("INVALID_INPUT", `model_version must be ${RIGGING_MODEL_VERSION_V1}, ${RIGGING_MODEL_VERSION_V2_5}, or ${RIGGING_MODEL_VERSION_V3}.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  return modelVersion;
}

function publicRiggingPrecheck(precheck, requestedModelVersion) {
  const submissionModelVersion = precheck.riggable && precheck.rig_type !== "others" ? (precheck.rig_type === "biped" ? RIGGING_MODEL_VERSION_V1 : requestedModelVersion) : null;
  return {
    requested_model_version: requestedModelVersion,
    riggable: precheck.riggable,
    rig_type: precheck.rig_type,
    submission_model_version: requestedModelVersion === RIGGING_MODEL_VERSION_V3 && precheck.riggable ? requestedModelVersion : submissionModelVersion
  };
}

export const postprocessOperations = {
  "model.segment": {
    category: "postprocess",
    consumesCredits: true,
    description: "Segment the model into semantic parts (required before part completion and part-scoped texture work). Studio internal kind: ai_segmentation.",
    inputShape: {
      project_id: projectId,
      segmentation_granularity: z.enum(["coarse", "balanced", "fine"]).default("balanced"),
      submit: z.boolean().optional()
    },
    internalKind: "segmentation",
    title: "Segment model",
    async build(ctx, input) {
      const pf = await preflight(ctx, "segmentation", input.project_id);
      return {
        capabilities: pf.capabilities,
        payload: { model_version: SEGMENTATION_MODEL_VERSION, project_id: input.project_id, segmentation_granularity: input.segmentation_granularity },
        snapshots: [],
        warnings: pf.warnings
      };
    },
    submitRemote: postprocessSubmit("segmentation"),
    syncRemote: postprocessSync()
  },

  "model.complete_parts": {
    category: "postprocess",
    consumesCredits: true,
    description:
      "Fill or complete selected mesh parts. mode=quick_cap closes open boundaries; mode=ai_completion regenerates missing regions. Requires a segmented/multi-mesh project and raw hierarchy part names (see tripo_get_model include parts).",
    inputShape: {
      mode: z.enum(["quick_cap", "ai_completion"]).default("ai_completion"),
      part_names: partNames.describe("Raw hierarchy part names, not display renames."),
      project_id: projectId,
      submit: z.boolean().optional()
    },
    title: "Complete mesh parts",
    async build(ctx, input) {
      const internalKind = input.mode === "quick_cap" ? "mesh_fill" : "ai_completion";
      const pf = await preflight(ctx, internalKind, input.project_id);
      return {
        capabilities: pf.capabilities,
        metadata: { mode: input.mode },
        payload: {
          model_version: input.mode === "quick_cap" ? STUDIO_DEFAULT_MODEL_VERSION : COMPLETION_MODEL_VERSION,
          part_names: validatePartNames(input.part_names),
          project_id: input.project_id
        },
        snapshots: [],
        warnings: [...pf.warnings, "part_names must be raw hierarchy names, not display renames; the project must already be segmented/multi-mesh."]
      };
    },
    submitRemote: async (ctx, task) => postprocessSubmit(task.metadata?.mode === "quick_cap" ? "mesh_fill" : "ai_completion")(ctx, task),
    syncRemote: postprocessSync()
  },

  "model.remesh": {
    category: "postprocess",
    consumesCredits: true,
    description:
      "Remesh selected parts to a target face budget. quad toggles quad-dominant topology; smart_poly enables Smart Poly mode (not on Nexus/Smart Mesh projects). face_limit bounds: normal quad ≤50K, normal triangle ≤150K, smart quad ≤10K, smart triangle ≤20K, all ≥500.",
    inputShape: {
      face_limit: z.number().int().describe("Target face budget for the selected mode."),
      part_name_list: partNames.describe("Raw hierarchy part names to remesh."),
      project_id: projectId,
      quad: z.boolean().default(false),
      smart_poly: z.boolean().default(false),
      submit: z.boolean().optional()
    },
    internalKind: "remesh",
    title: "Remesh model",
    async build(ctx, input) {
      const maximum = input.smart_poly ? (input.quad ? REMESH_SMART_QUAD_MAX_FACES : REMESH_SMART_TRIANGLE_MAX_FACES) : input.quad ? REMESH_NORMAL_QUAD_MAX_FACES : REMESH_NORMAL_TRIANGLE_MAX_FACES;
      if (!Number.isSafeInteger(input.face_limit) || input.face_limit < REMESH_MIN_FACES || input.face_limit > maximum) {
        throw new TripoError("INVALID_INPUT", `face_limit must be an integer from ${REMESH_MIN_FACES} through ${maximum} for the selected remesh mode.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
      }
      const pf = await preflight(ctx, "remesh", input.project_id, { smartPoly: input.smart_poly });
      return {
        capabilities: pf.capabilities,
        payload: {
          bake: true,
          face_limit: input.face_limit,
          model_version: STUDIO_DEFAULT_MODEL_VERSION,
          part_name_list: validatePartNames(input.part_name_list, "part_name_list"),
          project_id: input.project_id,
          quad: input.quad,
          smart_poly: input.smart_poly
        },
        snapshots: [],
        warnings: pf.warnings
      };
    },
    submitRemote: postprocessSubmit("remesh"),
    syncRemote: postprocessSync()
  },

  "texture.generate": {
    category: "postprocess",
    consumesCredits: true,
    description:
      "Generate textures for a project: mode=text (prompt), mode=image (local reference image), or mode=multiview (front plus optional left/back/right). Optionally a built-in style (heritage|mecha|mecha_pop|wood) or a local style image — styles are incompatible with multiview mode.",
    inputShape: {
      alignment: z.enum(["original_image", "geometry"]).default("original_image"),
      delight: z.boolean().default(true).describe("Remove lighting independently of PBR."),
      back_image_path: z.string().optional(),
      front_image_path: z.string().optional(),
      image_path: z.string().optional().describe("Local reference image for mode=image."),
      left_image_path: z.string().optional(),
      mode: z.enum(["text", "image", "multiview"]).describe("Texture source mode."),
      part_names: partNames,
      project_id: projectId,
      prompt: z.string().optional().describe("Required for mode=text."),
      quality: z.enum(["standard", "detailed", "ultra"]).default("detailed"),
      right_image_path: z.string().optional(),
      style: z.enum(["heritage", "mecha", "mecha_pop", "wood"]).optional(),
      style_image_path: z.string().optional().describe("Local style reference image; mutually exclusive with style."),
      submit: z.boolean().optional()
    },
    internalKind: "texture_generate",
    title: "Generate texture",
    async build(ctx, input, taskId) {
      const pf = await preflight(ctx, "texture_generate", input.project_id);
      if (input.style && input.style_image_path) {
        throw new TripoError("INVALID_INPUT", "Choose either a built-in style or style_image_path, not both.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
      }
      if (input.mode === "multiview" && (input.style || input.style_image_path)) {
        throw new TripoError("INVALID_INPUT", "The current Studio UI does not combine a style image with multiview texture mode.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
      }
      const snapshots = [];
      const payload = {
        model_version: TEXTURE_MODEL_VERSION,
        delight: input.delight,
        part_names: validatePartNames(input.part_names),
        project_id: input.project_id,
        texture_alignment: input.alignment,
        texture_quality: input.quality
      };
      const retain = async (imagePath, label, slot) => {
        assertLocalPathSpecifier(imagePath, "operation_input_policy");
        const image = await stageLocalImage(ctx.config, ctx.gateway, ctx.uploader, imagePath, true, { deferUpload: ctx.deferUploads, index: snapshots.length + 1, label, slot, taskId });
        snapshots.push(image.provenance);
        return image;
      };
      const imageMetadata = [];
      if (input.mode === "text") {
        payload.prompt_text = validatePrompt(input.prompt ?? "", "prompt");
      } else if (input.mode === "image") {
        if (!input.image_path) throw new TripoError("INVALID_INPUT", "image_path is required for image texture mode.", { stage: "operation_stage" });
        const image = await retain(input.image_path, "Texture reference", "reference");
        payload.image = auditedImageWire(image);
        imageMetadata.push({ role: "reference", ...image.metadata });
      } else {
        if (!input.front_image_path) throw new TripoError("INVALID_INPUT", "front_image_path is required for multiview mode.", { stage: "operation_stage" });
        const paths = [input.front_image_path, input.left_image_path, input.back_image_path, input.right_image_path];
        if (paths.filter(Boolean).length < 2) {
          throw new TripoError("INVALID_INPUT", "Multiview mode requires the front image and at least one additional view.", { stage: "operation_stage" });
        }
        const roles = ["front", "left", "back", "right"];
        const images = [];
        for (let index = 0; index < paths.length; index += 1) {
          if (!paths[index]) {
            images.push(null);
            continue;
          }
          const image = await retain(paths[index], `${roles[index]} view`, roles[index]);
          images.push(auditedImageWire(image));
          imageMetadata.push({ role: roles[index], ...image.metadata });
        }
        payload.images = images;
      }
      if (input.style) {
        payload.style_image = { ...BUILTIN_TEXTURE_STYLES[input.style] };
      } else if (input.style_image_path) {
        const style = await retain(input.style_image_path, "Style reference", "style");
        payload.style_image = { bucket: style.uploaded.bucket, image_audit_result: style.audit.result, key: style.uploaded.key };
        imageMetadata.push({ role: "style", ...style.metadata });
      }
      return {
        capabilities: pf.capabilities,
        metadata: { images: imageMetadata, mode: input.mode, ...(input.style ? { builtin_style: input.style } : {}) },
        payload,
        snapshots,
        warnings: pf.warnings
      };
    },
    submitRemote: postprocessSubmit("texture_generate"),
    syncRemote: postprocessSync()
  },

  "texture.edit_preview": {
    category: "postprocess",
    consumesCredits: true,
    description:
      "Studio Magic Brush: generate a retexture preview for a rendered viewport. render_image_path must be a static WebP produced at 2x the active viewport; camera_matrix must be activeCamera.matrix.toArray() (16 values).",
    inputShape: {
      camera_matrix: z.array(z.number()).length(16).describe("Three.js camera world matrix."),
      project_id: projectId,
      prompt: z.string().min(1).max(1000),
      render_image_path: z.string().describe("Local WebP viewport render at 2x."),
      strength: z.number().min(0).max(1).default(0.5),
      submit: z.boolean().optional()
    },
    internalKind: "retexture_preview",
    title: "Magic Brush preview",
    async build(ctx, input, taskId) {
      if (input.camera_matrix.length !== 16 || input.camera_matrix.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e9)) {
        throw new TripoError("INVALID_INPUT", "camera_matrix must contain exactly 16 finite Three.js camera world-matrix values.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
      }
      const pf = await preflight(ctx, "retexture_preview", input.project_id);
      assertLocalPathSpecifier(input.render_image_path, "operation_input_policy");
      const render = await stageLocalImage(ctx.config, ctx.gateway, ctx.uploader, input.render_image_path, false, {
        deferUpload: ctx.deferUploads,
        index: 1,
        label: "Viewport render",
        requiredFormat: "webp",
        slot: "render",
        taskId
      });
      return {
        capabilities: pf.capabilities,
        metadata: { render_image: render.metadata },
        payload: {
          camera_matrix: input.camera_matrix,
          model_version: TEXTURE_MODEL_VERSION,
          project_id: input.project_id,
          prompt: validatePrompt(input.prompt, "prompt"),
          render_image: directImageWire(render),
          strength: input.strength
        },
        snapshots: [render.provenance],
        warnings: [...pf.warnings, "render_image must be a 2x Studio viewport render and camera_matrix must be activeCamera.matrix.toArray(), not a view/projection matrix."]
      };
    },
    submitRemote: postprocessSubmit("retexture_preview"),
    syncRemote: postprocessSync()
  },

  "texture.edit_apply": {
    category: "postprocess",
    consumesCredits: true,
    description:
      "Apply baked per-part textures to the model (Studio apply_retexture). Each entry needs a raw part name plus a local image already baked for that part by a Studio-compatible viewport workflow.",
    inputShape: {
      project_id: projectId,
      submit: z.boolean().optional(),
      textures: z
        .array(z.object({ image_path: z.string(), part_name: z.string().regex(PART_NAME) }).strict())
        .min(1)
        .max(MAX_PARTS)
        .describe("Per-part baked texture images.")
    },
    internalKind: "apply_retexture",
    title: "Apply texture edits",
    async build(ctx, input, taskId) {
      const pf = await preflight(ctx, "apply_retexture", input.project_id);
      const names = validatePartNames(input.textures.map((entry) => entry.part_name));
      const snapshots = [];
      const imageMap = [];
      const images = [];
      for (let index = 0; index < input.textures.length; index += 1) {
        const entry = input.textures[index];
        assertLocalPathSpecifier(entry.image_path, "operation_input_policy");
        const image = await stageLocalImage(ctx.config, ctx.gateway, ctx.uploader, entry.image_path, false, {
          deferUpload: ctx.deferUploads,
          index: index + 1,
          label: names[index],
          slot: `part:${names[index]}`,
          taskId
        });
        snapshots.push(image.provenance);
        imageMap.push({ image: directImageWire(image), part_name: names[index] });
        images.push({ part_name: names[index], ...image.metadata });
      }
      return {
        capabilities: pf.capabilities,
        metadata: { images },
        payload: { image_map: imageMap, model_version: TEXTURE_MODEL_VERSION, project_id: input.project_id },
        snapshots,
        warnings: [...pf.warnings, "Each input must be a complete per-part texture already baked by a Studio-compatible viewport workflow; the backend accepts no mask field."]
      };
    },
    submitRemote: postprocessSubmit("apply_retexture"),
    syncRemote: postprocessSync()
  },

  "texture.upscale": {
    category: "postprocess",
    consumesCredits: true,
    description: "Upscale the project's texture set. quality=detailed targets 4K, ultra targets 8K. A project already at 8K cannot be downscaled to 4K.",
    inputShape: {
      project_id: projectId,
      quality: z.enum(["detailed", "ultra"]).describe("detailed=4K, ultra=8K."),
      submit: z.boolean().optional()
    },
    internalKind: "texture_upscale",
    title: "Upscale textures",
    async build(ctx, input) {
      const pf = await preflight(ctx, "texture_upscale", input.project_id);
      if (input.quality === "detailed" && pf.capabilities.is_ultra_textured === true) {
        throw new TripoError("REMOTE_API_ERROR", "A current 8K project cannot be downscaled to the 4K target in Studio.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
      }
      return {
        capabilities: pf.capabilities,
        payload: { model_version: TEXTURE_MODEL_VERSION, project_id: input.project_id, texture_quality: input.quality },
        snapshots: [],
        warnings: pf.warnings
      };
    },
    submitRemote: postprocessSubmit("texture_upscale"),
    syncRemote: postprocessSync()
  },

  "texture.pbr": {
    category: "postprocess",
    consumesCredits: true,
    description: "Generate PBR material maps for an already-textured project.",
    inputShape: { project_id: projectId, submit: z.boolean().optional() },
    internalKind: "pbr",
    title: "Generate PBR maps",
    async build(ctx, input) {
      const pf = await preflight(ctx, "pbr", input.project_id);
      return {
        capabilities: pf.capabilities,
        payload: { model_version: TEXTURE_MODEL_VERSION, project_id: input.project_id },
        snapshots: [],
        warnings: pf.warnings
      };
    },
    submitRemote: postprocessSubmit("pbr"),
    syncRemote: postprocessSync()
  },

  "model.rig": {
    category: "postprocess",
    consumesCredits: true,
    description:
      "Auto-rig a textured project, default V3 with humanoid skeleton presets (ActorCore/Mixamo/Unreal/VRM/Unity). Runs Studio's rig precheck before staging; legacy V1/V2.5 remain selectable, and legacy bipeds use V1.",
    inputShape: {
      model_version: z.enum([RIGGING_MODEL_VERSION_V1, RIGGING_MODEL_VERSION_V2_5, RIGGING_MODEL_VERSION_V3]).default(RIGGING_MODEL_VERSION_V3),
      skeleton_preset: z.enum(SKELETON_PRESETS).optional().describe("V3 humanoid spec: actorcore, mixamo, unreal, vrm, unity."),
      rigging_type: z.enum(["humanoid", "other"]).default("humanoid"),
      project_id: projectId,
      submit: z.boolean().optional()
    },
    internalKind: "rigging",
    title: "Auto-rig model",
    async build(ctx, input) {
      const requestedModelVersion = validateRiggingModelVersion(input.model_version);
      if (input.skeleton_preset && (requestedModelVersion !== RIGGING_MODEL_VERSION_V3 || input.rigging_type !== "humanoid")) throw new TripoError("INVALID_INPUT", "skeleton_preset requires V3 humanoid rigging.");
      const pf = await preflight(ctx, "rigging", input.project_id);
      const precheck = await ctx.gateway.precheckRigging({ modelVersion: requestedModelVersion, projectId: input.project_id });
      const publicPrecheck = publicRiggingPrecheck(precheck, requestedModelVersion);
      if (!precheck.riggable) {
        throw new TripoError(
          "REMOTE_API_ERROR",
          precheck.rig_type === "biped" ? "Studio's rig precheck rejected this biped. A clear T-pose is required before Auto Rig." : "Studio's rig precheck determined that this model is not riggable.",
          { details: { riggable: precheck.riggable, rig_type: precheck.rig_type }, safeToRetryPaidOperation: true, stage: "rigging_precheck" }
        );
      }
      if (requestedModelVersion === RIGGING_MODEL_VERSION_V3 && input.rigging_type === "humanoid" && precheck.rig_type !== "biped") {
        throw new TripoError("INVALID_INPUT", "The selected humanoid rig requires a biped precheck result. Use rigging_type=other for the detected animal rig.", { details: { rig_type: precheck.rig_type }, safeToRetryPaidOperation: true, stage: "rigging_precheck" });
      }
      if (precheck.rig_type === "others" || publicPrecheck.submission_model_version === null) {
        throw new TripoError("REMOTE_API_ERROR", "Studio's rig precheck did not identify a supported rig type.", {
          details: { riggable: precheck.riggable, rig_type: precheck.rig_type },
          safeToRetryPaidOperation: true,
          stage: "rigging_precheck"
        });
      }
      const warnings = [...pf.warnings];
      if (precheck.rig_type === "biped" && publicPrecheck.submission_model_version !== requestedModelVersion) {
        warnings.push(`Studio forces biped Auto Rig submissions to ${RIGGING_MODEL_VERSION_V1}.`);
      }
      return {
        capabilities: pf.capabilities,
        metadata: { rigging_precheck: publicPrecheck },
        payload: { model_version: publicPrecheck.submission_model_version, project_id: input.project_id, rig_type: requestedModelVersion === RIGGING_MODEL_VERSION_V3 && input.rigging_type === "humanoid" ? "biped" : precheck.rig_type, ...(requestedModelVersion === RIGGING_MODEL_VERSION_V3 && input.rigging_type === "humanoid" ? { spec: input.skeleton_preset ?? "actorcore" } : {}) },
        snapshots: [],
        warnings
      };
    },
    submitRemote: postprocessSubmit("rigging"),
    syncRemote: postprocessSync()
  },

  "model.animate": {
    category: "postprocess",
    consumesCredits: true,
    description:
      "Retarget a Studio animation preset onto an already-rigged project. animation must be an exact preset id (preset:<rig_type>:<name>) — see tripo_list_animation_presets or tripo_get_model include animation_presets. rig_type must match the project's rig.",
    inputShape: {
      animation: z.string().describe("Exact Studio preset id, e.g. preset:biped:walk."),
      project_id: projectId,
      rig_type: z.string().describe("The project's rig type."),
      submit: z.boolean().optional()
    },
    internalKind: "animation_retarget",
    title: "Retarget animation preset",
    async build(ctx, input) {
      if (!isRetargetRigType(input.rig_type)) {
        throw new TripoError("INVALID_INPUT", "rig_type is not supported by Studio animation retargeting.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
      }
      if (!isAnimationPreset(input.animation) || animationPresetRigType(input.animation) !== input.rig_type) {
        throw new TripoError(
          "INVALID_INPUT",
          'animation must be an exact current Studio preset identifier for the selected rig_type. Use tripo_list_animation_presets or tripo_get_model include ["animation_presets"].',
          { safeToRetryPaidOperation: true, stage: "operation_stage" }
        );
      }
      const pf = await preflight(ctx, "animation_retarget", input.project_id, { rigType: input.rig_type });
      return {
        capabilities: pf.capabilities,
        metadata: { preset_catalog_verified: true },
        payload: { animations: [input.animation], model_version: STUDIO_DEFAULT_MODEL_VERSION, project_id: input.project_id, rig_type: input.rig_type },
        snapshots: [],
        warnings: pf.warnings
      };
    },
    submitRemote: postprocessSubmit("animation_retarget"),
    syncRemote: postprocessSync()
  }
};
