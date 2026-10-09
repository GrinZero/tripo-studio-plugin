import { z } from "zod";
import { TripoError } from "../errors.mjs";
import { STUDIO_IMAGE_MODELS, STUDIO_IMAGE_RATIOS, STUDIO_IMAGE_RESOLUTIONS } from "../constants.mjs";
import { stageLocalImage } from "./images.mjs";
import { assertLocalPathSpecifier } from "../security/path-policy.mjs";

const identifier = z.string().regex(/^[^\s\u0000-\u001f\u007f]{1,256}$/);

const auditEnum = z.enum(["pass", "sensitive"]);
const imageReferenceSchema = z
  .object({
    bucket: z.string().min(1).max(512),
    image_audit_result: auditEnum,
    image_source: z.enum(["generate", "upload"]),
    key: z.string().min(1).max(2048)
  })
  .strict();

const imageWireSchema = z
  .object({
    amount: z.number().int().min(1).max(4),
    if_upload: z.literal(true),
    image: imageReferenceSchema.optional(),
    images: z.array(imageReferenceSchema).min(2).max(10).optional(),
    model_version: z.enum(STUDIO_IMAGE_MODELS),
    prompt: z.string().max(1000),
    resolution: z.enum(STUDIO_IMAGE_RESOLUTIONS),
    scale: z.enum(STUDIO_IMAGE_RATIOS),
    sketch_to_render: z.boolean(),
    t_pose: z.boolean(),
    template_id: z.string().min(1).max(256).optional()
  })
  .strict();

const multiviewWireSchema = z.object({ if_upload: z.literal(true), image: imageReferenceSchema }).strict();
const regenerationWireSchema = z.object({ asset_id: z.string().min(1).max(256) }).strict();

const imageInputShape = {
  allow_sensitive: z.boolean().optional().describe("Permit an output marked 'sensitive' by the Studio audit. Only set after reviewing the image."),
  amount: z.number().int().min(1).max(4).default(1).describe("Number of images to generate (1-4)."),
  image_paths: z.array(z.string()).max(10).optional().describe("Local reference image paths (PNG/JPEG/WebP, up to 10). Not accepted by the Midjourney model."),
  studio_references: z.array(z.object({ asset_id: identifier, output_index: z.number().int().min(0).max(15).default(0) }).strict()).max(10).optional().describe("Reference existing completed Studio image outputs directly, without downloading/re-uploading. Combined reference limit: 10."),
  model_version: z.enum(STUDIO_IMAGE_MODELS).default("gpt_image_2").describe("Studio image model."),
  prompt: z.string().max(1000).default("").describe("Text prompt; required unless reference images or a template are given."),
  resolution: z.enum(STUDIO_IMAGE_RESOLUTIONS).default("1K"),
  scale: z.enum(STUDIO_IMAGE_RATIOS).default("1:1"),
  sketch_to_render: z.boolean().default(false),
  submit: z.boolean().optional().describe("When true, stage and dispatch the paid Studio request in this single call."),
  t_pose: z.boolean().default(false),
  template_id: identifier.optional().describe("Studio image template id from tripo_list_image_templates.")
};

async function auditStudioOutput(ctx, output, allowSensitive) {
  let audit = output.image_audit_result;
  if (audit !== "pass" && audit !== "sensitive") {
    audit = (await ctx.gateway.auditImage({ bucket: output.bucket, key: output.key })).result;
  }
  if (audit === "sensitive" && !allowSensitive) {
    throw new TripoError("CONTENT_AUDIT_REJECTED", "The selected generated image is sensitive. Call again with allow_sensitive=true only after review.", { stage: "image_generation_audit" });
  }
  if (audit !== "pass" && audit !== "sensitive") {
    throw new TripoError("CONTENT_AUDIT_REJECTED", "The selected generated image did not pass the Studio audit.", { stage: "image_generation_audit" });
  }
  return audit;
}

export const imageOperations = {
  "image.generate": {
    category: "image",
    consumesCredits: true,
    description:
      "Generate or edit 1-4 images in Tripo Studio using text, up to 10 local/Studio references, and/or a template, including GPT Image 2.5. Creates a durable task; dispatch only with submit=true or tripo_submit_task.",
    inputShape: imageInputShape,
    title: "Generate Studio image",
    async build(ctx, input, taskId) {
      const imagePaths = input.image_paths ?? [];
      const studioReferences = input.studio_references ?? [];
      const referenceCount = imagePaths.length + studioReferences.length;
      if (referenceCount > 10) throw new TripoError("INVALID_INPUT", "Combined local and Studio reference limit is 10.", { stage: "image_generation_prepare" });
      const prompt = input.prompt.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
      if (!prompt && referenceCount === 0 && input.template_id === undefined) {
        throw new TripoError("INVALID_INPUT", "Provide a prompt, at least one reference image, or a template_id.", { stage: "image_generation_prepare" });
      }
      if (input.model_version === "midjourney" && referenceCount > 0) {
        throw new TripoError("INVALID_INPUT", "The current Studio Midjourney mode does not accept uploaded reference images.", { stage: "image_generation_prepare" });
      }
      const snapshots = [];
      const references = [];
      for (const ref of studioReferences) {
        const asset = await ctx.gateway.getStudioImageAsset(ref.asset_id);
        const output = asset.output.data[ref.output_index];
        if (asset.asset_id !== ref.asset_id || asset.status !== "success" || !output?.bucket || !output.key) {
          throw new TripoError("INSUFFICIENT_EVIDENCE", "The referenced Studio image output is not complete or does not exist.", { stage: "image_generation_prepare" });
        }
        const audit = await auditStudioOutput(ctx, output, input.allow_sensitive ?? false);
        references.push({ bucket: output.bucket, key: output.key, image_audit_result: audit, image_source: "generate" });
      }
      for (const [index, imagePath] of imagePaths.entries()) {
        assertLocalPathSpecifier(imagePath, "image_generation_input_policy");
        const staged = await stageLocalImage(ctx.config, ctx.gateway, ctx.uploader, imagePath, true, {
          index: index + 1,
          label: `Reference ${index + 1}`,
          slot: `reference_${index + 1}`,
          taskId
        });
        if (staged.audit.result === "sensitive" && !input.allow_sensitive) {
          throw new TripoError("CONTENT_AUDIT_REJECTED", "A reference image is sensitive. Retry with allow_sensitive=true only after review.", {
            safeToRetryPaidOperation: true,
            stage: "image_generation_audit"
          });
        }
        snapshots.push(staged.provenance);
        references.push({ bucket: staged.uploaded.bucket, image_audit_result: staged.audit.result, image_source: "upload", key: staged.uploaded.key });
      }
      const candidate = {
        amount: input.amount,
        if_upload: true,
        model_version: input.model_version,
        prompt,
        resolution: input.resolution,
        scale: input.scale,
        sketch_to_render: input.sketch_to_render,
        t_pose: input.t_pose,
        ...(input.template_id === undefined ? {} : { template_id: input.template_id }),
        ...(references.length === 1 ? { image: references[0] } : {}),
        ...(references.length > 1 ? { images: references } : {})
      };
      const payload = imageWireSchema.parse(candidate);
      return { metadata: { reference_count: references.length, studio_references: studioReferences }, payload, snapshots };
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.submitStudioImage(task.payload);
      return { asset_id: receipt.asset_id };
    },
    async syncRemote(ctx, task) {
      const asset = await ctx.gateway.getStudioImageAsset(task.remote.asset_id);
      if (asset.asset_id !== task.remote.asset_id) {
        throw new TripoError("INSUFFICIENT_EVIDENCE", "Studio returned a different image asset.", { stage: "task_progress" });
      }
      const status = remoteAssetStatus(asset.status);
      return {
        progress: { status: asset.status },
        result: status === "succeeded" ? { outputs: asset.output.data.map((o, index) => ({ index, url: o.url })), type: asset.type } : undefined,
        status
      };
    }
  },

  "image.multiview": {
    category: "image",
    consumesCredits: true,
    description:
      "Generate the four-view (front/left/back/right) multiview set for an existing successful generate_image Studio asset. Use tripo_list_image_assets to find the source asset.",
    inputShape: {
      allow_sensitive: z.boolean().optional(),
      output_index: z.number().int().min(0).max(15).default(0).describe("Which output image of the source asset feeds the multiview."),
      source_asset_id: identifier.describe("A successful type=generate_image Studio image asset id."),
      submit: z.boolean().optional()
    },
    title: "Generate four-view set",
    async build(ctx, input) {
      const asset = await ctx.gateway.getStudioImageAsset(input.source_asset_id);
      if (asset.asset_id !== input.source_asset_id || asset.status !== "success" || asset.type !== "generate_image") {
        throw new TripoError("INSUFFICIENT_EVIDENCE", "The multiview action requires a successful single-image Studio asset.", { stage: "image_generation_prepare" });
      }
      const output = asset.output.data[input.output_index];
      if (!output) throw new TripoError("PLAN_NOT_FOUND", "The selected generated-image output index does not exist.", { stage: "image_generation_prepare" });
      const audit = await auditStudioOutput(ctx, output, input.allow_sensitive ?? false);
      const payload = multiviewWireSchema.parse({
        if_upload: true,
        image: { bucket: output.bucket, image_audit_result: audit, image_source: "generate", key: output.key }
      });
      return { metadata: { output_index: input.output_index, source_asset_id: input.source_asset_id }, payload, snapshots: [] };
    },
    async submitRemote(ctx, task) {
      const receipt = await ctx.gateway.submitStudioMultiview(task.payload);
      return { asset_id: receipt.asset_id };
    },
    async syncRemote(ctx, task) {
      const asset = await ctx.gateway.getStudioImageAsset(task.remote.asset_id);
      const status = remoteAssetStatus(asset.status);
      return {
        progress: { status: asset.status },
        result: status === "succeeded" ? { outputs: asset.output.data.map((o, index) => ({ index, label: ["front", "left", "back", "right"][index] ?? `view_${index + 1}`, url: o.url })), type: asset.type } : undefined,
        status
      };
    }
  },

  "image.regenerate": {
    category: "image",
    consumesCredits: true,
    description: "Re-run an existing Studio image or multiview asset with the same settings. Produces a new asset; the source asset is unchanged.",
    inputShape: {
      asset_id: identifier.describe("Studio image asset id to regenerate (generate_image or multiview_images)."),
      submit: z.boolean().optional()
    },
    title: "Regenerate Studio image",
    async build(ctx, input) {
      const asset = await ctx.gateway.getStudioImageAsset(input.asset_id);
      if (asset.asset_id !== input.asset_id || !["generate_image", "multiview_images"].includes(asset.type) || ["prepare", "queued", "running"].includes(asset.status)) {
        throw new TripoError("INSUFFICIENT_EVIDENCE", "The source image asset is the wrong type or is still running.", { stage: "image_generation_prepare" });
      }
      return {
        metadata: { kind: asset.type === "multiview_images" ? "multiview" : "image", source_asset_id: input.asset_id },
        payload: regenerationWireSchema.parse({ asset_id: input.asset_id }),
        snapshots: []
      };
    },
    async submitRemote(ctx, task) {
      const sourceType = task.metadata?.kind;
      const receipt = sourceType === "multiview" ? await ctx.gateway.regenerateStudioMultiview(task.payload.asset_id) : await ctx.gateway.regenerateStudioImage(task.payload.asset_id);
      return { asset_id: receipt.asset_id };
    },
    async syncRemote(ctx, task) {
      const asset = await ctx.gateway.getStudioImageAsset(task.remote.asset_id);
      const status = remoteAssetStatus(asset.status);
      return {
        progress: { status: asset.status },
        result: status === "succeeded" ? { outputs: asset.output.data.map((o, index) => ({ index, url: o.url })), type: asset.type } : undefined,
        status
      };
    }
  }
};

function remoteAssetStatus(status) {
  if (status === "success") return "succeeded";
  if (status === "cancelled") return "canceled";
  if (status === "expired") return "expired";
  if (status === "banned") return "banned";
  if (status === "failed") return "failed";
  if (status === "prepare" || status === "queued") return "queued";
  return "running";
}
