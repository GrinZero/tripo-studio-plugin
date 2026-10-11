import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { makeRuntime } from './helpers/runtime.mjs';
import { downloadResolvedArtifact } from '../src/studio/model-download.mjs';
import { createWorkbenchMedia } from '../src/ui/media.mjs';
import { cardItems } from '../ui/card-model.mjs';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const source = () => readFile(new URL('./fixtures/quad-cube.fbx', import.meta.url));

it('loads a completed texture task from its saved FBX when the cloud is unreachable', async t => {
  const { config, session } = await makeRuntime();
  try {
    await mkdir(config.assetRoot, { recursive: true });
    const bytes = await source(), file = path.join(config.assetRoot, 'textured.fbx');
    await writeFile(file, bytes);
    const task = { task_id: 'texture-task', kind: 'texture.generate', status: 'succeeded',
      account_fingerprint: await session.accountFingerprint(), remote: { project_id: 'project', operator_id: 'texture-version' },
      downloads: [{ path: file, format: 'fbx', bytes: bytes.length, artifact: 'model', output_index: 0 }] };
    let remoteCalls = 0;
    t.mock.method(globalThis, 'fetch', async () => { remoteCalls++; throw new TypeError('fetch failed'); });
    const media = createWorkbenchMedia({ config, session, store: { get: async () => task },
      gateway: { getProject: async () => ({ id: 'project', model_url: 'https://cdn.tripo3d.ai/textured.fbx' }) } });
    const [card] = cardItems({ review: { status: 'submitted' }, task });
    const preview = await media.preview(card.preview);
    assert.equal(preview.mime_type, 'model/fbx');
    assert.deepEqual(Buffer.from(preview.data_url.split(',')[1], 'base64'), bytes);
    assert.equal(remoteCalls, 0);
  } finally { await rm(config.dataDir, { recursive: true, force: true }); }
});

it('selects the saved output by index, checks ownership and containment, and falls back for deleted files', async t => {
  const { config, session } = await makeRuntime();
  try {
    await mkdir(config.assetRoot, { recursive: true });
    const bytes = await source(), file = path.join(config.assetRoot, 'second.fbx');
    await writeFile(file, bytes);
    const account = await session.accountFingerprint();
    const task = { kind: 'model.generate', status: 'succeeded', account_fingerprint: account,
      result: { models: [{ project_id: 'first', status: 'succeeded' }, { project_id: 'second', operator_id: 'frozen', status: 'succeeded' }] },
      downloads: [{ path: file, output_index: 1, artifact: 'model' }, { path: file, output_index: 0, artifact: 'model' }] };
    const calls = [];
    t.mock.method(globalThis, 'fetch', async () => new Response(bytes));
    const media = createWorkbenchMedia({ config, session, store: { get: async () => task },
      gateway: { getProject: async (...args) => { calls.push(args); return { id: args[0], model_url: 'https://cdn.tripo3d.ai/model.fbx' }; } } });
    assert.equal((await media.preview({ task_id: 'task', type: 'model', output_index: 1 })).mime_type, 'model/fbx');
    assert.deepEqual(calls, []);
    task.account_fingerprint = 'other-account';
    await assert.rejects(media.preview({ task_id: 'task', type: 'model', output_index: 1 }), /另一个账号/);
    task.account_fingerprint = account;
    const outside = path.join(config.dataDir, 'outside.fbx'); await writeFile(outside, bytes);
    task.downloads[0].path = outside;
    await assert.rejects(media.preview({ task_id: 'task', type: 'model', output_index: 1 }), /素材目录/);
    task.downloads[0].path = file;
    await rm(file);
    assert.equal((await media.preview({ task_id: 'task', type: 'model', output_index: 1 })).mime_type, 'model/fbx');
    assert.deepEqual(calls, [['second', 'frozen']]);
  } finally { await rm(config.dataDir, { recursive: true, force: true }); }
});

it('retains native quad FBX with the right suffix and previews the exact download', async () => {
  const { config } = await makeRuntime();
  try {
    const bytes = await source();
    const download = await downloadResolvedArtifact(config, {
      defaultName: 'smart.glb', url: 'https://cdn.tripo3d.ai/native.fbx?signature=secret'
    }, undefined, async () => new Response(bytes));
    assert.equal(path.basename(download.path), 'smart.fbx');
    assert.equal(download.format, 'fbx');
    assert.equal(download.blender_error, undefined);
    assert.deepEqual(await readFile(download.path), bytes);
    const [card] = cardItems({ download });
    assert.deepEqual(card.preview, { local_path: download.path, type: 'model' });
    assert.ok(card.details.some(([label, value]) => label === '文件格式' && value === 'FBX'));
    const preview = await createWorkbenchMedia({ config }).preview(card.preview);
    assert.equal(preview.mime_type, 'model/fbx');
    assert.deepEqual(preview.part_names, ['QuadCube']);
    assert.deepEqual(Buffer.from(preview.data_url.split(',')[1], 'base64'), bytes);
    const group = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    let triangles = 0;
    group.traverse(object => { if (object.isMesh) triangles += object.geometry.attributes.position.count / 3; });
    assert.equal(triangles, 12);
  } finally { await rm(config.dataDir, { recursive: true, force: true }); }
});

it('recognizes FBX from bytes for old mislabeled downloads and opaque artifact URLs', async () => {
  const { config } = await makeRuntime();
  try {
    await mkdir(config.assetRoot, { recursive: true });
    const bytes = await source(), old = path.join(config.assetRoot, 'old.glb');
    await writeFile(old, bytes);
    const preview = await createWorkbenchMedia({ config }).preview({ local_path: old, type: 'model' });
    assert.equal(preview.mime_type, 'model/fbx');
    const resolved = { defaultName: 'opaque.glb', url: 'https://cdn.tripo3d.ai/artifact' };
    const download = await downloadResolvedArtifact(config, resolved, undefined, async () => new Response(bytes));
    assert.equal(path.basename(download.path), 'opaque.fbx');
    assert.equal(download.blender_error, undefined);
    const explicit = await downloadResolvedArtifact(config, resolved, old, async () => new Response(bytes));
    assert.equal(explicit.path, old);
    assert.equal(explicit.format, 'fbx');
    assert.ok(cardItems({ download: explicit })[0].details.some(([, value]) => value === 'FBX'));
    assert.deepEqual(await readFile(old), bytes);
  } finally { await rm(config.dataDir, { recursive: true, force: true }); }
});

it('previews the selected frozen Smart Mesh FBX output without leaking its signed URL', async t => {
  const calls = [];
  const bytes = await source();
  const task = { kind: 'model.generate', account_fingerprint: 'account', result: {
    models: [{ project_id: 'first', status: 'succeeded' }, { project_id: 'second', operator_id: 'frozen', status: 'succeeded' }]
  } };
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes));
  const media = createWorkbenchMedia({ config: {}, session: { accountFingerprint: async () => 'account' },
    store: { get: async () => task }, gateway: { getProject: async (...args) => {
      calls.push(args); return { id: 'second', model_url: 'https://cdn.tripo3d.ai/native.fbx?signature=secret' };
    } } });
  const preview = await media.preview({ task_id: 'task', output_index: 1, type: 'model' });
  assert.equal(preview.mime_type, 'model/fbx');
  assert.deepEqual(calls, [['second', 'frozen']]);
  assert.ok(!JSON.stringify(preview).includes('signature=secret'));
});
