import { createHash } from "node:crypto";
import { z } from "zod";
import contract from "./pricing-contract.mjs";
import { getOperation } from "../ops/registry.mjs";
import { normalizeSettings } from "../ops/modelgen.mjs";
import { TripoError } from "../errors.mjs";
import { NEXUS_MODEL_VERSION, NEXUS_V2_MODEL_VERSION } from "../constants.mjs";

const CACHE_MS = 5 * 60 * 1000;
const QUOTED_KINDS = new Set(["model.generate", "image.generate", "model.remesh", "texture.generate", "texture.upscale", "texture.pbr", "texture.edit_preview", "image.upscale", "model.complete_parts", "model.uv_generate", "model.segment"]);
const COST_FIELDS = ["tier", "mode", "model_version", "texture", "texture_quality", "geometry_quality", "pbr", "quad", "smart_poly", "generate_parts", "amount", "request_count", "quality", "action", "face_limit", "face_limits", "delight"];
const IMAGE_KEYS = {
  "flux.1_kontext_pro": "FLUX_1_pro", gpt_4o: "GPT_4o", gpt_image_2: "GPT_image_2",
  "gpt_image_2.5_sunburst": "GPT_image_2_5", midjourney: "Midjourney",
  "gemini_2.5_flash_image_preview": "NanoBanana", "gemini_3.1_flash_image_preview": "NanoBanana_2",
  "gemini_3_pro_image_preview": "NanoBanana_pro"
};

// Only numeric literals from a hash-verified, reviewed official bundle are read.
// Production JavaScript is never imported, evaluated or executed.
export function parsePricingConfig(source) {
  const block = source.match(/\{\s*AICompletion\s*:\s*\d+\s*,[^{}]+\}/)?.[0];
  if (!block) throw new Error("Official pricing configuration is unavailable.");
  const credits = {};
  for (const pair of block.slice(1, -1).split(",")) {
    const match = pair.trim().match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(\d+)$/);
    if (!match || Object.hasOwn(credits, match[1])) throw new Error("Unrecognized pricing literal.");
    credits[match[1]] = Number(match[2]);
  }
  const discountBlock = source.match(/imageGenerationByMember\s*:\s*\{([^{}]+)\}/)?.[1];
  const discounts = {};
  for (const pair of (discountBlock ?? "").split(",")) {
    const match = pair.trim().match(/^\[[\w$]+\.(Advanced|Basic|Premium|Professional|Starter|Team)\]\s*:\s*(0?(?:\.\d+)|0|1)$/);
    if (!match) throw new Error("Unrecognized image membership discount.");
    discounts[match[1].toLowerCase()] = Number(match[2]);
  }
  if (!Number.isInteger(credits.GenerateBaseNexusV2) || Object.keys(discounts).length !== 6) throw new Error("Incomplete pricing configuration.");
  return { credits, discounts };
}

function remaining(trial, validRequired = false) {
  if (trial === undefined) return 0; // Matches the webpage's absent-trial default.
  if (validRequired && trial.is_valid === false) return 0;
  if (validRequired && trial.is_valid !== true) throw new Error("Trial validity is unavailable.");
  const value = trial.remaining ?? (trial.total_count - trial.used_count);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Trial count is unavailable.");
  return value;
}

export function calculateQuote(kind, settings, snapshot, account = {}) {
  const c = snapshot.credits, breakdown = [], warnings = [];
  let requests = 1, freeRequests = 0, discount = 1, netKnown = true;
  const member = account.payment?.member?.type;
  const add = (key) => {
    if (!Number.isSafeInteger(c[key])) throw new Error(`Missing official credit key: ${key}`);
    breakdown.push({ key, credits: c[key] });
  };
  const trials = () => {
    if (!account.marketing?.free_trial || typeof account.marketing.free_trial !== "object") throw new Error("Free trial response is unavailable.");
    return account.marketing.free_trial;
  };
  const quota = () => {
    if (!account.quota?.quota || typeof account.quota.quota !== "object") throw new Error("Operation quota response is unavailable.");
    return account.quota.quota;
  };
  const ultraTrial = () => {
    if (!Object.hasOwn(snapshot.discounts, member)) throw new Error("Account membership is unavailable.");
    return member === "team" ? 0 : remaining(trials()["ultra-texture-free-trial"], true);
  };
  let trialType;
  if (kind === "model.generate") {
    requests = settings.request_count ?? 1;
    if (settings.tier === "smart_mesh") {
      if (settings.model_version === NEXUS_V2_MODEL_VERSION) {
        add("GenerateBaseNexusV2"); trialType = "smart_mesh_v2";
      } else if (settings.model_version === NEXUS_MODEL_VERSION) {
        add("GenerateBaseNexus"); if (settings.quad) add("GenerateQuad");
      } else throw new Error("Unreviewed Smart Mesh version.");
    } else if (settings.tier === "high_detail") {
      add(settings.texture ? "GenerateWithTexture" : "GenerateBase");
      if (settings.quad) add("GenerateQuad");
      if (settings.generate_parts) { add("GenerateGenerateParts"); netKnown = false; warnings.push("Part-generation campaign eligibility has not been verified; base credits are available only."); }
      if (settings.smart_poly) add("GenerateSmartPoly");
      if (settings.texture && settings.texture_quality === "detailed") add("GenerateTextureQualityDetailed");
      if (settings.texture && settings.texture_quality === "ultra") { add("GenerateTextureQualityExtreme"); trialType = "ultra"; }
      if (settings.texture && settings.pbr) add("PBR");
      if (settings.model_version === "v3.1-20260211" && settings.geometry_quality === "detailed") add("GenerateGeometryQualityDetailed");
    } else throw new Error("Generation tier is required.");
  } else if (kind === "image.generate") {
    const key = IMAGE_KEYS[settings.model_version];
    if (!key) throw new Error("This image model has no reviewed price mapping.");
    add(key); if (settings.resolution === "4K") add("ImageUpscale4K");
    requests = settings.amount; trialType = "image";
  } else if (kind === "model.remesh") {
    add(settings.quad ? "Retopology_Quad" : "Retopology_Triangle");
    if (settings.smart_poly) add("Retopology_SmartPoly");
  } else if (kind === "texture.generate") {
    add("TextureGeneration");
    if (settings.quality === "detailed") add("TextureQualityDetailed");
    if (settings.quality === "ultra") { add("TextureQualityExtreme"); trialType = "ultra"; }
    if (settings.style || settings.style_image_path) add("TextureStyle");
  } else if (kind === "texture.upscale") {
    if (!["detailed", "ultra"].includes(settings.quality)) throw new Error("Texture upscale quality is required.");
    add(settings.quality === "ultra" ? "UpscalerExtreme" : "Upscaler");
    if (settings.quality === "ultra") trialType = "ultra";
  } else if (kind === "texture.pbr") add("PBR");
  else if (kind === "texture.edit_preview") add("MagicBrush");
  else if (kind === "image.upscale") add("ImageUpscale4K");
  else if (kind === "model.complete_parts") add(settings.mode === "quick_cap" ? "QuickCap" : "AICompletion");
  else if (kind === "model.uv_generate") {
    if (!["generate", "retry"].includes(settings.action)) throw new Error("Smart UV action requires current project context or an explicit action.");
    add(settings.action === "retry" ? "UvEditRetry" : "UvEditGenerate"); trialType = "uv";
  } else if (kind === "model.segment") {
    add("Segmentation"); netKnown = false; warnings.push("Segmentation campaign eligibility has not been verified; base credits are available only.");
  } else throw new Error("This operation's billing formula has not been verified.");
  const perRequest = breakdown.reduce((sum, row) => sum + row.credits, 0);
  if (!Number.isSafeInteger(requests) || requests < 1 || requests > 30) throw new Error("Input count is required.");
  try {
    if (trialType === "image") {
      discount = snapshot.discounts[member];
      if (discount === undefined) throw new Error("Membership discount is unavailable.");
      freeRequests = Math.min(requests, remaining(trials()["remaining-free-image-count"]));
      if (member === "team") { netKnown = false; warnings.push("Team workspace billing is not yet verified."); }
    } else if (trialType === "smart_mesh_v2") freeRequests = Math.min(requests, remaining(quota().generation?.smart_mesh_v2));
    else if (trialType === "uv") freeRequests = remaining(quota().uv_edit?.generate, true) > 0 ? 1 : 0;
    else if (trialType === "ultra") {
      const count = ultraTrial();
      const batchEligible = ["advanced", "premium", "team"].includes(member);
      freeRequests = count > 0 && (requests === 1 || batchEligible) ? 1 : 0;
    }
  } catch (error) { netKnown = false; warnings.push(error.message); }
  return {
    status: netKnown ? "estimated" : "unknown", base_credits: perRequest * requests,
    estimated_credits: netKnown ? Math.ceil(perRequest * (requests - freeRequests) * discount) : null,
    per_request_credits: perRequest, request_count: requests, breakdown,
    discount_multiplier: discount ?? null, free_requests_applied: netKnown ? freeRequests : null,
    ...(trialType ? { trial_type: trialType } : {}), warnings
  };
}

export class PricingService {
  #gateway; #fetch; #clock; #contract; #snapshot; #pending;
  constructor(gateway, { fetchImpl = fetch, clock = Date.now, reviewedContract = contract } = {}) {
    this.#gateway = gateway; this.#fetch = fetchImpl; this.#clock = clock; this.#contract = reviewedContract;
  }
  async #load(refresh) {
    const now = this.#clock();
    if (now >= Date.parse(this.#contract.review_expires_at)) throw new Error("Reviewed pricing contract expired; verify the current webpage and update the plugin.");
    if (!refresh && this.#snapshot && now - this.#snapshot.loaded_at < CACHE_MS) return this.#snapshot;
    if (this.#pending) return this.#pending;
    // A failed refresh never falls back to stale prices.
    this.#snapshot = undefined;
    this.#pending = (async () => {
      const bodies = await Promise.all(this.#contract.sources.map(async (source) => {
        const url = new URL(source.url);
        if (url.origin !== "https://tripo-webapp-assets.tripo3d.ai" || !url.pathname.startsWith("/studio-prod/_nuxt/")) throw new Error("Unexpected pricing source.");
        let body;
        for (let attempt = 0; attempt < 2; attempt++) {
          let response;
          try { response = await this.#fetch(url.href, { redirect: "error", signal: AbortSignal.timeout(15000) }); }
          catch (error) { if (attempt === 0) continue; throw error; }
          if (response.status >= 500 && attempt === 0) continue;
          if (!response.ok) throw new Error("Official pricing source could not be fetched.");
          try { body = await response.text(); break; }
          catch (error) { if (attempt === 1) throw error; }
        }
        if (body.length > 10_000_000 || createHash("sha256").update(body).digest("hex") !== source.sha256) throw new Error("Official pricing source differs from the reviewed contract.");
        return body;
      }));
      const configIndex = this.#contract.sources.findIndex((source) => source.role === "configuration");
      this.#snapshot = { ...parsePricingConfig(bodies[configIndex]), loaded_at: this.#clock() };
      return this.#snapshot;
    })();
    try { return await this.#pending; } finally { this.#pending = undefined; }
  }
  async quote(kind, input = {}, { refresh = false, task } = {}) {
    const operation = getOperation(kind);
    if (input.submit === true) throw new TripoError("INVALID_INPUT", "A quote cannot submit a task.");
    const parsed = task ? null : z.object(operation.inputShape).partial().strict().parse(input);
    const out = { kind, currency: "credits", paid_request_sent: false, server_billing_quote: false, quoted_at: new Date(this.#clock()).toISOString() };
    // Free operations do not need a Studio session or remote lookup.
    if (!operation.consumesCredits) return { ...out, status: "free", estimated_credits: 0, base_credits: 0, pricing_type: "operation_contract", warnings: [] };
    if (!QUOTED_KINDS.has(kind)) return { ...out, status: "unknown", estimated_credits: null, base_credits: null, warnings: ["This operation's billing formula has not been verified."] };
    let settings;
    try {
      if (task) {
        settings = kind === "model.generate" ? { ...task.settings, request_count: task.payload.mode === "batch" ? task.payload.body.image.length : 1 } : { ...task.payload, ...task.metadata };
        if (kind === "texture.generate" || kind === "texture.upscale") settings.quality = task.payload.texture_quality;
        if (kind === "texture.generate") settings.style = Boolean(task.payload.style_image);
      } else {
        // Quote-only input can omit IDs, prompts and paths. No build/upload/audit/dispatch.
        settings = parsed;
        if (kind === "model.generate") {
          if (!settings.tier || !settings.mode || settings.face_limit === undefined) throw new Error("tier, mode and face_limit are required to quote effective generation settings.");
          const mode = settings.mode === "studio_image" ? "image" : settings.mode === "studio_multiview" ? "multiview" : settings.mode;
          settings = { ...normalizeSettings(settings, mode), tier: settings.tier, request_count: mode === "batch" ? settings.image_paths?.length : 1 };
          if (mode === "batch" && !settings.request_count) throw new Error("image_paths is required to count batch inputs.");
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof TripoError) throw error;
      return { ...out, status: "unknown", estimated_credits: null, base_credits: null, warnings: [error.message] };
    }
    try {
      const snapshot = await this.#load(refresh);
      const needsMarketing = kind === "image.generate" || (kind === "model.generate" && settings.texture && settings.texture_quality === "ultra") || (["texture.generate", "texture.upscale"].includes(kind) && settings.quality === "ultra");
      const needsQuota = kind === "model.uv_generate" || (kind === "model.generate" && settings.tier === "smart_mesh" && settings.model_version === NEXUS_V2_MODEL_VERSION);
      const needsPayment = needsMarketing;
      const results = await Promise.allSettled([
        needsPayment ? this.#gateway.getPaymentSummary() : undefined,
        needsMarketing ? this.#gateway.getPricingTrials() : undefined,
        needsQuota ? this.#gateway.getOperationQuota() : undefined
      ]);
      const [payment, marketing, quota] = results.map((result) => result.status === "fulfilled" ? result.value : undefined);
      const calculation = calculateQuote(kind, settings, snapshot, { payment, marketing, quota });
      const effective = Object.fromEntries(COST_FIELDS.filter((key) => settings[key] !== undefined).map((key) => [key, settings[key]]));
      if (kind === "texture.generate") effective.style_reference = Boolean(settings.style || settings.style_image_path);
      return { ...out, ...calculation, effective_settings: effective, pricing_type: "reviewed_frontend_estimate", member_type: payment?.member?.type ?? null,
        estimate_expires_at: new Date(this.#clock() + CACHE_MS).toISOString(),
        source: { reviewed_at: this.#contract.reviewed_at, review_expires_at: this.#contract.review_expires_at, fetched_at: new Date(snapshot.loaded_at).toISOString(), sources: this.#contract.sources },
        warnings: [...calculation.warnings, "Uses a reviewed frontend version; automatic detection of newer webpage releases is unavailable. Final server billing may differ."] };
    } catch (error) {
      return { ...out, status: "unknown", estimated_credits: null, base_credits: null, warnings: [error.message] };
    }
  }
}
