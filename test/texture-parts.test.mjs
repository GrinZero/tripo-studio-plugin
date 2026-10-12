import assert from "node:assert/strict";
import { it } from "node:test";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { z } from "zod";
import { postprocessOperations } from "../src/ops/postops.mjs";
import * as modelInspect from "../src/util/model-inspect.mjs";
import { makeRuntime } from "./helpers/runtime.mjs";
import { fixtureGlb } from "./helpers/glb-fixture.mjs";
import { solidImage } from "./helpers/image-fixture.mjs";

it("stages and dispatches whole-model textures with empty or omitted part_names", async () => {
  for (const selection of [{ part_names: [] }, {}]) {
    const { service, gateway, config, store } = await makeRuntime();
    try {
      const staged = await service.prepare("texture.generate", {
        project_id: "proj-1",
        mode: "text",
        prompt: "ivory feathers",
        ...selection,
      });
      assert.equal(staged.task.status, "staged");
      assert.ok(
        !Object.hasOwn(
          (await store.get(staged.task.task_id)).payload,
          "part_names"
        )
      );
      await service.submit(staged.task.task_id, {
        confirmation: staged.confirmation,
      });
      const call = gateway.calls.find(([name]) => name === "submitPostprocess");
      assert.equal(call[1], "texture_model");
      assert.ok(!Object.hasOwn(call[2], "part_names"));
    } finally {
      await rm(config.dataDir, { recursive: true, force: true });
    }
  }
});

it("keeps selected texture parts validated and other part operations nonempty", async () => {
  const op = postprocessOperations["texture.generate"];
  const parse = (parts) =>
    z.object(op.inputShape).parse({
      project_id: "p",
      mode: "text",
      prompt: "gold",
      part_names: parts,
    });
  const ctx = { gateway: { getProject: async () => ({ id: "p" }) } };
  assert.deepEqual(
    (await op.build(ctx, parse([" Body "]))).payload.part_names,
    ["Body"]
  );
  for (const parts of [[" "], ["Body", " Body "]])
    await assert.rejects(op.build(ctx, parse(parts)), /empty|duplicate/);
  for (const parts of [
    [""],
    ["bad\0name"],
    ["x".repeat(257)],
    Array(201).fill("Body"),
    null,
  ])
    assert.throws(() => parse(parts));
  assert.throws(() =>
    z
      .object(postprocessOperations["model.complete_parts"].inputShape)
      .parse({ project_id: "p", part_names: [] })
  );
  assert.throws(() =>
    z
      .object(postprocessOperations["model.remesh"].inputShape)
      .parse({ project_id: "p", part_name_list: [], face_limit: 1000 })
  );
});

it("stages the four-view Smart Mesh texture request with empty part_names", async () => {
  const { service, config, store } = await makeRuntime();
  try {
    const input = {
      project_id: "proj-1",
      part_names: [],
      mode: "multiview",
      quality: "detailed",
      alignment: "original_image",
      delight: true,
    };
    const bytes = await solidImage({
      width: 16,
      height: 16,
      channels: 3,
      background: "#abcdef",
    });
    for (const role of ["front", "left", "back", "right"]) {
      input[`${role}_image_path`] = path.join(config.dataDir, `${role}.png`);
      await writeFile(input[`${role}_image_path`], bytes);
    }
    const staged = await service.prepare("texture.generate", input);
    const task = await store.get(staged.task.task_id);
    assert.equal(staged.paid_request_sent, false);
    assert.ok(!Object.hasOwn(task.payload, "part_names"));
    assert.equal(task.payload.images.length, 4);
    assert.deepEqual(
      task.snapshots.map((image) => image.slot),
      ["front", "left", "back", "right"]
    );
    assert.equal(task.payload.texture_quality, "detailed");
  } finally {
    await rm(config.dataDir, { recursive: true, force: true });
  }
});

it("reads raw mesh names from native Smart Mesh FBX instead of parsing it as GLB", async () => {
  const bytes = await readFile(
    new URL("./fixtures/quad-cube.fbx", import.meta.url)
  );
  assert.deepEqual(modelInspect.modelNodeNames(bytes), ["QuadCube"]);
  assert.deepEqual(
    modelInspect.modelNodeNames(fixtureGlb()),
    modelInspect.glbNodeNames(fixtureGlb())
  );
  assert.throws(
    () => modelInspect.modelNodeNames(Buffer.from("invalid")),
    /valid GLB/
  );
  assert.throws(
    () => modelInspect.modelNodeNames(bytes.subarray(0, 100)),
    /offsets|header|truncated/
  );
  const inspected = await modelInspect.inspectModel(
    new URL("./fixtures/quad-cube.fbx", import.meta.url).pathname
  );
  assert.equal(inspected.format, "fbx");
  assert.equal(inspected.faceCount, 12);
});

it("allows whole-model texture in the workbench while rejecting deselected available parts", async () => {
  const source = await readFile(
    new URL("../ui/workbench.mjs", import.meta.url),
    "utf8"
  );
  const code = source.slice(
    source.indexOf("function operationRequest()"),
    source.indexOf("function captureOperation()")
  );
  const state = {
    op: "texture",
    opForm: { prompt: "ivory feathers", quality: "detailed" },
    detail: { project_id: "p", parts: [] },
  };
  const request = () =>
    runInNewContext(`${code}\noperationRequest()`, {
      state,
      tr: (text) => text,
    });
  assert.deepEqual([...request().input.part_names], []);
  state.detail.parts = ["Body"];
  state.opForm.parts = [];
  assert.throws(request, /至少选择一个/);
  state.opForm.parts = ["Body"];
  assert.deepEqual([...request().input.part_names], ["Body"]);
});
