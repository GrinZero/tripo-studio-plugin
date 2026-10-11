// Reproduces a completed task whose cloud preview fails before local download.
// No Studio calls or billing; serves the production card and real media reader.
import http from 'node:http';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { createWorkbenchMedia } from '../../src/ui/media.mjs';
import { fail } from '../../src/mcp/result.mjs';
import { solidImage } from '../helpers/image-fixture.mjs';
import { inspectImage } from '../../src/util/image.mjs';
import { snapshotDirectory } from '../../src/ops/images.mjs';

const dir = await mkdtemp(path.join(tmpdir(), 'tripo-result-preview-'));
await build({ entryPoints: [new URL('i18n-host.mjs', import.meta.url).pathname], outfile: path.join(dir, 'host.js'), bundle: true, format: 'esm', platform: 'browser' });
const html = await readFile(new URL('../../ui/result-card.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../../dist/result-card.js', import.meta.url), 'utf8');
const card = html.replace('<!-- CARD_SCRIPT -->', () => `<script>${script.replace(/<\/script/gi, '<\\/script')}</script>`);
const bytes = await readFile(process.env.TRIPO_TEST_FBX ?? new URL('../fixtures/quad-cube.fbx', import.meta.url));
const file = path.join(dir, 'textured.fbx');
await writeFile(file, bytes);
const task = { task_id: 'texture-task', kind: process.env.TRIPO_TEST_KIND ?? 'texture.generate', status: 'succeeded', account_fingerprint: 'account',
  remote: { project_id: 'project' }, downloads: [] };
const inputTaskId = 'ae4cc328-e7d3-4c62-8292-9a2e8e8ad3c8';
const inputFolder = snapshotDirectory({ dataDir: dir }, inputTaskId); await mkdir(inputFolder, { recursive: true });
const inputFile = path.join(inputFolder, 'front.png');
await writeFile(inputFile, await solidImage({ width: 100, height: 70, channels: 3, background: '#c9a775' }));
const inputImage = await inspectImage(inputFile);
const inputTask = { ...task, task_id: inputTaskId, kind: 'model.generate', input_summary: { mode: 'image', tier: 'high_detail', image_path: '/concepts/concept_threequarter.png' }, effective_settings: { face_limit: 30000, texture: true, texture_quality: 'detailed', pbr: false }, snapshots: [{ slot: 'image', source_name: 'concept_threequarter.png', relative_path: 'front.png', format: inputImage.format, width: inputImage.width, height: inputImage.height, size_bytes: inputImage.size, sha256: inputImage.sha256 }] };
const calls = [];
const media = createWorkbenchMedia({ config: { dataDir: dir, outputRoots: [dir] }, session: { accountFingerprint: async () => 'account' },
  store: { get: async id => id === inputTaskId ? inputTask : task }, gateway: { getProject: async () => { throw new TypeError('fetch failed'); } } });
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = data => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)); };
  try {
    if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><html><meta charset="utf-8"><iframe id="app" style="width:100%;height:1200px;border:0"></iframe><script type="module" src="/host.js"></script></html>'); }
    if (url.pathname === '/host.js') { res.setHeader('content-type', 'text/javascript'); return res.end(await readFile(path.join(dir, 'host.js'))); }
    if (url.pathname === '/card') { res.setHeader('content-type', 'text/html'); return res.end(card); }
    if (url.pathname === '/stats') return send({ calls });
    if (url.pathname === '/result') {
      const kind = url.searchParams.get('kind');
      const selected = kind === 'input-image' ? inputTask : kind === 'input-text' ? { ...inputTask, snapshots: [], input_summary: { mode: 'text', prompt: '保留木质栏杆的柱子与横杆细节。\n'.repeat(40) + '<script>literal input</script>', tier: 'high_detail' } } : task;
      return send({ content: [], structuredContent: { review: { status: 'submitted' }, task: selected } });
    }
    if (url.pathname === '/rpc') {
      let body = ''; for await (const chunk of req) body += chunk;
      const call = JSON.parse(body); calls.push(call);
      if (call.name === 'tripo_ui_preview') return send({ _meta: { tripo: { preview: await media.preview(call.arguments) } } });
      if (call.name === 'tripo_get_task') return send({ structuredContent: { task } });
      if (call.name === 'tripo_download') {
        const download = { path: file, format: 'fbx', bytes: bytes.length, artifact: 'model', output_index: 0 };
        task.downloads.push(download); return send({ structuredContent: { download } });
      }
      return send({ structuredContent: {} });
    }
    res.writeHead(404).end();
  } catch (error) { send(fail(error)); }
});
server.listen(43922, '127.0.0.1', () => console.log('Result preview host: http://127.0.0.1:43922'));
process.on('SIGTERM', async () => { server.close(); await rm(dir, { recursive: true, force: true }); process.exit(); });
