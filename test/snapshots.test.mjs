import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { stageLocalImage, verifySnapshot } from "../src/ops/images.mjs";
import { solidImage } from "./helpers/image-fixture.mjs";

it("stages and syncs an image snapshot that survives changes to the source", async t => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "tripo-snapshot-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const config = { dataDir };
  const taskId = randomUUID();
  const source = path.join(dataDir, "source.png");
  const bytes = await solidImage({ width: 16, height: 12, background: "#cc7755" });
  await writeFile(source, bytes);
  const result = await stageLocalImage(config, {}, {}, source, false, {
    taskId, index: 1, slot: "image", label: "Input", upload: false
  });
  await writeFile(source, "source changed");
  const snapshot = await verifySnapshot(config, taskId, result.provenance);
  assert.deepEqual(await readFile(snapshot), bytes);
  assert.equal(result.metadata.width, 16);
  assert.equal(result.metadata.height, 12);
  if (process.platform !== "win32") assert.equal((await stat(snapshot)).mode & 0o777, 0o400);
});
