import assert from "node:assert/strict";
import { it } from "node:test";
import { rm } from "node:fs/promises";
import { makeRuntime } from "./helpers/runtime.mjs";
import { solidImage } from "./helpers/image-fixture.mjs";
import { modelOperations } from "../src/ops/modelgen.mjs";
import { z } from "zod";

async function textureGlb(sizes) {
  const images = [];
  for (const size of sizes) {
    const png = await solidImage({
      width: size,
      height: size,
      channels: 3,
      background: "#abcdef",
    });
    images.push({
      name: `texture-${size}`,
      uri: `data:image/png;base64,${png.toString("base64")}`,
    });
  }
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: "2.0" },
      buffers: [{ byteLength: 4 }],
      images,
    })
  );
  const length = Math.ceil(json.length / 4) * 4;
  const bytes = Buffer.alloc(28 + length + 4, 32);
  bytes.write("glTF");
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  json.copy(bytes, 20);
  bytes.writeUInt32LE(4, 20 + length);
  bytes.writeUInt32LE(0x004e4942, 24 + length);
  return bytes;
}

it("dispatches the Studio extreme enum for 8K texturing and upscaling", async () => {
  for (const kind of ["texture.generate", "texture.upscale"]) {
    const { service, gateway, config, store } = await makeRuntime();
    try {
      gateway.project.operator.is_textured = true;
      const prepared = await service.prepare(kind, {
        project_id: "proj-1",
        quality: "ultra",
        ...(kind === "texture.generate"
          ? { mode: "text", prompt: "wood" }
          : {}),
      });
      assert.equal(
        (await store.get(prepared.task.task_id)).payload.texture_quality,
        "extreme"
      );
      assert.equal(prepared.task.input_summary.quality, "ultra");
      await service.submit(prepared.task.task_id, {
        confirmation: prepared.confirmation,
      });
      assert.equal(
        gateway.calls.find(([name]) => name === "submitPostprocess")[2]
          .texture_quality,
        "extreme"
      );
    } finally {
      await rm(config.dataDir, { recursive: true, force: true });
    }
  }
});

it("uses the same 8K wire mapping for High Detail generation", async () => {
  const op = modelOperations["model.generate"];
  const input = z.object(op.inputShape).parse({
    tier: "high_detail",
    mode: "text",
    prompt: "wood",
    face_limit: 10000,
    texture: true,
    texture_quality: "ultra",
  });
  const built = await op.build({}, input, "task");
  assert.equal(built.payload.body.texture_quality, "extreme");
  assert.equal(built.settings.texture_quality, "ultra");
});

it("records a 2K result as an 8K mismatch before PBR or export", async () => {
  const { service, gateway, config } = await makeRuntime();
  const previousFetch = globalThis.fetch;
  try {
    const bytes = await textureGlb([2048]);
    globalThis.fetch = async () => new Response(bytes);
    const prepared = await service.prepare("texture.generate", {
      project_id: "proj-1",
      quality: "ultra",
      mode: "text",
      prompt: "wood",
    });
    await service.submit(prepared.task.task_id, {
      confirmation: prepared.confirmation,
    });
    let requestedOperator;
    gateway.getProject = async (id, operatorId) => {
      requestedOperator = operatorId;
      return {
        id,
        operator: { operator_id: "op-1", is_ultra_textured: true },
        model_url: "https://cdn.tripo3d.ai/frozen.glb?signature=secret",
      };
    };
    const { task } = await service.sync(prepared.task.task_id);
    assert.equal(requestedOperator, "op-1");
    assert.equal(task.result.texture_resolution.requested_texture_size, 8192);
    assert.equal(
      task.result.texture_resolution.actual_texture_size_verified,
      true
    );
    assert.equal(
      task.result.texture_resolution.requested_texture_size_met,
      false
    );
    assert.equal(task.result.texture_resolution.resolution_status, "mismatch");
    assert.deepEqual(
      task.result.texture_resolution.textures.map((t) => [t.width, t.height]),
      [[2048, 2048]]
    );
    assert.match(task.warnings.join(" "), /8192.*2048/);
    assert.ok(!JSON.stringify(task).includes("signature"));
    assert.equal(
      gateway.calls.filter(([name]) => name === "submitPostprocess").length,
      1
    );
  } finally {
    globalThis.fetch = previousFetch;
    await rm(config.dataDir, { recursive: true, force: true });
  }
});

it("verifies all upscaled textures rather than accepting one large map", async () => {
  const { service, gateway, config } = await makeRuntime();
  const previousFetch = globalThis.fetch;
  try {
    const bytes = await textureGlb([4096, 2048]);
    globalThis.fetch = async () => new Response(bytes);
    gateway.project.operator.is_textured = true;
    const prepared = await service.prepare("texture.upscale", {
      project_id: "proj-1",
      quality: "detailed",
    });
    await service.submit(prepared.task.task_id, {
      confirmation: prepared.confirmation,
    });
    gateway.project = {
      id: "proj-1",
      operator: { operator_id: "op-1" },
      model_url: "https://cdn.tripo3d.ai/result.glb",
    };
    const { task } = await service.sync(prepared.task.task_id);
    assert.equal(task.result.texture_resolution.resolution_status, "mismatch");
    assert.equal(
      task.result.texture_resolution.requested_texture_size_met,
      false
    );
  } finally {
    globalThis.fetch = previousFetch;
    await rm(config.dataDir, { recursive: true, force: true });
  }
});

it("keeps missing artifacts explicitly unverified even if Studio flags claim 8K", async () => {
  const { service, gateway, config } = await makeRuntime();
  try {
    const prepared = await service.prepare("texture.generate", {
      project_id: "proj-1",
      quality: "ultra",
      mode: "text",
      prompt: "wood",
    });
    await service.submit(prepared.task.task_id, {
      confirmation: prepared.confirmation,
    });
    gateway.project.operator = { operator_id: "op-1", is_ultra_textured: true };
    const { task } = await service.sync(prepared.task.task_id);
    assert.equal(
      task.result.texture_resolution.actual_texture_size_verified,
      false
    );
    assert.equal(
      task.result.texture_resolution.requested_texture_size_met,
      null
    );
    assert.equal(
      task.result.texture_resolution.resolution_status,
      "unverified"
    );
  } finally {
    await rm(config.dataDir, { recursive: true, force: true });
  }
});

it("verifies real 8K images and retains the cache for the frozen operator", async () => {
  const { service, gateway, config } = await makeRuntime();
  const previousFetch = globalThis.fetch;
  try {
    const bytes = await textureGlb([8192]);
    let downloads = 0;
    globalThis.fetch = async () => {
      downloads++;
      return new Response(bytes);
    };
    const prepared = await service.prepare("texture.generate", {
      project_id: "proj-1",
      quality: "ultra",
      mode: "text",
      prompt: "wood",
    });
    await service.submit(prepared.task.task_id, {
      confirmation: prepared.confirmation,
    });
    gateway.project = {
      id: "proj-1",
      operator: { operator_id: "op-1" },
      model_url: "https://cdn.tripo3d.ai/8k.glb",
    };
    const { task } = await service.sync(prepared.task.task_id);
    assert.equal(task.result.texture_resolution.resolution_status, "verified");
    assert.equal(
      task.result.texture_resolution.requested_texture_size_met,
      true
    );
    assert.equal(task.result.texture_resolution.textures[0].width, 8192);
    await service.sync(prepared.task.task_id);
    assert.equal(downloads, 1);
  } finally {
    globalThis.fetch = previousFetch;
    await rm(config.dataDir, { recursive: true, force: true });
  }
});

it("does not certify a newer project revision as the texture task's result", async () => {
  const { service, gateway, config } = await makeRuntime();
  try {
    const prepared = await service.prepare("texture.generate", {
      project_id: "proj-1",
      quality: "ultra",
      mode: "text",
      prompt: "wood",
    });
    await service.submit(prepared.task.task_id, {
      confirmation: prepared.confirmation,
    });
    gateway.project = {
      id: "proj-1",
      operator: { operator_id: "newer" },
      model_url: "https://cdn.tripo3d.ai/newer.glb",
    };
    const result = await service.sync(prepared.task.task_id);
    assert.equal(result.progress_error.code, "INSUFFICIENT_EVIDENCE");
    assert.equal(result.task.status, "queued");
    assert.equal(result.task.result, undefined);
  } finally {
    await rm(config.dataDir, { recursive: true, force: true });
  }
});
