#!/usr/bin/env node
// Exercise the actual npm tarball through npm exec (npx), from outside the repo,
// with an empty cache and lifecycle scripts disabled, then repeat fully offline.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, copyFile, mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { solidImage } from '../test/helpers/image-fixture.mjs';

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const mcp = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf8")).mcpServers["tripo-studio"];
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "run with npm run test:package so the cross-platform npm CLI path is available");
const sandbox = await mkdtemp(path.join(tmpdir(), "tripo-package-"));
const cache = path.join(sandbox, "npm-cache");
const npm = (args, cwd = root) => new Promise((resolve, reject) => {
  const proc = spawn(process.execPath, [npmCli, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  proc.stdout.on("data", chunk => { stdout += chunk; });
  proc.stderr.on("data", chunk => { stderr += chunk; });
  proc.on("error", reject);
  proc.on("close", code => code === 0 ? resolve(stdout) : reject(new Error(`npm ${args[0]} failed (${code}): ${stderr}`)));
});

async function handshake(tarball, offline) {
  const work = path.join(sandbox, offline ? "warm" : "cold");
  await mkdir(path.join(work, "mcp"), { recursive: true });
  // Codex extracts the plugin's own package.json but does not install its deps.
  // An explicit prefix prevents npx from mistaking that manifest for an already
  // installed runtime and looking for a missing local node_modules/.bin entry.
  await copyFile(path.join(root, "package.json"), path.join(work, "package.json"));
  const env = { ...process.env, TRIPO_PLUGIN_DATA_DIR: path.join(work, "data"), TRIPO_ASSET_ROOT: path.join(work, "assets"), TRIPO_OUTPUT_ROOTS: path.join(work, "assets") };
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  delete env.TRIPO_BROWSER_PROFILE_DIR;
  const runtimeArgs = mcp.args.slice(0, -1).map(arg => arg.startsWith("--package=") ? `--package=${tarball}` : arg);
  const proc = spawn(process.execPath, [npmCli, "exec", ...runtimeArgs, "--no-audit", "--no-fund", "--cache", cache, ...(offline ? ["--offline"] : []), "--", mcp.args.at(-1)], {
    cwd: work, env, stdio: ["pipe", "pipe", "pipe"]
  });
  let buffer = "", stderr = "", id = 0, exited;
  const pending = new Map();
  const fail = error => { exited = error; for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); };
  proc.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-12000); });
  proc.on("error", fail);
  proc.on("close", code => fail(new Error(`packaged server exited (${code}): ${stderr}`)));
  proc.stdout.on("data", chunk => {
    buffer += chunk;
    for (;;) {
      const end = buffer.indexOf("\n");
      if (end < 0) break;
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { fail(new Error(`non-MCP output on stdout: ${line}`)); return; }
      const item = pending.get(message.id);
      if (!item) continue;
      clearTimeout(item.timer); pending.delete(message.id);
      message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result);
    }
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    if (exited) { reject(exited); return; }
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`timeout waiting for ${method}: ${stderr}`)); }, method === "initialize" ? mcp.startup_timeout_sec * 1000 : 20000);
    pending.set(requestId, { resolve, reject, timer });
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })}\n`);
  });
  const call = async (name, args = {}) => {
    const result = await request("tools/call", { name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return result;
  };
  try {
    const init = await request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "npm-package-smoke", version: "1.0.0" } });
    assert.equal(init.serverInfo.name, pkg.name);
    assert.equal(init.serverInfo.version, pkg.version);
    // Inspect the package npm actually installed, so the test cannot silently
    // pass using the workspace or a different direct dependency version.
    const [cacheKey] = await readdir(path.join(cache, "_npx"));
    const modules = path.join(cache, "_npx", cacheKey, "node_modules");
    const runtimeRoot = path.join(modules, pkg.name);
    assert.equal(JSON.parse(await readFile(path.join(runtimeRoot, "package.json"), "utf8")).version, pkg.version);
    for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
      const nested = path.join(runtimeRoot, "node_modules", name, "package.json");
      const location = await access(nested).then(() => nested, () => path.join(modules, name, "package.json"));
      assert.equal(JSON.parse(await readFile(location, "utf8")).version, version, `npx must install pinned ${name}`);
    }
    assert.equal(await access(path.join(modules, "esbuild")).then(() => true, () => false), false, "runtime must not install the build tool");
    for (const name of ['sharp', '@imagemagick/magick-wasm']) {
      assert.equal(await access(path.join(modules, name)).then(() => true, () => false), false, `runtime must not install ${name}`);
    }
    await access(path.join(runtimeRoot, 'dist', 'magick.wasm'));
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const tools = (await request("tools/list", {})).tools;
    assert.equal(tools.length, 67);
    const workbench = tools.find(tool => tool.name === "tripo_open_workbench");
    assert.ok(workbench.icons[0].src.startsWith("data:image/png;base64,"));
    const resources = (await request("resources/list", {})).resources;
    for (const uri of [workbench._meta.ui.resourceUri, "ui://tripo-studio/result-card-v2.html"]) {
      assert.ok(resources.some(resource => resource.uri === uri));
      const resource = (await request("resources/read", { uri })).contents[0];
      assert.equal(resource.mimeType, "text/html;profile=mcp-app");
      assert.ok(resource.text.includes("ui/initialize"));
      assert.doesNotMatch(resource.text, /<!-- (?:WORKBENCH|CARD)_SCRIPT -->/);
    }
    assert.equal((await call("tripo_open_workbench")).structuredContent.session.authenticated, false);
    // An actual image import + crop checks the bundled image WASM without installed runtime dependencies.
    const png = await solidImage({ width: 16, height: 12, channels: 3, background: "#cc7755" });
    const imported = await call("tripo_ui_import_image", { name: "fixture.png", data_base64: png.toString("base64") });
    for (const format of ['jpeg', 'webp']) {
      const bytes = await solidImage({ width: 16, height: 12, background: '#cc7755' }, { format });
      const image = await call('tripo_ui_import_image', { name: `fixture.${format}`, data_base64: bytes.toString('base64') });
      assert.equal(image.structuredContent.width, 16);
      assert.equal(image.structuredContent.height, 12);
    }
    const crop = await call("tripo_crop_image", { image_path: imported.structuredContent.file_path, left: 0, top: 0, width: 8, height: 6, submit: true });
    const done = await call("tripo_task_wait", { task_id: crop.structuredContent.task.task_id, timeout_seconds: 10, poll_seconds: 1 });
    assert.equal(done.structuredContent.task.status, "succeeded");
    const preview = await call("tripo_ui_preview", { task_id: crop.structuredContent.task.task_id, type: "image" });
    assert.equal(preview._meta.tripo.preview.width, 8);
    assert.equal(preview._meta.tripo.preview.height, 6);
    console.log(`package: ${offline ? "offline cached" : "fresh npx"} startup, 67 tools, MCP Apps and WASM image processing passed`);
  } finally {
    for (const item of pending.values()) clearTimeout(item.timer);
    // Closing MCP stdin also terminates the server behind npm exec, including
    // on Windows where killing npm alone would leave its child process alive.
    if (proc.exitCode === null && proc.signalCode === null) {
      const closed = new Promise(resolve => proc.once("close", resolve));
      proc.stdin.end();
      const timer = setTimeout(() => proc.kill("SIGKILL"), 5000);
      await closed;
      clearTimeout(timer);
    }
  }
}

try {
  const artifactDir = path.join(root, "artifacts");
  await mkdir(artifactDir, { recursive: true });
  const [packed] = JSON.parse(await npm(["pack", "--json", "--foreground-scripts=false", "--pack-destination", artifactDir]));
  const files = new Set(packed.files.map(file => file.path));
  for (const required of [".codex-plugin/plugin.json", ".mcp.json", "mcp/bootstrap.mjs", "dist/server.mjs", "dist/magick.wasm", "dist/workbench.js", "dist/result-card.js", "dist/THIRD_PARTY_NOTICES.txt", "ui/workbench.html", "ui/result-card.html", "ui/tripo-logo.png", "scripts/blender-worker.py", "skills/tripo-studio/SKILL.md", "skills/tripo-studio/references/asset-groups.md", "docs/DISTRIBUTION.md"]) assert.ok(files.has(required), `tarball is missing ${required}`);
  for (const file of files) assert.doesNotMatch(file, /^(?:src|test|design|node_modules|\.github|\.local)\/|(?:^|\/)\.env(?:\.|$)/);
  const tarball = path.join(artifactDir, packed.filename);
  await handshake(tarball, false);
  await handshake(tarball, true);
  console.log(`package: verified ${packed.filename} (${packed.size} bytes, ${files.size} files)`);
} finally {
  await rm(sandbox, { force: true, recursive: true });
}
