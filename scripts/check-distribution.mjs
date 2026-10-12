#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseAllDocuments } from "yaml";
import { SERVER_NAME, SERVER_VERSION } from "../src/constants.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const json = async (relative) =>
  JSON.parse(await readFile(path.join(root, relative), "utf8"));
const pkg = await json("package.json");
const buildInfo = await json("dist/build-info.json");
assert.equal(
  buildInfo.version,
  pkg.version,
  "build marker differs from package version; run pnpm run build"
);
assert.match(
  buildInfo.timestamp,
  /^\d{14}$/,
  "build marker must include YYYYMMDDHHmmss"
);
assert.equal(buildInfo.time_zone, "Asia/Taipei");
assert.ok(
  Number.isFinite(Date.parse(buildInfo.built_at)),
  "build marker must record a valid build time"
);
const workbenchBundle = await readFile(
  path.join(root, "dist/workbench.js"),
  "utf8"
);
assert.ok(
  workbenchBundle.includes(buildInfo.timestamp) &&
    workbenchBundle.includes(buildInfo.built_at),
  "workbench must show the recorded build marker; run pnpm run build"
);
const cardBundle = await readFile(
  path.join(root, "dist/result-card.js"),
  "utf8"
);
assert.ok(
  cardBundle.includes(buildInfo.timestamp) &&
    cardBundle.includes(buildInfo.built_at),
  "preview cards must show the recorded build marker; run pnpm run build"
);
const plugin = await json(".codex-plugin/plugin.json");
const lockDocuments = parseAllDocuments(
  await readFile(path.join(root, "pnpm-lock.yaml"), "utf8")
);
for (const document of lockDocuments)
  assert.deepEqual(document.errors, [], "pnpm lockfile must be valid YAML");
const locks = lockDocuments.map((document) => document.toJS());
const lock = locks.find(
  (document) => document.importers?.["."]?.devDependencies
);
assert.ok(lock, "pnpm lockfile must contain the root development dependencies");
const manager = locks.find(
  (document) => document.importers?.["."]?.packageManagerDependencies
)?.importers["."].packageManagerDependencies.pnpm;
assert.equal(
  manager?.version,
  pkg.packageManager.split("@")[1],
  "lockfile must pin the declared pnpm version"
);
const locked = lock.importers["."];
const marketplace = await json(".agents/plugins/marketplace.json");
const entry = marketplace.plugins.find((item) => item.name === pkg.name);
const mcp = (await json(".mcp.json")).mcpServers["tripo-studio"];
assert.equal(pkg.private, undefined, "npm package must be publishable");
assert.equal(pkg.name, plugin.name);
assert.equal(pkg.name, SERVER_NAME);
assert.equal(
  pkg.version,
  plugin.version,
  "plugin version differs from npm version"
);
assert.equal(
  pkg.version,
  SERVER_VERSION,
  "server version differs from npm version"
);
assert.match(
  pkg.packageManager,
  /^pnpm@\d+\.\d+\.\d+$/,
  "pin the development package manager"
);
assert.deepEqual(
  Object.keys(locked.devDependencies).sort(),
  Object.keys(pkg.devDependencies).sort(),
  "lockfile must include all development dependencies"
);
for (const [name, specifier] of Object.entries(pkg.devDependencies)) {
  assert.equal(
    locked.devDependencies[name].specifier,
    specifier,
    `${name} lockfile specifier differs from package.json`
  );
}
assert.deepEqual(
  Object.keys(pkg.dependencies ?? {}),
  [],
  "runtime must use only bundled JavaScript and WASM"
);
assert.equal(
  pkg.devDependencies["@imagemagick/magick-wasm"],
  locked.devDependencies["@imagemagick/magick-wasm"].version,
  "pin the bundled image runtime"
);
for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
  assert.equal(
    version,
    locked.dependencies[name].version,
    `${name} must use the exact tested version`
  );
}
assert.equal(entry.source.source, "npm");
assert.equal(entry.source.package, pkg.name);
assert.equal(
  entry.source.version,
  pkg.version,
  "marketplace must select this exact release"
);
assert.equal(entry.policy.installation, "AVAILABLE");
assert.equal(entry.policy.authentication, "ON_USE");
assert.equal(mcp.command, "npx");
assert.deepEqual(mcp.args, [
  "--yes",
  "--ignore-scripts",
  "--prefix=./mcp",
  "--fetch-timeout=20000",
  "--fetch-retries=1",
  "--fetch-retry-mintimeout=1000",
  `--package=${pkg.name}@${pkg.version}`,
  "tripo-studio",
]);
assert.equal(pkg.bin["tripo-studio"], "mcp/bootstrap.mjs");
assert.ok(
  mcp.startup_timeout_sec >= 180,
  "allow time for the first runtime download"
);
assert.equal(pkg.publishConfig.registry, "https://registry.npmjs.org/");
assert.equal(pkg.publishConfig.access, "public");
for (const lifecycle of ["preinstall", "install", "postinstall"]) {
  assert.equal(
    pkg.scripts[lifecycle],
    undefined,
    `consumers must not need ${lifecycle}`
  );
}
assert.equal(
  pkg.scripts.prepare,
  "husky",
  "install development hooks through prepare; pnpm pack strips publish lifecycles"
);
if (process.env.RELEASE_TAG) {
  assert.match(
    pkg.version,
    /^\d+\.\d+\.\d+$/,
    "only stable releases are published by this workflow"
  );
  assert.equal(
    process.env.RELEASE_TAG,
    `v${pkg.version}`,
    "release tag differs from package version"
  );
}
for (const relative of [
  plugin.interface.logo,
  plugin.interface.composerIcon,
  pkg.bin["tripo-studio"],
  "scripts/blender-worker.py",
  "skills/tripo-studio/SKILL.md",
]) {
  await readFile(path.resolve(root, relative));
}
console.log(
  `distribution: ${pkg.name}@${pkg.version}, marketplace and MCP configuration agree`
);
