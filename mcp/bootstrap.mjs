#!/usr/bin/env node
// MCP entrypoint. Prefers the bundled build (dist/server.mjs, created by
// scripts/build.mjs / packaged releases) and falls back to the sources so the
// repository itself is runnable during development.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundled = path.join(root, "dist", "server.mjs");
const source = path.join(root, "src", "server.mjs");

const target = existsSync(bundled) ? bundled : source;
if (!existsSync(target)) {
  console.error("[tripo-studio-plugin] no server entry found; run `npm run build` or keep src/ alongside mcp/.");
  process.exit(1);
}
await import(pathToFileURL(target).href);
