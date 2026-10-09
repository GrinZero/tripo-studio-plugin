import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";

async function fixture(t) {
  const sandbox = await mkdtemp(path.join(tmpdir(), "tripo-bootstrap-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const root = path.join(sandbox, "plugin with spaces # and %");
  await mkdir(path.join(root, "mcp"), { recursive: true });
  await copyFile(new URL("../mcp/bootstrap.mjs", import.meta.url), path.join(root, "mcp", "bootstrap.mjs"));
  return root;
}

async function server(root, directory) {
  await mkdir(path.join(root, directory), { recursive: true });
  await writeFile(path.join(root, directory, "server.mjs"), `console.log(${JSON.stringify(directory)});\n`);
}

function start(root) {
  return spawnSync(process.execPath, [path.join(root, "mcp", "bootstrap.mjs")], { encoding: "utf8" });
}

it("bootstrap prefers the bundle in a path containing spaces and URL characters", async t => {
  const root = await fixture(t);
  await server(root, "dist");
  await server(root, "src");
  const result = start(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "dist");
});

it("bootstrap falls back to source in a path containing spaces and URL characters", async t => {
  const root = await fixture(t);
  await server(root, "src");
  const result = start(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "src");
});

it("bootstrap reports how to restore a missing server entry", async t => {
  const result = start(await fixture(t));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no server entry found; run `npm run build`/);
  assert.equal(result.stdout, "");
});
