import { TripoError } from "../errors.mjs";
import {
  auditResultSchema,
  generationResponseSchema,
  modelAssetsPageSchema,
  modelGenerationReceiptsSchema,
  progressResponseSchema,
  projectDetailSchema,
  retextureImagesSchema,
  retextureResultSchema,
  rigPrecheckResultSchema,
  studioImageAssetsPageSchema,
  studioImageAssetSchema,
  studioImageSubmissionSchema,
  studioImageTemplatesSchema,
  temporaryTokenSchema
} from "./schemas.mjs";
import { uvContextSchema, uvReceiptSchema, uvApplySchema, exportReceiptSchema, exportDownloadSchema, motionTaskSchema, motionAssetSchema, motionAssetsSchema } from "./schemas.mjs";

const parseWith = (schema, value) => schema.parse(value);

function summarizePayment(value, depth = 0) {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => summarizePayment(entry, depth + 1));
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/id|email|phone|avatar|name|token|secret/i.test(key)) continue;
    if (/credit|balance|point|quota|reset|expire|member|plan|subscription|trial|used|total|remain|type|status/i.test(key)) {
      output[key] = summarizePayment(entry, depth + 1);
    } else if (entry !== null && typeof entry === "object") {
      const nested = summarizePayment(entry, depth + 1);
      if (nested && typeof nested === "object" && Object.keys(nested).length > 0) output[key] = nested;
    }
  }
  return output;
}

export class StudioGateway {
  #http;
  constructor(http) {
    this.#http = http;
  }

  async getUvContext(body) {
    return this.#http.request({ body, method: "POST", path: "/v2/studio/operation/uv_edit/context", retrySafe: true }, (value) => uvContextSchema.parse(value));
  }
  async submitUv(body) {
    return this.#http.request({ body, method: "POST", path: "/v2/studio/operation/uv_edit/generate", retrySafe: false }, (value) => uvReceiptSchema.parse(value));
  }
  async applyUv(body) {
    return this.#http.request({ body, method: "POST", path: "/v2/studio/operation/uv_edit/apply", retrySafe: false }, (value) => uvApplySchema.parse(value));
  }
  async submitExport(body) {
    return this.#http.request({ body, method: "POST", path: "/v2/studio/operation/export", retrySafe: false, timeoutMs: 90000 }, (value) => exportReceiptSchema.parse(value));
  }
  async getExportDownload(operatorId, name) {
    return this.#http.request({ body: { file_name: name, operator_id: operatorId }, method: "POST", path: "/v2/studio/operation/download_with_name", retrySafe: true }, (value) => exportDownloadSchema.parse(value));
  }
  async submitMotion(body) {
    return this.#http.request({ body, method: "POST", path: "/v2/studio/motion/generate", retrySafe: false, timeoutMs: 90000 }, (value) => motionTaskSchema.parse(value));
  }
  async getMotionTask(taskId) {
    return this.#http.request({ body: { task_id: taskId }, method: "POST", path: "/v2/studio/motion/get_task", retrySafe: true }, (value) => motionTaskSchema.parse(value));
  }
  async getMotionAsset(assetId) {
    return this.#http.request({ body: { asset_id: assetId }, method: "POST", path: "/v2/studio/motion/get_asset", retrySafe: true }, (value) => motionAssetSchema.parse(value));
  }
  async listMotionAssets() {
    return this.#http.request({ body: {}, method: "POST", path: "/v2/studio/motion/list_assets", retrySafe: true }, (value) => motionAssetsSchema.parse(value));
  }
  async submitImageTransform(endpoint, body) {
    if (!["upscale", "split"].includes(endpoint)) throw new TripoError("INVALID_INPUT", "Unsupported image transform.");
    return this.#http.request({ body, method: "POST", path: `/v2/studio/image/${endpoint}`, retrySafe: false, timeoutMs: 90000 }, (value) => studioImageSubmissionSchema.parse(value));
  }

  async getPaymentSummary() {
    const data = await this.#http.request(
      { authRecoverySafe: true, method: "GET", path: "/v2/studio/user/profile/payment", retrySafe: true },
      (value) => value
    );
    const summary = summarizePayment(data);
    return summary && typeof summary === "object" && !Array.isArray(summary) ? summary : {};
  }

  // These are read-only quota lookups used by Studio's own pricing display.
  async getOperationQuota() {
    return this.#http.request({ body: {}, method: "POST", path: "/v2/studio/operation/quota", retrySafe: true, authRecoverySafe: true }, (value) => value);
  }

  async getPricingTrials() {
    return this.#http.request({ method: "GET", path: "/v2/studio/marketing/detail", query: { locale: "zh" }, retrySafe: true, authRecoverySafe: true }, (value) => value);
  }

  async requestTemporaryToken(format) {
    return await this.#http.request(
      { body: { client: "aws", format }, method: "POST", path: "/v2/studio/storage/temporary_token", retrySafe: true },
      (value) => parseWith(temporaryTokenSchema, value)
    );
  }

  async listModels(input) {
    if (!Number.isSafeInteger(input.offset) || input.offset < 0 || input.offset > 1e6) {
      throw new TripoError("CONFIGURATION_ERROR", "Model-list offset must be an integer from 0 through 1,000,000.", { stage: "model_list" });
    }
    return await this.#http.request(
      {
        method: "GET",
        path: "/v2/studio/assets/v2",
        query: { asset_type: input.assetScope, offset: input.offset, size: 20, type: input.filter },
        retrySafe: true
      },
      (value) => parseWith(modelAssetsPageSchema, value)
    );
  }

  async auditImage(image) {
    return await this.#http.request(
      { body: { image }, method: "POST", path: "/v2/studio/audit/image", retrySafe: true },
      (value) => parseWith(auditResultSchema, value)
    );
  }

  async submitModelGeneration(input) {
    const endpoints = {
      image: "/v2/studio/operation/image_to_model",
      multiview: "/v2/studio/operation/multiview_to_model",
      batch: "/v2/studio/operation/batch_image_to_model",
      text: "/v2/studio/operation/text_to_model"
    };
    return await this.#http.request(
      { body: input.body, method: "POST", path: endpoints[input.mode], retrySafe: false, timeoutMs: 90000 },
      (value) => parseWith(modelGenerationReceiptsSchema, value)
    );
  }

  async submitModelImport(input) {
    return await this.#http.request(
      {
        body: {
          format: input.format,
          model: input.model,
          name: input.name,
          transform_matrix: input.transform_matrix,
          use_original_uv: input.use_original_uv
        },
        method: "POST",
        path: "/v2/studio/operation/import_user_model",
        retrySafe: false,
        timeoutMs: 90000
      },
      (value) => parseWith(generationResponseSchema, value)
    );
  }

  async precheckRigging(input) {
    return await this.#http.request(
      { body: { model_version: input.modelVersion, project_id: input.projectId }, method: "POST", path: "/v2/studio/operation/pre_rig_check", retrySafe: true },
      (value) => parseWith(rigPrecheckResultSchema, value)
    );
  }

  async checkSymmetry(image) {
    return this.#http.request({ body: { image: { bucket: image.bucket, key: image.key } }, method: "POST", path: "/v2/studio/operation/symmetry_check", retrySafe: true }, (value) => {
      if (typeof value?.symmetry !== "boolean") throw new TripoError("INSUFFICIENT_EVIDENCE", "Invalid symmetry check response.");
      return value.symmetry;
    });
  }

  async submitPostprocess(endpoint, body) {
    return await this.#http.request(
      { body, method: "POST", path: `/v2/studio/operation/${endpoint}`, retrySafe: false, timeoutMs: 90000 },
      (value) => parseWith(generationResponseSchema, value)
    );
  }

  async getProgress(operatorIds) {
    if (operatorIds.length > 20 && operatorIds.length <= 120) {
      const pages = [];
      for (let index = 0; index < operatorIds.length; index += 20) pages.push(await this.getProgress(operatorIds.slice(index, index + 20)));
      return pages.flat();
    }
    if (operatorIds.length < 1 || operatorIds.length > 120) {
      throw new TripoError("CONFIGURATION_ERROR", "Progress queries accept between 1 and 20 operator IDs.", { stage: "progress" });
    }
    return await this.#http.request(
      { body: { ids: operatorIds }, method: "POST", path: "/v2/studio/progress", retrySafe: true },
      (value) => parseWith(progressResponseSchema, value)
    );
  }

  async getProject(projectId, operatorId) {
    return await this.#http.request(
      { method: "GET", path: `/v2/studio/project/detail/v3/${encodeURIComponent(projectId)}`, query: { operator_id: operatorId }, retrySafe: true },
      (value) => parseWith(projectDetailSchema, value)
    );
  }

  async getRetexture(operatorId) {
    return await this.#http.request(
      { body: { operator_id: operatorId }, method: "POST", path: "/v2/studio/operation/get_retexture", retrySafe: true },
      (value) => parseWith(retextureResultSchema, value)
    );
  }

  async getRetextureImages(projectId) {
    return await this.#http.request(
      { body: { project_id: projectId }, method: "POST", path: "/v2/studio/operation/get_retexture_images", retrySafe: true },
      (value) => parseWith(retextureImagesSchema, value)
    );
  }

  async listStudioImageTemplates() {
    return await this.#http.request(
      { method: "GET", path: "/v2/studio/image/available_templates", retrySafe: true },
      (value) => parseWith(studioImageTemplatesSchema, value)
    );
  }

  async listStudioImageAssets(pageNum, pageSize) {
    if (!Number.isSafeInteger(pageNum) || pageNum < 1 || pageNum > 1e5) {
      throw new TripoError("CONFIGURATION_ERROR", "Image-asset page_num must be an integer from 1 through 100,000.", { stage: "image_assets" });
    }
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new TripoError("CONFIGURATION_ERROR", "Image-asset page_size must be an integer from 1 through 100.", { stage: "image_assets" });
    }
    return await this.#http.request(
      { body: { page_num: pageNum, page_size: pageSize }, method: "POST", path: "/v2/studio/image/image_assets", retrySafe: true },
      (value) => parseWith(studioImageAssetsPageSchema, value)
    );
  }

  async getStudioImageAsset(assetId) {
    return await this.#http.request(
      { body: { asset_id: assetId }, method: "POST", path: "/v2/studio/image/get_image_asset", retrySafe: true },
      (value) => parseWith(studioImageAssetSchema, value)
    );
  }

  async submitStudioImage(input) {
    return await this.#http.request(
      { body: input, method: "POST", path: "/v2/studio/image/gen_image_v2", retrySafe: false, timeoutMs: 90000 },
      (value) => parseWith(studioImageSubmissionSchema, value)
    );
  }

  async submitStudioMultiview(input) {
    return await this.#http.request(
      { body: input, method: "POST", path: "/v2/studio/image/gen_multiview", retrySafe: false, timeoutMs: 90000 },
      (value) => parseWith(studioImageSubmissionSchema, value)
    );
  }

  async regenerateStudioImage(assetId) {
    return await this.#http.request(
      { body: { asset_id: assetId }, method: "POST", path: "/v2/studio/image/re_gen_image", retrySafe: false, timeoutMs: 90000 },
      (value) => parseWith(studioImageSubmissionSchema, value)
    );
  }

  async regenerateStudioMultiview(assetId) {
    return await this.#http.request(
      { body: { asset_id: assetId }, method: "POST", path: "/v2/studio/image/re_gen_multiview", retrySafe: false, timeoutMs: 90000 },
      (value) => parseWith(studioImageSubmissionSchema, value)
    );
  }
}
