import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createMcpToolDefinition } from "@deepseek-ai/dsh-mcp-client";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { TripoBroker, ROUTE, publicToolName } from "./broker.mjs";

export const name = "tripo-studio";
export const inject = ["tools", "connection", "skills"];

function stateRoot() {
  if (process.env.TRIPO_PLUGIN_DATA_DIR)
    return process.env.TRIPO_PLUGIN_DATA_DIR;
  if (process.platform === "win32")
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"),
      "TripoStudioPlugin"
    );
  if (process.platform === "darwin")
    return path.join(
      homedir(),
      "Library",
      "Application Support",
      "TripoStudioPlugin"
    );
  return path.join(
    process.env.XDG_STATE_HOME ?? path.join(homedir(), ".local", "state"),
    "tripo-studio-plugin"
  );
}

export async function apply(ctx) {
  const skillPath = new URL("../skills/tripo-studio/SKILL.md", import.meta.url);
  const content = await readFile(skillPath, "utf8");
  ctx.skills.register({
    name: "tripo-studio",
    source: "runtime",
    description:
      "Generate, edit, rig, animate and export 3D assets with Tripo Studio; use editable 60-second configuration cards and the embedded workbench.",
    content: content.replace(/^---\n[\s\S]*?\n---\n/, ""),
  });
  const require = createRequire(import.meta.url);
  const runtime = path.join(
    path.dirname(require.resolve("tripo-studio-plugin/package.json")),
    "mcp",
    "bootstrap.mjs"
  );
  const broker = new TripoBroker({
    stateDir: path.join(stateRoot(), "deepseek-presentations"),
  });
  let client,
    transport,
    stopped = false,
    retry,
    attempts = 0;
  const registrations = [];
  const withdraw = () => {
    broker.disconnect();
    for (const dispose of registrations.splice(0)) dispose();
  };
  ctx.effect(() => () => {
    stopped = true;
    clearTimeout(retry);
    withdraw();
    return client?.close();
  });
  ctx.connection.fetch.register({
    path: ROUTE,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: (request) => broker.fetch(request),
  });
  async function start() {
    if (stopped) return;
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key, value]) =>
          typeof value === "string" &&
          !/KEY|PASSWORD|SECRET|TOKEN|^DSH_/i.test(key)
      )
    );
    env.TRIPO_HOST = "deepseek";
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [runtime],
      env,
      stderr: "pipe",
    });
    client = new Client(
      { name: "DeepSeek Harness / Tripo Studio", version: "0.1.0-preview.1" },
      { capabilities: {} }
    );
    transport.stderr?.resume();
    const thisClient = client;
    client.onclose = () => {
      if (stopped || thisClient !== client) return;
      withdraw();
      if (++attempts <= 5) {
        retry = setTimeout(
          () => start().catch(() => {}),
          Math.min(30000, 1000 * 2 ** attempts)
        );
        retry.unref?.();
      }
    };
    try {
      await client.connect(transport, { timeout: 180000 });
      if (stopped) return await client.close();
      await broker.connect(client);
      if (stopped) return await client.close();
      for (const tool of broker.tools.values()) {
        if (!(tool._meta?.ui?.visibility ?? ["model", "app"]).includes("model"))
          continue;
        registrations.push(
          ctx.tools.register(
            createMcpToolDefinition(ctx, {
              name: publicToolName(tool.name),
              rawName: tool.name,
              description: tool.description ?? "",
              inputSchema: tool.inputSchema,
              outputSchema: tool.outputSchema,
              taskRequired: tool.execution?.taskSupport === "required",
              call: (args, execution) =>
                broker.callModel(tool.name, args, {
                  sessionId:
                    execution.agent?.session?.id ?? execution.agent?.id,
                  callId: execution.callId,
                  signal: execution.signal,
                }),
            })
          )
        );
      }
      attempts = 0;
    } catch (error) {
      withdraw();
      await thisClient.close().catch(() => {});
      throw new Error(
        `Tripo runtime could not start. Use Node >=24.9 and reinstall the plugin's pinned runtime. ${error.message}`,
        { cause: error }
      );
    }
  }
  await start();
}
