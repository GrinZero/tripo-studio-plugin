import { z } from "zod";

export const apiEnvelopeSchema = z
  .object({
    code: z.number(),
    data: z.unknown().optional(),
    message: z.string().optional(),
    msg: z.string().optional()
  })
  .loose();

export const temporaryTokenSchema = z
  .object({
    host: z.string().min(1).optional(),
    resource_bucket: z.string().min(1),
    resource_uri: z.string().min(1),
    session_token: z.string().min(1),
    sts_ak: z.string().min(1),
    sts_sk: z.string().min(1)
  })
  .loose();

export const auditResultSchema = z
  .object({
    age_confirm_status: z.enum(["confirmed", "denied", "unconfirmed"]).optional(),
    result: z.enum(["pass", "sensitive", "nsfw", "reject"])
  })
  .loose();

export const generationReceiptSchema = z
  .object({
    operator_id: z.string().min(1),
    project_id: z.string().min(1).optional()
  })
  .loose();

export const generationResponseSchema = z.union([
  generationReceiptSchema,
  z.array(generationReceiptSchema).min(1).transform((entries) => entries[0])
]);

export const modelGenerationReceiptsSchema = z
  .union([
    generationReceiptSchema.transform((entry) => [entry]),
    z.array(generationReceiptSchema).min(1).max(120)
  ])
  .transform((entries) => [...entries]);

export const progressItemSchema = z
  .object({
    id: z.string().optional(),
    left_time: z.union([z.number(), z.string()]).optional(),
    operator_id: z.string().optional(),
    progress: z.number().optional(),
    project_id: z.string().optional(),
    reason: z.unknown().optional(),
    status: z.enum(["banned", "cancelled", "expired", "failed", "prepare", "queued", "running", "success", "unknown"])
  })
  .loose();
export const progressResponseSchema = z.array(progressItemSchema);

export const projectRetargetArtifactSchema = z
  .object({
    model_url: z.url().max(16384).optional().or(z.literal("")),
    name: z.string().min(1).max(256).optional(),
    operator_id: z.string().min(1).max(256).optional()
  })
  .loose();
export const projectRetargetArtifactsSchema = z.array(projectRetargetArtifactSchema).max(256);

export const projectOperatorSchema = z
  .object({
    Retarget: projectRetargetArtifactsSchema.optional(),
    retarget: projectRetargetArtifactsSchema.optional(),
    retarget_model: projectRetargetArtifactsSchema.optional()
  })
  .loose();

const sizedCover = z
  .object({
    sizes: z.array(z.object({ url: z.url().or(z.literal("")), width: z.number().finite().nonnegative() }).loose()).max(32).optional(),
    url: z.url().or(z.literal("")).optional()
  })
  .loose();

export const projectDetailSchema = z
  .object({
    biz_info: z.object({ short_description: z.string().max(2000).optional() }).loose().optional(),
    cover_image: z.array(z.url().or(z.literal(""))).max(8).optional(),
    cover_image_object: z.array(sizedCover).max(8).optional(),
    id: z.string().optional(),
    model_url: z.url().optional().or(z.literal("")),
    operator: projectOperatorSchema.optional(),
    point_cloud_model_url: z.url().optional().or(z.literal("")),
    project_name: z.string().optional(),
    status: z.string().optional(),
    visibility: z.enum(["private", "public", "shareable"]).optional()
  })
  .loose();

export const modelAssetSchema = z
  .object({
    biz_info: z.object({ short_description: z.string().max(2000).optional() }).loose().optional(),
    collected: z.boolean().optional(),
    content_risk_level: z.string().max(128).optional(),
    cover_image: z.array(z.url().or(z.literal(""))).max(8).optional(),
    cover_image_object: z.array(sizedCover).max(8).optional(),
    create_time: z.string().max(128).optional(),
    id: z.string().min(1).max(256),
    is_nsfw: z.boolean().optional(),
    is_owner: z.boolean().optional(),
    project_name: z.string().max(1000).optional(),
    running_operator: z.unknown().optional(),
    type: z.string().max(128).optional(),
    visibility: z.enum(["private", "public", "shareable"]).optional()
  })
  .loose();

export const modelAssetsPageSchema = z
  .object({
    max_assets: z.number().int().nonnegative(),
    projects: z.array(modelAssetSchema).max(100),
    total: z.number().int().nonnegative()
  })
  .loose();

export const retextureResultSchema = z
  .object({
    camera_matrix: z.array(z.number().finite()).length(16),
    url: z.url()
  })
  .loose();
export const retextureImagesSchema = z.object({ images: z.array(retextureResultSchema) }).loose();

export const rigTypeSchema = z.enum(["aquatic", "avian", "biped", "hexapod", "octopod", "quadruped", "serpentine", "others"]);
export const rigPrecheckResultSchema = z
  .object({
    riggable: z.boolean(),
    rig_type: rigTypeSchema
  })
  .loose();

export const studioImageModelSchema = z.enum([
  "flux.1_dev",
  "flux.1_kontext_pro",
  "gemini_2.5_flash_image_preview",
  "gemini_3.1_flash_image_preview",
  "gemini_3_pro_image_preview",
  "gpt_4o",
  "gpt_image_1.5",
  "gpt_image_2",
  "gpt_image_2.5_sunburst",
  "midjourney"
]);

export const studioImageOutputSchema = z
  .object({
    bucket: z.string().min(1).max(512),
    image_audit_result: z.enum(["pass", "sensitive", "nsfw", "reject"]).optional(),
    key: z.string().min(1).max(2048),
    url: z.url()
  })
  .loose();

export const studioImageAssetSchema = z
  .object({
    asset_id: z.string().min(1).max(256).regex(/^[^\s\u0000-\u001f\u007f]+$/),
    create_time: z.union([z.string().max(128), z.number().finite()]).optional(),
    input: z.record(z.string(), z.unknown()).default({}),
    output: z
      .preprocess(
        (value) => value ?? {},
        z.object({ data: z.array(studioImageOutputSchema).max(16).default([]) }).loose()
      )
      .default({ data: [] }),
    status: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_-]*$/),
    type: z.enum(["generate_image", "multiview_images", "split_image", "upscale_image"])
  })
  .loose();

export const studioImageAssetsPageSchema = z.object({ assets: z.array(studioImageAssetSchema).max(100) }).loose();

export const studioImageTemplateSchema = z
  .object({
    description: z.string().max(4000).optional(),
    image: z.union([z.url(), z.literal(""), z.array(z.url()).max(16)]).optional(),
    tag: z.array(z.string().min(1).max(128)).max(32),
    template_id: z.string().min(1).max(256).regex(/^[^\s\u0000-\u001f\u007f]+$/),
    title: z.string().min(1).max(512)
  })
  .loose();
export const studioImageTemplatesSchema = z.object({ templates: z.array(studioImageTemplateSchema).max(500) }).loose();

export const studioImageSubmissionSchema = z.object({ asset_id: z.string().min(1).max(256) }).loose();

const remoteId = z.string().min(1).max(256);
const storageArtifact = z.object({ bucket: z.string(), key: z.string(), url: z.union([z.url(), z.literal("")]) }).loose();
export const uvContextSchema = z.object({
  project_id: remoteId, current_operator_id: remoteId,
  next_action: z.enum(["generate", "retry"]),
  candidates: z.array(z.object({ operator_id: remoteId, created_at: z.number().finite().nonnegative(), model: storageArtifact, uv_layout: storageArtifact }).loose()).max(100),
  running_task: z.object({ operator_id: remoteId, action: z.enum(["generate", "retry"]), status: z.enum(["queued", "running"]) }).loose().nullable()
}).loose();
export const uvReceiptSchema = z.object({ operator_id: remoteId, project_id: remoteId, current_operator_id: remoteId, action: z.enum(["generate", "retry"]), status: z.literal("queued") }).loose();
export const uvApplySchema = z.object({ project_id: remoteId, previous_operator_id: remoteId, current_operator_id: remoteId }).loose();
export const exportReceiptSchema = z.union([z.object({ model_url: z.url() }).loose(), generationReceiptSchema]);
export const exportDownloadSchema = z.object({ model_url: z.url() }).loose();
export const motionTaskSchema = z.object({ task_id: remoteId, status: z.enum(["queued", "running", "success", "failed", "expired"]), asset_id: remoteId.nullish() }).loose();
export const motionAssetSchema = z.object({ asset_id: remoteId, motion_url: z.url(), title: z.string().optional(), task_id: remoteId.optional(), motion: z.string().optional(), input: z.object({ segments: z.array(z.unknown()).max(5) }).loose().optional() }).loose();
export const motionAssetsSchema = z.object({ assets: z.array(motionAssetSchema).max(10000), active_tasks: z.array(motionTaskSchema).max(1000) }).loose();
