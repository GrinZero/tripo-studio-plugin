import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export async function buildDeepSeek() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const directory = path.join(root, "packages", "deepseek-adapter");
  const pkg = JSON.parse(
    await readFile(path.join(directory, "package.json"), "utf8")
  );
  await mkdir(path.join(directory, "dist"), { recursive: true });
  const host = await build({
    entryPoints: [path.join(directory, "src", "host.mjs")],
    outfile: path.join(directory, "dist", "host.mjs"),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    metafile: true,
    external: ["@deepseek-ai/*"],
    banner: {
      js: 'import { createRequire as createRuntimeRequire } from "node:module"; const require = createRuntimeRequire(import.meta.url);',
    },
  });
  const client = await build({
    entryPoints: [path.join(directory, "src", "client.mjs")],
    outfile: path.join(directory, "dist", "client.js"),
    bundle: true,
    format: "cjs",
    platform: "browser",
    target: "es2022",
    metafile: true,
    external: ["react"],
    banner: {
      js: `globalThis.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory(require){var module={exports:{}};var exports=module.exports;`,
    },
    footer: { js: "return module.exports;}});" },
  });
  await copyFile(
    path.join(root, "LICENSE"),
    path.join(directory, "dist", "LICENSE")
  );
  await writeFile(
    path.join(directory, "dist", "build-info.json"),
    JSON.stringify(
      {
        version: pkg.version,
        runtime: pkg.dependencies["tripo-studio-plugin"],
        dsh: pkg.engines.dsh,
      },
      null,
      2
    ) + "\n"
  );
  return [host, client];
}
