#!/usr/bin/env node
// The version lifecycle runs after the package manager updates package.json.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (relative) => readFile(path.join(root, relative), "utf8");
const save = (relative, value) => writeFile(path.join(root, relative), value);
const { name, version } = JSON.parse(await read("package.json"));
for (const relative of [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  ".agents/plugins/marketplace.json",
]) {
  const doc = JSON.parse(await read(relative));
  if (relative === ".codex-plugin/plugin.json") doc.version = version;
  if (relative === ".mcp.json") {
    doc.mcpServers["tripo-studio"].args = doc.mcpServers[
      "tripo-studio"
    ].args.map((arg) =>
      arg.startsWith("--package=") ? `--package=${name}@${version}` : arg
    );
  }
  if (relative === ".agents/plugins/marketplace.json")
    doc.plugins[0].source.version = version;
  await save(relative, `${JSON.stringify(doc, null, 2)}\n`);
}
const replacements = {
  "src/constants.mjs": (text) =>
    text.replace(/(SERVER_VERSION = ")[^"]+/, `$1${version}`),
  "ui/result-card.mjs": (text) =>
    text.replace(
      /(name:\s*(["'])Tripo Studio\2,\s*version:\s*)(["'])[^"']+\3/,
      (_match, prefix, _nameQuote, quote) =>
        `${prefix}${quote}${version}${quote}`
    ),
  "skills/tripo-studio/SKILL.md": (text) =>
    text.replace(/^# Tripo Studio [\d.]+/m, `# Tripo Studio ${version}`),
  "TOOL_INVENTORY.md": (text) =>
    text.replace(
      /^(# Tool inventory — \d+ MCP tools \()[\d.]+(\))/m,
      `$1${version}$2`
    ),
};
for (const relative of [
  "README.md",
  "README.en.md",
  "README.zh-TW.md",
  "README.ja.md",
  "README.ko.md",
]) {
  replacements[relative] = (text) =>
    text
      .replace(/NPM-v[\d.]+-CB3837/, `NPM-v${version}-CB3837`)
      .replace(/version-v[\d.]+-blue/, `version-v${version}-blue`)
      .replace(/alt="Version [\d.]+"/, `alt="Version ${version}"`);
}
for (const [relative, replace] of Object.entries(replacements))
  await save(relative, replace(await read(relative)));
console.log(
  `version: plugin, marketplace and runtime synchronized to ${version}`
);
