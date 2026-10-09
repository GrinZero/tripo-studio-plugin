import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFile, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { makeRuntime } from './helpers/runtime.mjs';
import { fixtureGlb } from './helpers/glb-fixture.mjs';
import { downloadResolvedArtifact } from '../src/studio/model-download.mjs';
import { decodeMeshoptGlb } from '../src/util/glb-decode.mjs';
import { decodePreviewGlb } from '../src/ui/media.mjs';

const compressed = () => readFile(new URL('./fixtures/meshopt-planes.glb', import.meta.url));
const document = bytes => JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));

it('stages a decoded Blender input while retaining the exact compressed source', async () => {
  const { service, config, store } = await makeRuntime();
  try {
    const source = await compressed();
    const model = path.join(config.dataDir, 'compressed.glb');
    await writeFile(model, source);
    const prepared = await service.prepare('local.inspect_parts', { model_path: model });
    const task = await store.get(prepared.task.task_id);
    const staged = await readFile(task.payload.model_path);
    assert.ok(!document(staged).extensionsRequired?.includes('EXT_meshopt_compression'));
    assert.ok(!document(staged).bufferViews.some(v => v.extensions?.EXT_meshopt_compression));
    const original = path.join(config.dataDir, task.snapshots[0].relative_path);
    assert.deepEqual(await readFile(original), source);
    assert.notEqual(task.payload.model_path, original);
    assert.equal(task.snapshots.length, 2);
    assert.deepEqual(await readFile(model), source);
  } finally { await rm(config.dataDir, { force: true, recursive: true }); }
});

it('downloads the original and a separate reusable decoded copy with identical geometry', async () => {
  const { config } = await makeRuntime();
  try {
    const source = await compressed();
    const resolved = { url: 'https://cdn.tripo3d.ai/model.glb', defaultName: 'model.glb' };
    const fetchImpl = async () => new Response(source);
    const download = await downloadResolvedArtifact(config, resolved, undefined, fetchImpl);
    assert.equal(download.meshopt_decoded, true);
    assert.notEqual(download.path, download.blender_path);
    assert.deepEqual(await readFile(download.path), source);
    const decoded = await readFile(download.blender_path);
    assert.equal(decoded.readUInt32LE(8), decoded.length);
    const original = fixtureGlb(), originalDoc = document(original), decodedDoc = document(decoded);
    const binary = bytes => bytes.subarray(28 + bytes.readUInt32LE(12));
    for (let index = 0; index < originalDoc.accessors.length; index++) {
      const a = originalDoc.accessors[index], b = decodedDoc.accessors[index];
      assert.deepEqual(b, a);
      const v = originalDoc.bufferViews[a.bufferView], w = decodedDoc.bufferViews[b.bufferView];
      assert.deepEqual(binary(decoded).subarray(w.byteOffset, w.byteOffset + w.byteLength), binary(original).subarray(v.byteOffset, v.byteOffset + v.byteLength));
    }
    for (const key of ['scenes', 'nodes', 'meshes', 'materials']) assert.deepEqual(decodedDoc[key], originalDoc[key]);
    assert.deepEqual(await decodePreviewGlb(source), decoded);
    assert.equal((await downloadResolvedArtifact(config, resolved, undefined, fetchImpl)).blender_path, download.blender_path);
  } finally { await rm(config.dataDir, { force: true, recursive: true }); }
});

it('keeps uncompressed GLB and other formats byte-for-byte without creating unnecessary copies', async () => {
  const { config } = await makeRuntime();
  try {
    for (const [name, source] of [['model.glb', fixtureGlb()], ['model.fbx', Buffer.from('FBX artifact')], ['model.zip', Buffer.from('ZIP artifact')]]) {
      const download = await downloadResolvedArtifact(config, { url: 'https://cdn.tripo3d.ai/artifact', defaultName: name }, undefined, async () => new Response(source));
      assert.deepEqual(await readFile(download.path), source);
      if (name.endsWith('.glb')) { assert.equal(download.blender_path, download.path); assert.equal(download.meshopt_decoded, false); }
      else assert.equal(download.blender_path, undefined);
    }
  } finally { await rm(config.dataDir, { force: true, recursive: true }); }
});

it('reports a compatibility failure while preserving a successful source download', async () => {
  const { config } = await makeRuntime();
  try {
    const source = Buffer.from('not a valid GLB');
    const download = await downloadResolvedArtifact(config, { url: 'https://cdn.tripo3d.ai/model.glb', defaultName: 'model.glb' }, undefined, async () => new Response(source));
    assert.equal(download.blender_error.code, 'FILE_INVALID');
    assert.equal(download.blender_path, undefined);
    assert.deepEqual(await readFile(download.path), source);
    await assert.rejects(decodeMeshoptGlb(await compressed(), 100), /oversized/);
  } finally { await rm(config.dataDir, { force: true, recursive: true }); }
});

const executable = process.env.TRIPO_BLENDER_EXECUTABLE ?? (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : null);
const available = executable && await access(executable).then(() => true, () => false);
it('runs real Blender inspection on a Meshopt source through the public operation', { skip: !available, timeout: 30000 }, async () => {
  const { config, service } = await makeRuntime(); config.blenderExecutable = executable;
  try {
    const source = await compressed(), model = path.join(config.dataDir, 'source.glb');
    await writeFile(model, source);
    const { task } = await service.prepare('local.inspect_parts', { model_path: model, submit: true });
    const done = (await service.sync(task.task_id)).task;
    assert.equal(done.status, 'succeeded');
    assert.deepEqual(done.result.parts.map(p => p.name).sort(), ['Back', 'Front']);
    assert.equal(done.result.parts.reduce((sum, p) => sum + p.triangle_count, 0), 4);
    assert.ok(done.result.parts.every(p => p.has_uv));
    assert.deepEqual(await readFile(model), source);
  } finally { await rm(config.dataDir, { force: true, recursive: true }); }
});
