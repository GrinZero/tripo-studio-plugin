import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { PricingService, parsePricingConfig, calculateQuote } from "../src/studio/pricing.mjs";
import { NEXUS_V2_MODEL_VERSION } from "../src/constants.mjs";

const source = await readFile(new URL("./fixtures/pricing/config-fragment.txt", import.meta.url), "utf8");
const snapshot = parsePricingConfig(source);
const now = Date.parse("2026-10-08T06:00:00Z");
const reviewedContract = {
  reviewed_at: "2026-10-08T01:00:00Z", review_expires_at: "2026-10-15T01:00:00Z",
  sources: [{ role: "configuration", url: "https://tripo-webapp-assets.tripo3d.ai/studio-prod/_nuxt/test.js", sha256: createHash("sha256").update(source).digest("hex") }]
};
const account = {
  payment: { member: { type: "premium" } },
  marketing: { free_trial: {} }, quota: { quota: { generation: { smart_mesh_v2: { remaining: 0 } } } }
};
function harness(overrides = {}) {
  const calls = [], gateway = {
    getPaymentSummary: async () => { calls.push("payment"); return account.payment; },
    getPricingTrials: async () => { calls.push("trials"); return account.marketing; },
    getOperationQuota: async () => { calls.push("quota"); return account.quota; },
    ...overrides
  };
  const service = new PricingService(new Proxy(gateway, { get(target, key) {
    if (!(key in target)) throw new Error(`Unexpected gateway call: ${String(key)}`);
    return target[key];
  } }), { reviewedContract, clock: () => now, fetchImpl: async () => { calls.push("source"); return new Response(source); } });
  return { service, calls };
}

describe("reviewed Studio credit pricing", () => {
  it("reads exact minified public configuration without evaluating JavaScript", () => {
    assert.equal(snapshot.credits.GenerateBaseNexusV2, 100);
    assert.equal(snapshot.discounts.premium, 0.2);
    assert.throws(() => parsePricingConfig(source.replace("GenerateBase:15", "GenerateBase:evil()")), /literal/);
    assert.throws(() => parsePricingConfig(source.replace("[X.Premium]:.2", "[X.Premium]:evil()")), /discount/);
  });
  it("matches H3.1 4K and 8K page quotes and independent geometry quality", async () => {
    const { service } = harness();
    const input = { tier: "high_detail", mode: "multiview", face_limit: 60000, texture: true, geometry_quality: "standard" };
    const standard = await service.quote("model.generate", input);
    assert.equal(standard.estimated_credits, 40);
    assert.equal(standard.effective_settings.pbr, true);
    assert.equal((await service.quote("model.generate", { ...input, texture_quality: "ultra" })).estimated_credits, 50);
    const detailed = await service.quote("model.generate", { ...input, geometry_quality: "detailed" });
    assert.equal(detailed.estimated_credits, 55);
    assert.equal(detailed.paid_request_sent, false);
    assert.equal(detailed.server_billing_quote, false);
    assert.equal(detailed.source.reviewed_at, reviewedContract.reviewed_at);
  });
  it("uses the actual plugin geometry default and does not charge texture when disabled", async () => {
    const q = await harness().service.quote("model.generate", { tier: "high_detail", mode: "image", face_limit: 30000 });
    assert.equal(q.estimated_credits, 30);
    assert.deepEqual(q.breakdown.map((row) => row.key), ["GenerateBase", "GenerateGeometryQualityDetailed"]);
  });
  it("charges P2 once for 1/2/4 variants and per independent batch input", async () => {
    const { service } = harness();
    for (const amount of [1, 2, 4]) {
      const q = await service.quote("model.generate", { tier: "smart_mesh", mode: "text", face_limit: 3000, amount });
      assert.equal(q.estimated_credits, 100);
      assert.equal(q.request_count, 1);
    }
    const q = await service.quote("model.generate", { tier: "smart_mesh", mode: "batch", face_limit: 3000, image_paths: ["/not-read/a.png", "/not-read/b.png"] });
    assert.equal(q.estimated_credits, 200);
  });
  it("deducts P2 trials per input, not per variant", () => {
    const q = calculateQuote("model.generate", { tier: "smart_mesh", model_version: NEXUS_V2_MODEL_VERSION, request_count: 3, amount: 4 }, snapshot, { quota: { quota: { generation: { smart_mesh_v2: { remaining: 2 } } } } });
    assert.equal(q.estimated_credits, 100);
    assert.equal(q.free_requests_applied, 2);
  });
  it("combines image resolution, free image count, membership discount and rounding", () => {
    const q = calculateQuote("image.generate", { model_version: "gpt_image_2.5_sunburst", amount: 4, resolution: "4K" }, snapshot, { ...account, marketing: { free_trial: { "remaining-free-image-count": { total_count: 3, used_count: 1 } } } });
    assert.equal(q.base_credits, 120);
    assert.equal(q.estimated_credits, 12);
    assert.equal(q.free_requests_applied, 2);
    assert.equal(q.discount_multiplier, 0.2);
    assert.equal(calculateQuote("image.generate", { model_version: "gpt_image_2", amount: 1, resolution: "1K" }, snapshot, account).estimated_credits, 4);
  });
  it("uses live image trials for a zero-credit estimate", async () => {
    const { service, calls } = harness({ getPricingTrials: async () => ({ free_trial: { "remaining-free-image-count": { total_count: 1000, used_count: 1 } } }) });
    const q = await service.quote("image.generate", { amount: 4, model_version: "gemini_2.5_flash_image_preview" });
    assert.equal(q.estimated_credits, 0);
    assert.equal(q.base_credits, 40);
    assert.equal(q.free_requests_applied, 4);
    assert.ok(calls.includes("payment"));
  });
  it("quotes triangle/quad Smart Poly remesh and texture style once per request", async () => {
    const { service } = harness();
    assert.equal((await service.quote("model.remesh", {})).estimated_credits, 5);
    assert.equal((await service.quote("model.remesh", { quad: true, smart_poly: true })).estimated_credits, 40);
    assert.equal((await service.quote("texture.generate", { quality: "detailed", style: "mecha" })).estimated_credits, 25);
    const frozen = { kind: "texture.generate", payload: { texture_quality: "detailed", style_image: { key: "private-key" } }, metadata: {} };
    const q = await service.quote(frozen.kind, {}, { task: frozen });
    assert.equal(q.estimated_credits, 25);
    assert.equal(q.effective_settings.style_reference, true);
    assert.ok(!JSON.stringify(q).includes("private-key"));
  });
  it("applies 8K trial to the whole request and one eligible batch item", () => {
    const a = { ...account, marketing: { free_trial: { "ultra-texture-free-trial": { is_valid: true, total_count: 5, used_count: 0 } } } };
    assert.equal(calculateQuote("texture.upscale", { quality: "ultra" }, snapshot, a).estimated_credits, 0);
    const q = calculateQuote("model.generate", { tier: "high_detail", texture: true, texture_quality: "ultra", pbr: true, request_count: 3 }, snapshot, a);
    assert.equal(q.estimated_credits, 100);
    assert.equal(q.free_requests_applied, 1);
  });
  it("distinguishes UV generate/retry and trial exhaustion", async () => {
    const { service } = harness();
    assert.equal((await service.quote("model.uv_generate", { action: "generate" })).estimated_credits, 20);
    assert.equal((await service.quote("model.uv_generate", { action: "retry" })).estimated_credits, 10);
    const a = { quota: { quota: { uv_edit: { generate: { is_valid: true, remaining: 1 } } } } };
    assert.equal(calculateQuote("model.uv_generate", { action: "retry" }, snapshot, a).estimated_credits, 0);
    assert.equal((await service.quote("model.uv_generate", {})).status, "unknown");
  });
  it("returns unknown net cost when membership/trials/quota cannot be read", async () => {
    const { service } = harness({ getPricingTrials: async () => { throw new Error("auth failed"); }, getOperationQuota: async () => { throw new Error("auth failed"); } });
    const q = await service.quote("image.generate", {});
    assert.equal(q.estimated_credits, null);
    assert.equal(q.base_credits, 20);
    const p2 = await service.quote("model.generate", { tier: "smart_mesh", mode: "image", face_limit: 3000 });
    assert.equal(p2.estimated_credits, null);
    assert.equal(p2.base_credits, 100);
  });
  it("leaves unverified operations and campaigns unknown instead of fabricating cost", async () => {
    const { service, calls } = harness();
    for (const kind of ["model.rig", "model.animate", "motion.generate", "image.multiview", "image.regenerate", "texture.edit_apply"]) {
      assert.equal((await service.quote(kind)).estimated_credits, null);
    }
    assert.deepEqual(calls, []);
    const q = await service.quote("model.segment");
    assert.equal(q.base_credits, 40);
    assert.equal(q.estimated_credits, null);
  });
  it("quotes frozen batch payload despite truncated public input_summary", async () => {
    const q = await harness().service.quote("model.generate", {}, { task: { settings: { tier: "smart_mesh", model_version: NEXUS_V2_MODEL_VERSION }, payload: { mode: "batch", body: { image: Array(20).fill({ key: "private-key" }) } }, input_summary: { image_paths: "20 items" } } });
    assert.equal(q.estimated_credits, 2000);
    assert.equal(q.request_count, 20);
    assert.ok(!JSON.stringify(q).includes("private-key"));
  });
  it("keeps free/local queries offline and rejects submit/unknown schema fields", async () => {
    const { service, calls } = harness();
    assert.equal((await service.quote("model.export")).estimated_credits, 0);
    assert.equal((await service.quote("local.render")).estimated_credits, 0);
    assert.deepEqual(calls, []);
    await assert.rejects(service.quote("image.generate", { submit: true }), /cannot submit/);
    await assert.rejects(service.quote("model.export", { nonsense: 1 }));
    await assert.rejects(service.quote("model.generate", { tier: "smart_mesh", mode: "image", face_limit: 3000, texture: true }), /unavailable/);
  });
  it("never accepts changed sources or falls back to cached rates after refresh failure", async () => {
    let body = source;
    const service = new PricingService({}, { reviewedContract, clock: () => now, fetchImpl: async () => new Response(body) });
    assert.equal((await service.quote("texture.pbr")).estimated_credits, 5);
    body = source.replace("PBR:5", "PBR:500");
    assert.equal((await service.quote("texture.pbr", {}, { refresh: true })).estimated_credits, null);
    assert.equal((await service.quote("texture.pbr")).estimated_credits, null);
  });
  it("expires reviewed pricing instead of silently treating a pinned release as latest", async () => {
    const service = new PricingService({}, { reviewedContract, clock: () => Date.parse(reviewedContract.review_expires_at), fetchImpl: () => { throw new Error("Must not fetch"); } });
    const q = await service.quote("texture.pbr");
    assert.equal(q.estimated_credits, null);
    assert.match(q.warnings[0], /expired/);
    assert.equal((await service.quote("model.export")).estimated_credits, 0);
  });
  it("retries one transient public-source read and stops after repeated failure", async () => {
    let attempts = 0;
    const service = new PricingService({}, { reviewedContract, clock: () => now, fetchImpl: async () => { if (++attempts === 1) throw new TypeError("fetch failed"); return new Response(source); } });
    assert.equal((await service.quote("texture.pbr")).estimated_credits, 5);
    assert.equal(attempts, 2);
    attempts = 0;
    const unavailable = new PricingService({}, { reviewedContract, clock: () => now, fetchImpl: async () => { attempts++; throw new TypeError("fetch failed"); } });
    assert.equal((await unavailable.quote("texture.pbr")).estimated_credits, null);
    assert.equal(attempts, 2);
  });
});
