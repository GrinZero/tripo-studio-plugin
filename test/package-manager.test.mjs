import assert from "node:assert/strict";
import { it } from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { Script } from "node:vm";
import os from "node:os";
import path from "node:path";
import {
  findNpmCli,
  packageManagerCommand,
} from "../scripts/package-manager.mjs";

it("keeps Playwright checks valid as function expressions for run-code", async () => {
  const directory = new URL("./browser/", import.meta.url);
  for (const file of (await readdir(directory)).filter((file) =>
    file.endsWith(".js")
  )) {
    const source = await readFile(new URL(file, directory), "utf8");
    assert.doesNotThrow(() => new Script(`(${source})`), file);
  }
});

it("runs JavaScript package managers through Node and standalone pnpm binaries directly", () => {
  assert.deepEqual(
    packageManagerCommand("/tool path/pnpm.cjs", ["run", "build"], "/node"),
    ["/node", ["/tool path/pnpm.cjs", "run", "build"]]
  );
  assert.deepEqual(
    packageManagerCommand("/tool path/pnpm", ["install", "--frozen-lockfile"]),
    ["/tool path/pnpm", ["install", "--frozen-lockfile"]]
  );
  assert.deepEqual(packageManagerCommand("C:\\tools\\pnpm.exe", ["pack"]), [
    "C:\\tools\\pnpm.exe",
    ["pack"],
  ]);
  assert.throws(() => packageManagerCommand(undefined, ["pack"]), /pnpm run/);
});

it("finds npm independently of npm_execpath and handles Windows command wrappers", async (t) => {
  const directory = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "tripo-pm-"))
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "npm"), "// npm CLI");
  const env = { PATH: directory, npm_execpath: "/unrelated/pnpm" };
  assert.equal(
    await findNpmCli({ env, platform: "darwin" }),
    path.join(directory, "npm")
  );
  await writeFile(path.join(directory, "npm.cmd"), "@echo off");
  const windowsCli = path.join(directory, "node_modules/npm/bin/npm-cli.js");
  await mkdir(path.dirname(windowsCli), { recursive: true });
  await writeFile(windowsCli, "// npm CLI");
  assert.equal(await findNpmCli({ env, platform: "win32" }), windowsCli);
  await assert.rejects(
    findNpmCli({ env: { PATH: path.join(directory, "missing") } }),
    /npm is required/
  );
});
