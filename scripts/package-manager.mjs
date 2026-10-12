import { access, realpath } from "node:fs/promises";
import path from "node:path";

// pnpm exposes npm_execpath too, but it points to pnpm, not npm.
export function packageManagerCommand(cli, args, node = process.execPath) {
  if (!cli) throw Error("Run this command through pnpm run.");
  return /\.(?:c?js|mjs)$/i.test(cli) ? [node, [cli, ...args]] : [cli, args];
}

// Keep npm/npx consumer smoke tests independent of the development manager.
export async function findNpmCli({
  env = process.env,
  platform = process.platform,
} = {}) {
  const searchPath = env.PATH ?? env.Path ?? "";
  for (const directory of searchPath.split(path.delimiter).filter(Boolean)) {
    try {
      const launcher = await realpath(
        path.join(directory, platform === "win32" ? "npm.cmd" : "npm")
      );
      const cli =
        platform === "win32"
          ? path.join(path.dirname(launcher), "node_modules/npm/bin/npm-cli.js")
          : launcher;
      await access(cli);
      return cli;
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
    }
  }
  throw Error(
    "npm is required to test the published npx runtime. Install Node.js with npm."
  );
}
