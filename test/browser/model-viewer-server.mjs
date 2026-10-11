// Isolated production-adapter check with the same local-only CSP as MCP Apps.
import http from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { fixtureGlb } from '../helpers/glb-fixture.mjs';
import { browserPreviewOptions } from '../../scripts/browser-build-options.mjs';
import { solidImage } from '../helpers/image-fixture.mjs';
import { decodePreviewGlb } from '../../src/ui/media.mjs';

const root = new URL('../../', import.meta.url).pathname;
const dir = await mkdtemp(path.join(tmpdir(), 'tripo-model-viewer-'));
await build({ ...browserPreviewOptions, stdin: { contents: `
  import { mountModel } from './ui/viewer.mjs';
  import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
  import { $scene } from '@google/model-viewer/lib/model-viewer-base.js';
  const exportModel = GLTFExporter.prototype.parseAsync;
  GLTFExporter.prototype.parseAsync = async function (...args) {
    const bytes = await exportModel.apply(this, args);
    const document = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, new DataView(bytes).getUint32(12, true))));
    window.previewConversion = { bytes: bytes.byteLength, materials: document.materials, images: document.images };
    return bytes;
  };
  window.scene = () => document.querySelector('model-viewer')?.[$scene];
  window.ready = mountModel(document.querySelector('#stage'), window.source).then(adapter => {
    window.adapter = adapter; document.body.dataset.ready = 'true';
  }).catch(error => { document.body.dataset.error = error.message; });
`, resolveDir: root }, outfile: path.join(dir, 'viewer.js'), bundle: true, format: 'iife', platform: 'browser' });
const script = (await readFile(path.join(dir, 'viewer.js'), 'utf8')).replace(/<\/script/gi, '<\\/script');
const fbx = await readFile(new URL('../fixtures/quad-cube.fbx', import.meta.url));
const models = { glb: ['gltf-binary', fixtureGlb()], fbx: ['fbx', fbx] };
const original = fixtureGlb(), length = original.readUInt32LE(12);
const doc = JSON.parse(original.subarray(20, 20 + length));
doc.images = [{ uri: 'data:image/png;base64,' + (await solidImage({ width: 8, height: 8, channels: 4, background: '#c08040' })).toString('base64') }];
doc.textures = [{ source: 0 }];
doc.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
const json = Buffer.from(JSON.stringify(doc)), padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
const header = Buffer.from(original.subarray(0, 20)), tail = original.subarray(20 + length);
header.writeUInt32LE(20 + padded.length + tail.length, 8); header.writeUInt32LE(padded.length, 12);
models.textured = ['gltf-binary', Buffer.concat([header, padded, tail])];
models.meshopt = ['gltf-binary', await decodePreviewGlb(await readFile(new URL('../fixtures/meshopt-planes.glb', import.meta.url)))];
if (process.env.TRIPO_TEST_FBX) models.actual = ['fbx', await readFile(process.env.TRIPO_TEST_FBX)];
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const [format, bytes] = models[url.searchParams.get('source')] ?? models.glb;
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src data: blob:");
  res.end(`<!doctype html><html><meta charset="utf-8"><title>Model viewer preview check</title><style>body{margin:0;background:#0c0e16}#stage{width:760px;height:560px}</style><div id="stage"></div><script>window.source=${JSON.stringify(`data:model/${format};base64,${bytes.toString('base64')}`)};</script><script>${script}</script></html>`);
}).listen(43921, '127.0.0.1', () => console.log('Model viewer host: http://127.0.0.1:43921'));
