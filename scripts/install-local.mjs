#!/usr/bin/env node
// Local development uses a stable runtime outside Codex's replaceable cache.
// Release manifests continue to use the pinned npm package.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileLock } from '../src/store/lock.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const marketplaceName = 'tripo-studio-local';
const backendFiles = ['mcp/bootstrap.mjs', 'dist/server.mjs', 'dist/magick.wasm', 'scripts/blender-worker.py'];
const uiFiles = ['dist/workbench.js', 'dist/result-card.js', 'ui/workbench.html', 'ui/result-card.html', 'ui/tripo-logo.png', 'ui/icon.svg'];
const runtimeFiles = [...backendFiles, ...uiFiles, 'dist/THIRD_PARTY_NOTICES.txt', 'package.json'];
const exists = file => readFile(file).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n');
};

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} ${args.slice(0, 3).join(' ')} failed (${result.status}): ${result.stderr}`);
  return result.stdout;
}

async function digest(root, files) {
  const hash = createHash('sha256');
  for (const file of files) {
    const bytes = await readFile(path.join(root, file)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    hash.update(file + '\0').update(bytes ?? '<missing>').update('\0');
  }
  return hash.digest('hex');
}

async function filesIn(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    const file = path.join(relative, entry.name);
    return entry.isDirectory() ? filesIn(root, file) : file;
  }))).flat().sort();
}

// Each replacement is prepared before touching the previous install. Keep the
// old directories until both installation and registration have succeeded.
async function replaceDirectory(next, target, backup) {
  let previous = true;
  try { await rename(target, backup); }
  catch (error) { if (error.code !== 'ENOENT') throw error; previous = false; }
  try { await rename(next, target); }
  catch (error) { if (previous) await rename(backup, target); throw error; }
  return async () => {
    await rm(target, { recursive: true, force: true });
    if (previous) await rename(backup, target);
  };
}

export async function installLocal({
  root = repository,
  base = path.join(os.homedir(), '.local/share/codex-integrations', marketplaceName),
  node = process.execPath, run = runCommand, build = true, npmCli = process.env.npm_execpath
} = {}) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Node.js 22+ is required.');
  root = path.resolve(root); base = path.resolve(base);
  await mkdir(base, { recursive: true });
  return new FileLock(path.join(base, 'locks')).withLock('install', async () => {
    if (build) {
      if (!npmCli) throw Error('Run this installer with npm run install:local.');
      if (!await exists(path.join(root, 'node_modules/esbuild/package.json'))) run(node, [npmCli, 'ci'], root);
      run(node, [npmCli, 'run', 'build'], root);
    }
    const manifest = await json(path.join(root, '.codex-plugin/plugin.json'));
    const portableMcp = await json(path.join(root, '.mcp.json'));
    const runtime = path.join(base, 'runtime');
    const plugin = path.join(base, 'plugins', manifest.name);
    const selector = `${manifest.name}@${marketplaceName}`;
    const stage = await mkdtemp(path.join(base, '.install-'));
    const rollback = [];
    try {
      const nextRuntime = path.join(stage, 'runtime'), nextPlugin = path.join(stage, 'plugin');
      for (const file of runtimeFiles) {
        await mkdir(path.dirname(path.join(nextRuntime, file)), { recursive: true });
        await cp(path.join(root, file), path.join(nextRuntime, file));
      }
      await cp(path.join(root, 'skills'), path.join(nextPlugin, 'skills'), { recursive: true });
      for (const file of ['ui/tripo-logo.png', 'ui/icon.svg']) {
        await mkdir(path.dirname(path.join(nextPlugin, file)), { recursive: true });
        await cp(path.join(root, file), path.join(nextPlugin, file));
      }
      await writeJson(path.join(nextPlugin, '.codex-plugin/plugin.json'), manifest);
      await writeJson(path.join(nextPlugin, '.mcp.json'), {
        mcpServers: { 'tripo-studio': { ...portableMcp.mcpServers['tripo-studio'],
          command: node, args: [path.join(runtime, 'mcp/bootstrap.mjs')], cwd: runtime } }
      });
      const backendChanged = await digest(runtime, backendFiles) !== await digest(nextRuntime, backendFiles);
      const uiChanged = await digest(runtime, uiFiles) !== await digest(nextRuntime, uiFiles);
      const previousPluginFiles = await filesIn(plugin).catch(error => { if (error.code !== 'ENOENT') throw error; return []; });
      const pluginFiles = [...new Set([...await filesIn(nextPlugin), ...previousPluginFiles])].sort();
      const pluginChanged = await digest(plugin, pluginFiles) !== await digest(nextPlugin, pluginFiles);
      const installed = JSON.parse(run('codex', ['plugin', 'list', '--json'], root)).installed;
      const registrationRequired = pluginChanged || !installed.some(entry => entry.pluginId === selector && entry.enabled
        && path.resolve(entry.source?.path ?? '') === plugin);

      await mkdir(path.dirname(plugin), { recursive: true });
      rollback.push(await replaceDirectory(nextRuntime, runtime, path.join(stage, 'previous-runtime')));
      rollback.push(await replaceDirectory(nextPlugin, plugin, path.join(stage, 'previous-plugin')));
      const marketplaceFile = path.join(base, '.agents/plugins/marketplace.json');
      const previousMarketplace = await readFile(marketplaceFile).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
      await writeJson(marketplaceFile, {
        name: marketplaceName, interface: { displayName: 'Tripo Studio 本地开发' },
        plugins: [{ name: manifest.name, source: { source: 'local', path: `./plugins/${manifest.name}` },
          policy: { installation: 'AVAILABLE', authentication: 'ON_USE' }, category: 'Design' }]
      });
      rollback.push(async () => {
        if (previousMarketplace) await writeFile(marketplaceFile, previousMarketplace);
        else await rm(marketplaceFile, { force: true });
      });
      if (registrationRequired) {
        run('codex', ['plugin', 'marketplace', 'add', base, '--json'], root);
        run('codex', ['plugin', 'add', selector, '--json'], root);
      }
      return { runtime, plugin, selector, backendChanged, uiChanged, registrationRequired,
        requiresReconnect: backendChanged || registrationRequired };
    } catch (error) {
      for (const restore of rollback.reverse()) await restore();
      throw error;
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await installLocal();
    console.log(`Local runtime: ${result.runtime}`);
    if (result.requiresReconnect) console.log('本地安装／后端已更新：重连 Tripo MCP 或开启新聊天后生效。此后只改界面无需重装插件。');
    else if (result.uiChanged) console.log('界面已更新：重新打开工作台／结果卡片即可，无需重装插件或重启 MCP。');
    else console.log('本地运行目录已同步，无需重连 MCP。');
  } catch (error) {
    console.error(`[install:local] ${error.message}`);
    process.exitCode = 1;
  }
}
