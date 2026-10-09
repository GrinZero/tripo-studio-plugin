#!/usr/bin/env node
// npm's version lifecycle runs after updating package.json and package-lock.json.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = relative => readFile(path.join(root, relative), "utf8");
const save = (relative, value) => writeFile(path.join(root, relative), value);
const { name, version } = JSON.parse(await read("package.json"));
for (const relative of [".codex-plugin/plugin.json", ".mcp.json", ".agents/plugins/marketplace.json"]) {
  const doc = JSON.parse(await read(relative));
  if (relative === ".codex-plugin/plugin.json") doc.version = version;
  if (relative === ".mcp.json") {
    doc.mcpServers["tripo-studio"].args = doc.mcpServers["tripo-studio"].args.map(arg => arg.startsWith("--package=") ? `--package=${name}@${version}` : arg);
  }
  if (relative === ".agents/plugins/marketplace.json") doc.plugins[0].source.version = version;
  await save(relative, `${JSON.stringify(doc, null, 2)}\n`);
}
const replacements = {
  "src/constants.mjs": text => text.replace(/(SERVER_VERSION = ")[^"]+/, `$1${version}`).replace(/workbench-v[\d.]+\.html/, `workbench-v${version}.html`),
  "ui/workbench.mjs": text => text.replace(/(name: 'Tripo Studio', version: ')[^']+/, `$1${version}`),
  "ui/result-card.mjs": text => text.replace(/(name:'Tripo Studio',version:')[^']+/, `$1${version}`),
  "skills/tripo-studio/SKILL.md": text => text.replace(/^# Tripo Studio [\d.]+/m, `# Tripo Studio ${version}`),
  "README.md": text => text.replace(/version-v[\d.]+-blue/, `version-v${version}-blue`).replace(/alt="Version [\d.]+"/, `alt="Version ${version}"`)
};
for (const [relative, replace] of Object.entries(replacements)) await save(relative, replace(await read(relative)));
console.log(`version: plugin, marketplace and runtime synchronized to ${version}`);
