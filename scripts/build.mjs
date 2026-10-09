#!/usr/bin/env node
// Bundles the plugin into dist/ for distribution: single-file server bundle +
// static assets (ui/workbench.html). node_modules stay external at install
// time except the pieces esbuild can inline safely.
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

await mkdir(path.join(root, "dist"), { recursive: true });

await build({
  bundle: true,
  entryPoints: [path.join(root, "src", "server.mjs")],
  external: ["@aws-sdk/*", "@smithy/*", "@modelcontextprotocol/*", "zod", "sharp"],
  format: "esm",
  minify: false,
  outfile: path.join(root, "dist", "server.mjs"),
  platform: "node",
  target: "node20"
});

await build({
  bundle: true,
  entryPoints: [path.join(root, "ui", "workbench.mjs")],
  format: "iife",
  minify: true,
  outfile: path.join(root, "dist", "workbench.js"),
  platform: "browser",
  target: "es2022"
});

await build({
  bundle: true, entryPoints: [path.join(root, "ui", "result-card.mjs")],
  format: "iife", minify: true, outfile: path.join(root, "dist", "result-card.js"),
  platform: "browser", target: "es2022"
});

console.log("build: server and self-contained MCP App ready (ui/ ships at package root)");
