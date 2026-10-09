#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SERVER_NAME, SERVER_VERSION } from "../src/constants.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const json = async relative => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const pkg = await json("package.json");
const plugin = await json(".codex-plugin/plugin.json");
const lock = await json("package-lock.json");
const marketplace = await json(".agents/plugins/marketplace.json");
const entry = marketplace.plugins.find(item => item.name === pkg.name);
const mcp = (await json(".mcp.json")).mcpServers["tripo-studio"];
assert.equal(pkg.private, undefined, "npm package must be publishable");
assert.equal(pkg.name, plugin.name);
assert.equal(pkg.name, SERVER_NAME);
assert.equal(pkg.version, plugin.version, "plugin version differs from npm version");
assert.equal(pkg.version, SERVER_VERSION, "server version differs from npm version");
assert.equal(pkg.version, lock.version, "lockfile version differs from npm version");
assert.equal(pkg.version, lock.packages[""].version);
assert.deepEqual(pkg.dependencies, lock.packages[""].dependencies);
assert.deepEqual(Object.keys(pkg.dependencies ?? {}), [], "runtime must use only bundled JavaScript and WASM");
assert.equal(pkg.devDependencies['@imagemagick/magick-wasm'], lock.packages['node_modules/@imagemagick/magick-wasm'].version, "pin the bundled image runtime");
for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
  assert.equal(version, lock.packages[`node_modules/${name}`].version, `${name} must use the exact tested version`);
}
assert.equal(entry.source.source, "npm");
assert.equal(entry.source.package, pkg.name);
assert.equal(entry.source.version, pkg.version, "marketplace must select this exact release");
assert.equal(entry.policy.installation, "AVAILABLE");
assert.equal(entry.policy.authentication, "ON_USE");
assert.equal(mcp.command, "npx");
assert.deepEqual(mcp.args, ["--yes", "--ignore-scripts", "--prefix=./mcp", "--fetch-timeout=20000", "--fetch-retries=1", "--fetch-retry-mintimeout=1000", `--package=${pkg.name}@${pkg.version}`, "tripo-studio"]);
assert.equal(pkg.bin["tripo-studio"], "mcp/bootstrap.mjs");
assert.ok(mcp.startup_timeout_sec >= 180, "allow time for the first runtime download");
assert.equal(pkg.publishConfig.registry, "https://registry.npmjs.org/");
assert.equal(pkg.publishConfig.access, "public");
for (const lifecycle of ["preinstall", "install", "postinstall", "prepare"]) {
  assert.equal(pkg.scripts[lifecycle], undefined, `consumers must not need ${lifecycle}`);
}
if (process.env.RELEASE_TAG) {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, "only stable releases are published by this workflow");
  assert.equal(process.env.RELEASE_TAG, `v${pkg.version}`, "release tag differs from package version");
}
for (const relative of [plugin.interface.logo, plugin.interface.composerIcon, pkg.bin["tripo-studio"], "scripts/blender-worker.py", "skills/tripo-studio/SKILL.md"]) {
  await readFile(path.resolve(root, relative));
}
console.log(`distribution: ${pkg.name}@${pkg.version}, marketplace and MCP configuration agree`);
