import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { inspectImage } from "../src/util/image.mjs";
import { glbNodeNames, inspectModel } from "../src/util/model-inspect.mjs";
import { assertDownloadUrl, assertLocalPathSpecifier, resolveOutputPath } from "../src/security/path-policy.mjs";

// Minimal valid PNG: signature + IHDR(1x1) + IEND
function png1x1() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4);
  ihdr.writeUInt32BE(1, 8);
  ihdr.writeUInt32BE(1, 12);
  ihdr[16] = 8; ihdr[17] = 6;
  const iend = Buffer.alloc(12);
  iend.write("IEND", 4);
  return Buffer.concat([sig, ihdr, iend]);
}

function glb(jsonDoc) {
  const json = Buffer.from(JSON.stringify(jsonDoc));
  const pad = (4 - (json.length % 4)) % 4;
  const chunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const total = 12 + 8 + chunk.length;
  const header = Buffer.alloc(20);
  header.writeUInt32LE(1179937895, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  header.writeUInt32LE(chunk.length, 12);
  header.writeUInt32LE(1313821514, 16);
  return Buffer.concat([header, chunk]);
}

describe("image inspect", () => {
  it("inspects a real png", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tripo-img-"));
    const file = path.join(dir, "a.png");
    await writeFile(file, png1x1());
    const info = await inspectImage(file);
    assert.equal(info.format, "png");
    assert.equal(info.width, 1);
    assert.equal(info.height, 1);
    assert.equal(info.sha256.length, 64);
  });
  it("rejects non-images and wrong extensions", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tripo-img-"));
    const bad = path.join(dir, "a.png");
    await writeFile(bad, Buffer.from("not an image"));
    await assert.rejects(() => inspectImage(bad), /PNG, JPEG, and WebP/);
    const txt = path.join(dir, "a.txt");
    await writeFile(txt, png1x1());
    await assert.rejects(() => inspectImage(txt), /filename must end/);
  });
});

describe("model inspect", () => {
  it("counts triangles and node names in a glb", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tripo-glb-"));
    const file = path.join(dir, "m.glb");
    const doc = {
      accessors: [{ count: 9 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 0, mode: 4 }] }],
      nodes: [{ name: "Body" }, { name: "Arm_L" }, {}]
    };
    const bytes = glb(doc);
    await writeFile(file, bytes);
    const info = await inspectModel(file);
    assert.equal(info.format, "glb");
    assert.equal(info.faceCount, 3);
    assert.equal(info.isUvMapped, true);
    assert.deepEqual(glbNodeNames(bytes), ["Body", "Arm_L"]);
  });
  it("rejects corrupt glb and oversized models", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tripo-glb-"));
    const bad = path.join(dir, "bad.glb");
    await writeFile(bad, Buffer.from("GLB!"));
    await assert.rejects(() => inspectModel(bad), /GLB magic/);
  });
});

describe("path policy", () => {
  it("rejects url specifiers", () => {
    assert.throws(() => assertLocalPathSpecifier("https://x/y.png"), /local filesystem paths/);
    assert.throws(() => assertLocalPathSpecifier("file:///etc/passwd"), /local filesystem paths/);
    assert.throws(() => assertLocalPathSpecifier("data:image/png;base64,AA"), /local filesystem paths/);
  });
  it("restricts downloads to output roots", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tripo-dl-"));
    const config = { assetRoot: dir, outputRoots: [dir] };
    const inside = await resolveOutputPath(config, path.join(dir, "sub", "f.png"), "d.png");
    assert.ok(inside.startsWith(dir));
    await assert.rejects(() => resolveOutputPath(config, "/etc/passwd", "d.png"), /output roots/);
    const outside = await mkdtemp(path.join(tmpdir(), "tripo-out-"));
    await assert.rejects(() => resolveOutputPath(config, path.join(outside, "f.png"), "d.png"), /output roots/);
  });
  it("allowlists download hosts", () => {
    assert.equal(assertDownloadUrl("https://cdn.tripo3d.ai/x.glb").hostname, "cdn.tripo3d.ai");
    assert.equal(assertDownloadUrl("https://s3.us-west-2.amazonaws.com/b/k").hostname, "s3.us-west-2.amazonaws.com");
    assert.throws(() => assertDownloadUrl("http://cdn.tripo3d.ai/x"), /HTTPS/);
    assert.throws(() => assertDownloadUrl("https://evil.example.com/x"), /allowlist/);
  });
});
