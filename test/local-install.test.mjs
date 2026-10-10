import assert from 'node:assert/strict';
import { it } from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { installLocal } from '../scripts/install-local.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tripo-local-install-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'source with spaces'), base = path.join(dir, 'local install');
  for (const entry of ['.codex-plugin', '.mcp.json', 'package.json', 'dist', 'ui', 'skills', 'mcp', 'scripts/blender-worker.py']) {
    await mkdir(path.dirname(path.join(root, entry)), { recursive: true });
    await cp(path.join(repository, entry), path.join(root, entry), { recursive: true });
  }
  const calls = [], installed = [];
  const run = (command, args) => {
    assert.equal(command, 'codex', 'tests must not execute an external installer');
    calls.push(args);
    if (args.join(' ') === 'plugin list --json') return JSON.stringify({ installed });
    if (args[1] === 'add') installed.push({ pluginId: args[2], enabled: true, source: { path: path.join(base, 'plugins/tripo-studio-plugin') } });
    return '{}';
  };
  return { root, base, calls, run, options: { root, base, run, build: false } };
}

it('installs a thin local plugin pointing to an independent, dependency-free runtime', async t => {
  const { options, root, base, calls } = await fixture(t);
  const releaseConfig = await readFile(path.join(root, '.mcp.json'), 'utf8');
  const result = await installLocal(options);
  const config = JSON.parse(await readFile(path.join(result.plugin, '.mcp.json'), 'utf8')).mcpServers['tripo-studio'];
  assert.equal(config.command, process.execPath);
  assert.deepEqual(config.args, [path.join(base, 'runtime/mcp/bootstrap.mjs')]);
  assert.equal(config.cwd, result.runtime);
  assert.ok(config.env_vars.includes('TRIPO_PLUGIN_DATA_DIR'));
  assert.ok(config.env_vars.includes('TRIPO_OUTPUT_ROOTS'));
  assert.equal(await readFile(path.join(root, '.mcp.json'), 'utf8'), releaseConfig);
  await assert.rejects(readFile(path.join(result.plugin, 'dist/server.mjs')), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(result.runtime, 'node_modules/esbuild/package.json')), { code: 'ENOENT' });
  assert.equal(result.requiresReconnect, true);
  assert.ok(calls.some(args => args.join(' ') === 'plugin add tripo-studio-plugin@tripo-studio-local --json'));
});

it('serves a UI update through the same live MCP connection without reinstalling the plugin', async t => {
  const { options, root, base, calls } = await fixture(t);
  const result = await installLocal(options);
  const data = path.join(base, 'test-data');
  await mkdir(data);
  await writeFile(path.join(data, 'keep.txt'), 'existing task state');
  const client = new Client({ name: 'local-update-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(result.runtime, 'mcp/bootstrap.mjs')],
    env: { ...process.env, TRIPO_PLUGIN_DATA_DIR: data, TRIPO_ASSET_ROOT: path.join(data, 'assets'), TRIPO_OUTPUT_ROOTS: path.join(data, 'assets') }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const uri = 'ui://tripo-studio/result-card-v2.html';
    assert.ok(!(await client.readResource({ uri })).contents[0].text.includes('local-hot-update-proof'));
    const script = path.join(root, 'dist/result-card.js');
    await writeFile(script, await readFile(script, 'utf8') + '\n/*local-hot-update-proof*/');
    const callsBefore = calls.length;
    const updated = await installLocal(options);
    assert.equal(updated.uiChanged, true);
    assert.equal(updated.backendChanged, false);
    assert.equal(updated.requiresReconnect, false);
    assert.deepEqual(calls.slice(callsBefore), [['plugin', 'list', '--json']]);
    assert.ok((await client.readResource({ uri })).contents[0].text.includes('local-hot-update-proof'));
    assert.equal(await readFile(path.join(data, 'keep.txt'), 'utf8'), 'existing task state');
    assert.equal((await installLocal(options)).requiresReconnect, false);
  } finally { await client.close(); }
});

it('distinguishes backend and skill changes from UI updates', async t => {
  const { options, root } = await fixture(t);
  await installLocal(options);
  const server = path.join(root, 'dist/server.mjs');
  await writeFile(server, await readFile(server, 'utf8') + '\n/*backend-update*/');
  const backend = await installLocal(options);
  assert.equal(backend.backendChanged, true);
  assert.equal(backend.registrationRequired, false);
  assert.equal(backend.requiresReconnect, true);
  const skill = path.join(root, 'skills/tripo-studio/SKILL.md');
  await writeFile(skill, await readFile(skill, 'utf8') + '\nLocal skill update.');
  const skills = await installLocal(options);
  assert.equal(skills.backendChanged, false);
  assert.equal(skills.registrationRequired, true);
  assert.equal(skills.requiresReconnect, true);
  await rm(skill);
  const removed = await installLocal(options);
  assert.equal(removed.registrationRequired, true, 'removing a skill must also refresh the plugin cache');
});

it('keeps the previous runtime on missing artifacts and restores it if registration fails', async t => {
  const { options, root, run } = await fixture(t);
  const { runtime, plugin } = await installLocal(options);
  const original = await readFile(path.join(runtime, 'dist/result-card.js'), 'utf8');
  const originalSkill = await readFile(path.join(plugin, 'skills/tripo-studio/SKILL.md'), 'utf8');
  await rm(path.join(root, 'dist/result-card.js'));
  await assert.rejects(installLocal(options), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(runtime, 'dist/result-card.js'), 'utf8'), original);
  await writeFile(path.join(root, 'dist/result-card.js'), '/*updated UI*/');
  await writeFile(path.join(root, 'skills/tripo-studio/SKILL.md'), originalSkill + '\nChanged skill.');
  await assert.rejects(installLocal({ ...options, run: (command, args) => {
    if (args[1] === 'add') throw Error('registration failed');
    return run(command, args);
  } }), /registration failed/);
  assert.equal(await readFile(path.join(runtime, 'dist/result-card.js'), 'utf8'), original);
  assert.equal(await readFile(path.join(plugin, 'skills/tripo-studio/SKILL.md'), 'utf8'), originalSkill);
});
