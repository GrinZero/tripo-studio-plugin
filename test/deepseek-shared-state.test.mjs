import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { solidImage } from "./helpers/image-fixture.mjs";
import { randomUUID } from "node:crypto";
import { TaskStore } from "../src/store/tasks.mjs";
import { FileLock } from "../src/store/lock.mjs";

it("Codex and DeepSeek stdio processes deduplicate a shared configuration and dispatch it once", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "tripo-shared-hosts-"));
  const clients = [];
  t.after(async () => {
    await Promise.all(clients.map((client) => client.close()));
    await rm(dir, { recursive: true, force: true });
  });
  for (const host of ["codex", "deepseek"]) {
    const client = new Client({ name: host, version: "1" });
    clients.push(client);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("../mcp/bootstrap.mjs", import.meta.url))],
      env: {
        ...process.env,
        TRIPO_HOST: host,
        TRIPO_PLUGIN_DATA_DIR: dir,
        TRIPO_ASSET_ROOT: path.join(dir, "assets"),
        TRIPO_OUTPUT_ROOTS: path.join(dir, "assets"),
      },
      stderr: "pipe",
    });
    transport.stderr?.resume();
    await client.connect(transport);
  }
  const call = async (client, name, input) => {
    const result = await client.callTool({ name, arguments: input });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return result.structuredContent;
  };
  const image = await solidImage({
    width: 16,
    height: 12,
    background: "#bb9966",
  });
  const imported = await call(clients[0], "tripo_ui_import_image", {
    name: "shared.png",
    data_base64: image.toString("base64"),
  });
  const input = {
    image_path: imported.file_path,
    left: 0,
    top: 0,
    width: 8,
    height: 6,
  };
  const prepared = await Promise.all(
    clients.map((client) => call(client, "tripo_crop_image", input))
  );
  const id = prepared[0].review.review_id;
  assert.equal(prepared[1].review.review_id, id);
  assert.equal(prepared[1].review.deadline_at, prepared[0].review.deadline_at);
  await Promise.all(
    clients.map((client) =>
      call(client, "tripo_ui_review", { review_id: id, action: "confirm" })
    )
  );
  const result = await call(clients[0], "tripo_get_configuration_review", {
    review_id: id,
  });
  assert.equal(result.review.status, "submitted");
  const done = await call(clients[0], "tripo_task_wait", {
    task_id: result.task.task_id,
    timeout_seconds: 10,
  });
  assert.equal(done.task.status, "succeeded");
  const task = JSON.parse(
    await readFile(
      path.join(dir, "tasks", `${result.task.task_id}.json`),
      "utf8"
    )
  );
  assert.equal(
    task.events.filter((event) => event.type === "dispatch.begin").length,
    1
  );
});

it("starting a second host leaves live dispatches alone and recovers an interrupted dispatch after its lock is released", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "tripo-host-recovery-"));
  const store = new TaskStore(dir);
  const taskId = randomUUID();
  await store.create({
    task_id: taskId,
    kind: "local.crop",
    account_fingerprint: "local",
    status: "dispatching",
    dispatch_state: "dispatching",
    events: [],
  });
  const lock = await new FileLock(path.join(dir, "locks")).acquire(
    `submit-${taskId}`
  );
  const clients = [];
  t.after(async () => {
    await lock.release();
    await Promise.all(clients.map((client) => client.close()));
    await rm(dir, { recursive: true, force: true });
  });
  const start = async () => {
    const client = new Client({ name: "second-host", version: "1" });
    clients.push(client);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("../mcp/bootstrap.mjs", import.meta.url))],
      env: {
        ...process.env,
        TRIPO_PLUGIN_DATA_DIR: dir,
        TRIPO_ASSET_ROOT: path.join(dir, "assets"),
        TRIPO_OUTPUT_ROOTS: path.join(dir, "assets"),
      },
      stderr: "pipe",
    });
    transport.stderr?.resume();
    await client.connect(transport);
    return client;
  };
  const live = await start();
  assert.equal((await store.get(taskId)).status, "dispatching");
  await live.close();
  await lock.release();
  await start();
  const recovered = await store.get(taskId);
  assert.equal(recovered.status, "failed");
  assert.equal(recovered.error.code, "LOCAL_INTERRUPTED");
  assert.equal(
    recovered.events.filter(
      (event) => event.type === "recovery.local_interrupted"
    ).length,
    1
  );
});
