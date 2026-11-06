#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  mkdir,
  writeFile,
  rm,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findNpmCli, packageManagerCommand } from "./package-manager.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const adapter = path.join(root, "packages", "deepseek-adapter");
const sandbox = await mkdtemp(path.join(tmpdir(), "tripo dsh package # "));
const npmCli = await findNpmCli();

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (bytes) => {
        output = (output + bytes).slice(-16000);
      });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Package check failed (${code}): ${output}`))
    );
  });
}

try {
  for (const directory of [root, adapter]) {
    const [command, args] = packageManagerCommand(process.env.npm_execpath, [
      "--dir",
      directory,
      "pack",
      "--pack-destination",
      sandbox,
    ]);
    await run(command, args);
  }
  const archives = await readdir(sandbox);
  const runtimeArchive = path.join(
    sandbox,
    archives.find((name) => /^tripo-studio-plugin-.*\.tgz$/.test(name))
  );
  const adapterArchive = path.join(
    sandbox,
    archives.find((name) => /^tripo-studio-deepseek-.*\.tgz$/.test(name))
  );
  const installation = path.join(sandbox, "installed with spaces");
  await mkdir(installation);
  await writeFile(
    path.join(installation, "package.json"),
    JSON.stringify({
      private: true,
      dependencies: { "tripo-studio-deepseek": `file:${adapterArchive}` },
      overrides: { "tripo-studio-plugin": `file:${runtimeArchive}` },
    })
  );
  await run(process.execPath, [
    npmCli,
    "install",
    "--prefix",
    installation,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--cache",
    path.join(sandbox, "cache"),
  ]);
  const installed = path.join(
    installation,
    "node_modules",
    "tripo-studio-deepseek"
  );
  const manifest = JSON.parse(
    await readFile(path.join(installed, "package.json"), "utf8")
  );
  assert.equal(manifest.engines.dsh, "0.2.2-rc.1");
  const host = await import(
    pathToFileURL(path.join(installed, manifest.main)).href
  );
  const tools = new Map(),
    effects = [];
  let route;
  const ctx = {
    effect: (factory) => {
      const dispose = factory();
      effects.push(dispose);
      return dispose;
    },
    tools: {
      register: (tool) => {
        tools.set(tool.name, tool);
        return () => tools.delete(tool.name);
      },
    },
    connection: {
      fetch: {
        register: (value) => {
          route = value;
        },
      },
    },
    skills: { register: () => {} },
    get: () => undefined,
  };
  const saved = {
    data: process.env.TRIPO_PLUGIN_DATA_DIR,
    assets: process.env.TRIPO_ASSET_ROOT,
  };
  process.env.TRIPO_PLUGIN_DATA_DIR = path.join(sandbox, "state");
  process.env.TRIPO_ASSET_ROOT = path.join(sandbox, "assets");
  try {
    await host.apply(ctx);
    assert.equal(tools.size, 62);
    const response = await route.fetch(
      new Request("http://localhost/api/tripo-studio", {
        method: "POST",
        body: JSON.stringify({
          action: "attach",
          sessionId: "pack-session",
          surface: "probe",
        }),
      })
    );
    assert.equal(response.status, 200);
    const view = await response.json();
    assert.equal(
      view.tools.some((tool) => tool.name === "tripo_ui_review"),
      false
    );
    const htmlResponse = await route.fetch(
      new Request("http://localhost/api/tripo-studio", {
        method: "POST",
        body: JSON.stringify({
          action: "readResource",
          token: view.token,
          uri: view.uri,
        }),
      })
    );
    const html = await htmlResponse.json();
    assert.ok(html.contents[0].text.includes("ui/initialize"));
  } finally {
    for (const dispose of effects.reverse()) await dispose?.();
    if (saved.data === undefined) delete process.env.TRIPO_PLUGIN_DATA_DIR;
    else process.env.TRIPO_PLUGIN_DATA_DIR = saved.data;
    if (saved.assets === undefined) delete process.env.TRIPO_ASSET_ROOT;
    else process.env.TRIPO_ASSET_ROOT = saved.assets;
  }
  assert.equal(tools.size, 0);
  await mkdir(path.join(root, "artifacts"), { recursive: true });
  await copyFile(
    adapterArchive,
    path.join(root, "artifacts", path.basename(adapterArchive))
  );
  console.log(
    "DeepSeek package: isolated npm install without lifecycle scripts, MCP resources, tool registration and disposal passed."
  );
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
