export const SERVER_NAME = "tripo-studio-plugin";
export const SERVER_VERSION = "0.3.3";

export const STUDIO_ORIGIN = "https://studio.tripo3d.ai";
export const STUDIO_API_BASE_URL = "https://api.tripo3d.ai";
export const STUDIO_WORKSPACE_URL = `${STUDIO_ORIGIN}/workspace/generate`;
export const TRIPO_ACCOUNT_ORIGIN = "https://www.tripo3d.ai";

// Studio model versions observed on the production Studio contract (2026-10).
export const NEXUS_MODEL_VERSION = "Nexus-v1.0-20260214";
export const NEXUS_V2_MODEL_VERSION = "Nexus-v2.0-20260801";
export const SMART_MESH_MODEL_VERSIONS = [NEXUS_MODEL_VERSION, NEXUS_V2_MODEL_VERSION];
export const NEXUS_MIN_FACES = 500;
export const NEXUS_MAX_FACES = 25000;
export const STUDIO_DEFAULT_MODEL_VERSION = "default";
export const SEGMENTATION_MODEL_VERSION = "v2.0-20260430";
export const COMPLETION_MODEL_VERSION = "v1.0-20250506";
export const TEXTURE_MODEL_VERSION = "v3.0-20250812";
export const RIGGING_MODEL_VERSION_V1 = "v1.0-20240301";
export const RIGGING_MODEL_VERSION_V2_5 = "v2.5-20260210";
export const RIGGING_MODEL_VERSION_V3 = "v3.0-20260909";
export const SKELETON_PRESETS = ["actorcore", "mixamo", "unreal", "vrm", "unity"];
export const HIGH_DETAIL_MODEL_VERSIONS = ["v2.5-20250123", "v3.0-20250812", "v3.1-20260211"];
export const TEXT_IMAGE_MODEL_VERSION = "flux.1_dev";

export const REMESH_MIN_FACES = 500;
export const REMESH_NORMAL_QUAD_MAX_FACES = 50000;
export const REMESH_NORMAL_TRIANGLE_MAX_FACES = 150000;
export const REMESH_SMART_QUAD_MAX_FACES = 10000;
export const REMESH_SMART_TRIANGLE_MAX_FACES = 20000;

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const S3_MULTIPART_SIZE = 10 * 1024 * 1024;
export const MAX_MODEL_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_IMPORT_MODEL_BYTES = 150 * 1024 * 1024;
export const MAX_IMPORT_MODEL_FACES = 3e6;

export const STUDIO_IMAGE_MODELS = [
  "flux.1_dev",
  "flux.1_kontext_pro",
  "gpt_4o",
  "gpt_image_1.5",
  "gpt_image_2",
  "gpt_image_2.5_sunburst",
  "midjourney",
  "gemini_2.5_flash_image_preview",
  "gemini_3.1_flash_image_preview",
  "gemini_3_pro_image_preview"
];
export const STUDIO_IMAGE_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];
export const STUDIO_IMAGE_RESOLUTIONS = ["1K", "4K"];

export const RIG_TYPES = ["aquatic", "avian", "biped", "hexapod", "octopod", "quadruped", "serpentine", "others"];
export const RETARGET_RIG_TYPES = RIG_TYPES.filter((t) => t !== "others");

export const OPERATION_KINDS = [
  "image.generate",
  "image.multiview",
  "image.regenerate",
  "model.generate",
  "model.import",
  "model.segment",
  "model.complete_parts",
  "model.remesh",
  "texture.generate",
  "texture.edit_preview",
  "texture.edit_apply",
  "texture.upscale",
  "texture.pbr",
  "model.rig",
  "model.animate",
  "model.export",
  "model.uv_generate",
  "model.uv_apply",
  "motion.generate",
  "model.apply_motion",
  "image.upscale",
  "image.split",
  "local.render",
  "local.inspect_parts",
  "local.edit_parts",
  "local.project_texture",
  "local.paint",
  "local.crop"
];

export const TASK_STATES = [
  "queued",
  "running",
  "waiting_for_auth",
  "succeeded",
  "failed",
  "canceled",
  "outcome_unknown"
];
export const TASK_PHASES = [
  "queued",
  "validating",
  "staging",
  "dispatching",
  "remote_processing",
  "downloading",
  "archiving",
  "terminal"
];
export const TERMINAL_STATES = new Set(["succeeded", "failed", "canceled", "outcome_unknown"]);

export const WORKBENCH_RESOURCE_URI = "ui://tripo-studio/workbench-v0.3.3.html";

export const RESULT_CARD_RESOURCE_URI = "ui://tripo-studio/result-card-v2.html";
