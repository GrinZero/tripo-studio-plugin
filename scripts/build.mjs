#!/usr/bin/env node
// Bundles the plugin into dist/ for distribution: single-file server bundle +
// static assets and a platform-independent ImageMagick WASM runtime.
import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

await mkdir(path.join(root, "dist"), { recursive: true });
await copyFile(fileURLToPath(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm')), path.join(root, 'dist', 'magick.wasm'));

const server = await build({
  bundle: true,
  entryPoints: [path.join(root, "src", "server.mjs")],
  // Bundled CommonJS dependencies still require Node builtins at runtime.
  banner: { js: 'import { createRequire as createRuntimeRequire } from "node:module"; const require = createRuntimeRequire(import.meta.url);' },
  format: "esm",
  minify: false,
  metafile: true,
  outfile: path.join(root, "dist", "server.mjs"),
  platform: "node",
  target: "node22"
});

const workbench = await build({
  bundle: true,
  entryPoints: [path.join(root, "ui", "workbench.mjs")],
  format: "iife",
  minify: true,
  metafile: true,
  outfile: path.join(root, "dist", "workbench.js"),
  platform: "browser",
  target: "es2022"
});

const card = await build({
  bundle: true, entryPoints: [path.join(root, "ui", "result-card.mjs")],
  format: "iife", minify: true, metafile: true, outfile: path.join(root, "dist", "result-card.js"),
  platform: "browser", target: "es2022"
});

// Retain the licenses and notices for third-party code copied into the bundles.
const packages = new Set();
for (const bundle of [server, workbench, card]) {
  for (const input of Object.keys(bundle.metafile.inputs)) {
    const match = input.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/);
    if (match) packages.add(match[1]);
  }
}
const notices = new Map();
for (const name of [...packages].sort()) {
  const directory = path.join(root, "node_modules", name);
  const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  let license;
  for (const filename of ["LICENSE", "LICENSE.txt", "LICENSE.md", "LICENSE-MIT", "license", "license.txt", "license.md"]) {
    license = await readFile(path.join(directory, filename), "utf8").catch(error => { if (error.code !== "ENOENT") throw error; return null; });
    if (license) break;
  }
  // Some modular AWS/Smithy packages declare Apache-2.0 but omit its text;
  // the S3 client includes the same standard license for the AWS SDK.
  if (!license && manifest.license === "Apache-2.0") license = await readFile(path.join(root, "node_modules", "@aws-sdk", "client-s3", "LICENSE"), "utf8");
  // cfworker's npm package omits the repository license and notices. Keep the
  // upstream texts in scripts/licenses/ so builds do not need network access.
  if (!license && name === "@cfworker/json-schema") license = await readFile(path.join(root, "scripts", "licenses", "cfworker-LICENSE.md"), "utf8");
  if (!license) throw new Error(`No license text found for bundled dependency ${name}`);
  const notice = name === "@cfworker/json-schema"
    ? await readFile(path.join(root, "scripts", "licenses", "cfworker-THIRD_PARTY_NOTICES.md"), "utf8")
    : await readFile(path.join(directory, "NOTICE"), "utf8").catch(error => { if (error.code !== "ENOENT") throw error; return ""; });
  const text = `${license.trim()}${notice ? `\n\n${notice.trim()}` : ""}`;
  const owners = notices.get(text) ?? [];
  owners.push(`${name}@${manifest.version} (${manifest.license ?? "see license below"})`);
  notices.set(text, owners);
}
await writeFile(path.join(root, "dist", "THIRD_PARTY_NOTICES.txt"), `Third-party code bundled with Tripo Studio for Codex\n\n${[...notices].map(([text, owners]) => `${owners.join("\n")}\n\n${text}`).join("\n\n---\n\n")}\n`);

console.log("build: server, MCP Apps and image WASM ready (no external runtime dependencies)");
