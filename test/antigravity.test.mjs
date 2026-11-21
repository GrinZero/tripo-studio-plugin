import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  installHostExtensions,
  updateModelContext,
} from "../ui/host-capabilities.mjs";
import { solidImage } from "./helpers/image-fixture.mjs";

it("queues AGY preview bursts to four calls and releases capacity after errors", async () => {
  let active = 0,
    peak = 0;
  const app = {
    async callServerTool({ index }, options) {
      assert.equal(options.timeout, 123);
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (index === 2) throw Error("preview failed");
      return index;
    },
  };
  installHostExtensions(app, "antigravity");
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, (_, index) =>
      app.callServerTool({ index }, { timeout: 123 })
    )
  );
  assert.equal(peak, 4);
  assert.equal(active, 0);
  assert.equal(results[2].status, "rejected");
  assert.deepEqual(
    results.filter((r) => r.status === "fulfilled").map((r) => r.value),
    [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  );
});

it("keeps global views functional without a conversation context capability", async () => {
  const seen = [];
  const app = {
    getHostCapabilities: () => ({ serverTools: {} }),
    updateModelContext: async (params) => seen.push(params),
  };
  await updateModelContext(app, { content: [] });
  assert.deepEqual(seen, []);
  app.getHostCapabilities = () => ({ updateModelContext: {} });
  await updateModelContext(app, { content: [] });
  assert.deepEqual(seen, [{ content: [] }]);
});

it("starts the AGY configuration, serves both UI entrypoints and persists canceled local cards across restart", async (t) => {
  const root = path.resolve(import.meta.dirname, "..");
  const config = JSON.parse(
    await readFile(path.join(root, "mcp_config.json"), "utf8")
  ).mcpServers["tripo-studio"];
  const dir = await mkdtemp(path.join(tmpdir(), "tripo-agy-integration-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const connect = async (ui = true) => {
    const client = new Client(
      { name: "antigravity-test", version: "1.5.8" },
      {
        capabilities: ui
          ? {
              extensions: {
                "io.modelcontextprotocol/ui": {
                  mimeTypes: ["text/html;profile=mcp-app"],
                },
              },
            }
          : {},
      }
    );
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args.map((arg) => arg.replaceAll("${PLUGIN_ROOT}", root)),
      cwd: config.cwd.replaceAll("${PLUGIN_ROOT}", root),
      env: {
        ...process.env,
        ...config.env,
        TRIPO_PLUGIN_DATA_DIR: dir,
        TRIPO_ASSET_ROOT: path.join(dir, "assets"),
      },
      stderr: "pipe",
    });
    await client.connect(transport);
    return client;
  };
  let client = await connect(false);
  t.after(() => client.close());
  const noUiTools = (await client.listTools()).tools;
  assert.equal(noUiTools.length, 62);
  assert.ok(
    noUiTools.every((tool) => tool._meta.ui.visibility.includes("model"))
  );
  const hidden = await client.callTool({
    name: "tripo_ui_review",
    arguments: {
      review_id: "00000000-0000-4000-8000-000000000001",
      action: "get",
    },
  });
  assert.equal(hidden.structuredContent.error.code, "UI_UNAVAILABLE");
  const unavailable = await client.callTool({
    name: "tripo_crop_image",
    arguments: {
      image_path: path.join(dir, "not-created.png"),
      left: 0,
      top: 0,
      width: 8,
      height: 6,
    },
  });
  assert.equal(unavailable.structuredContent.error.code, "UI_UNAVAILABLE");
  const unavailableWorkbench = await client.callTool({
    name: "tripo_open_workbench",
    arguments: {},
  });
  assert.equal(
    unavailableWorkbench.structuredContent.error.code,
    "UI_UNAVAILABLE"
  );
  const catalog = await client.callTool({
    name: "tripo_list_operations",
    arguments: {},
  });
  assert.notEqual(catalog.isError, true);
  const quote = await client.callTool({
    name: "tripo_quote_operation",
    arguments: {
      kind: "local.crop",
      input: { left: 0, top: 0, width: 8, height: 6 },
    },
  });
  assert.notEqual(quote.isError, true);
  const tasks = await client.callTool({
    name: "tripo_list_tasks",
    arguments: {},
  });
  assert.deepEqual(tasks.structuredContent.tasks, []);
  await client.close();
  client = await connect();
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 68);
  assert.equal(
    tools.filter((tool) => tool._meta.ui.visibility.includes("model")).length,
    62
  );
  for (const name of [
    "tripo_ui_review",
    "tripo_submit_task",
    "tripo_run_workflow",
  ])
    assert.deepEqual(
      tools.find((tool) => tool.name === name)._meta.ui.visibility,
      ["app"]
    );
  const workbench = tools.find((tool) => tool.name === "tripo_open_workbench");
  assert.deepEqual(workbench._meta["com.google.antigravity/ui"].entrypoints, [
    { type: "aux_pane", title: "Tripo Studio" },
    { type: "global", title: "Tripo Studio" },
  ]);
  assert.deepEqual(workbench._meta["openai/ui"].entrypoints, [
    { type: "global" },
    { type: "thread" },
  ]);
  const opened = await client.callTool({ name: workbench.name, arguments: {} });
  assert.equal(opened.isError, undefined);
  assert.equal(opened.structuredContent.view, "assets");
  for (const uri of [
    workbench._meta.ui.resourceUri,
    "ui://tripo-studio/result-card-v2.html",
  ]) {
    const html = (await client.readResource({ uri })).contents[0];
    assert.equal(html.mimeType, "text/html;profile=mcp-app");
    assert.ok(html.text.includes('window.__TRIPO_HOST__="antigravity";'));
    assert.ok(Buffer.byteLength(html.text) < 10 * 1024 * 1024);
  }
  const image = await solidImage({
    width: 16,
    height: 12,
    background: "#cc7755",
  });
  const imported = await client.callTool({
    name: "tripo_ui_import_image",
    arguments: {
      name: "agy-fixture.png",
      data_base64: image.toString("base64"),
    },
  });
  const crop = await client.callTool({
    name: "tripo_crop_image",
    arguments: {
      image_path: imported.structuredContent.file_path,
      left: 0,
      top: 0,
      width: 8,
      height: 6,
    },
  });
  assert.notEqual(crop.isError, true);
  const reviewId = crop.structuredContent.review.review_id;
  const canceled = await client.callTool({
    name: "tripo_ui_review",
    arguments: { review_id: reviewId, action: "cancel" },
  });
  assert.equal(canceled.structuredContent.review.status, "canceled");
  await client.close();
  client = await connect();
  const reopened = await client.callTool({
    name: "tripo_get_configuration_review",
    arguments: { review_id: reviewId },
  });
  assert.equal(reopened.structuredContent.review.review_id, reviewId);
  assert.equal(reopened.structuredContent.review.status, "canceled");
});
