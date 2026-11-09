import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  TripoBroker,
  CARD_URI,
  modelResult,
  publicToolName,
} from "../packages/deepseek-adapter/src/broker.mjs";

const tool = (
  name,
  { audiences = ["model", "app"], configuration = false, card = false } = {}
) => ({
  name,
  inputSchema: { type: "object", properties: {} },
  _meta: {
    ui: { visibility: audiences, ...(card ? { resourceUri: CARD_URI } : {}) },
    tripo: { requires_configuration_ui: configuration },
  },
});

async function fixture(t) {
  const stateDir = await mkdtemp(path.join(tmpdir(), "tripo-deepseek-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let time = 1000;
  const calls = [];
  const workbenchUri = "ui://tripo-studio/workbench-v0.3.14-test.html";
  const client = {
    listTools: async () => ({
      tools: [
        tool("tripo_generate_model", { configuration: true, card: true }),
        tool("tripo_auth_status"),
        tool("tripo_auth_import", { audiences: ["model"] }),
        tool("tripo_ui_review", { audiences: ["app"] }),
        tool("tripo_submit_task", { audiences: ["app"] }),
        tool("tripo_task_cancel"),
        tool("tripo_run_workflow", { audiences: ["app"] }),
      ],
    }),
    listResources: async () => ({
      resources: [CARD_URI, workbenchUri].map((uri) => ({ uri })),
    }),
    readResource: async ({ uri }) => ({
      contents: [{ uri, text: "<html><head></head></html>" }],
    }),
    callTool: async ({ name, arguments: input }, _schema, options) => {
      calls.push({ name, input, options });
      return {
        content: [
          { type: "text", text: "Waiting for the existing configuration." },
        ],
        structuredContent: {
          review: {
            review_id: "review-1",
            status: "pending",
            deadline_at: time + 60000,
          },
          task: { draft_id: "task-1" },
          next_action: { tool: "tripo_get_configuration_review" },
        },
        _meta: { tripo: { presentation: "card", preview: "UI-only bytes" } },
      };
    },
  };
  const broker = new TripoBroker({ stateDir, now: () => time });
  await broker.connect(client);
  const ready = async (sessionId = "session-1", surface = "probe") => {
    const view = await broker.attach({ sessionId, surface });
    await broker.rpc({ action: "ready", token: view.token });
    return view;
  };
  return {
    broker,
    client,
    calls,
    ready,
    advance: (ms) => {
      time += ms;
    },
    stateDir,
    workbenchUri,
  };
}

it("requires an initialized UI in the exact session before creating a countdown", async (t) => {
  const f = await fixture(t);
  const invoke = (sessionId) =>
    f.broker.callModel(
      "tripo_generate_model",
      {},
      { sessionId, callId: "call-1" }
    );
  await assert.rejects(invoke("session-1"), { code: "UI_UNAVAILABLE" });
  assert.equal(f.calls.length, 0);
  const uninitialized = await f.broker.attach({
    sessionId: "session-1",
    surface: "probe",
  });
  await assert.rejects(invoke("session-1"), { code: "UI_UNAVAILABLE" });
  await f.broker.rpc({ action: "ready", token: uninitialized.token });
  await assert.rejects(invoke("session-2"), { code: "UI_UNAVAILABLE" });
  const result = await invoke("session-1");
  assert.equal(result.structuredContent.review.deadline_at, 61000);
  assert.equal(result._meta, undefined);
  assert.equal(f.calls.length, 1);
});

it("keeps read-only tools usable without a UI and filters model/app-only tools", async (t) => {
  const f = await fixture(t);
  await f.broker.callModel(
    "tripo_auth_status",
    {},
    { sessionId: "session-1", callId: "status-1" }
  );
  await assert.rejects(
    f.broker.callModel(
      "tripo_submit_task",
      {},
      { sessionId: "session-1", callId: "submit-1" }
    ),
    { code: "ACCESS_DENIED" }
  );
  const app = await f.ready("session-1", "workbench");
  await assert.rejects(
    f.broker.rpc({
      action: "callTool",
      token: app.token,
      name: "tripo_auth_import",
      arguments: {},
    }),
    { code: "ACCESS_DENIED" }
  );
  assert.equal(f.calls.length, 1);
});

it("expires readiness without changing existing deadlines or submitting anything", async (t) => {
  const f = await fixture(t);
  await f.ready();
  await f.broker.callModel(
    "tripo_generate_model",
    {},
    { sessionId: "session-1", callId: "call-1" }
  );
  f.advance(90001);
  await assert.rejects(
    f.broker.callModel(
      "tripo_generate_model",
      {},
      { sessionId: "session-1", callId: "call-2" }
    ),
    { code: "UI_UNAVAILABLE" }
  );
  assert.equal(
    (await f.broker.presentation("session-1", "call-1")).result
      .structuredContent.review.deadline_at,
    61000
  );
  assert.equal(f.calls.length, 1);
});

it("reopens persisted historical cards without recreating or resubmitting tasks", async (t) => {
  const f = await fixture(t);
  await f.ready();
  await f.broker.callModel(
    "tripo_generate_model",
    { prompt: "arch" },
    { sessionId: "session-1", callId: "call-1" }
  );
  const restarted = new TripoBroker({ stateDir: f.stateDir });
  await restarted.connect(f.client);
  const card = await restarted.attach({
    sessionId: "session-1",
    callId: "call-1",
  });
  assert.equal(card.result._meta.tripo.preview, "UI-only bytes");
  assert.equal(card.input.prompt, "arch");
  assert.equal(f.calls.length, 1);
  await assert.rejects(
    restarted.attach({ sessionId: "session-2", callId: "call-1" }),
    { code: "PRESENTATION_NOT_FOUND" }
  );
});

it("binds card mutations and resource reads to their original presentation", async (t) => {
  const f = await fixture(t);
  await f.ready();
  await f.broker.callModel(
    "tripo_generate_model",
    {},
    { sessionId: "session-1", callId: "call-1" }
  );
  const card = await f.broker.attach({
    sessionId: "session-1",
    callId: "call-1",
  });
  await f.broker.rpc({ action: "ready", token: card.token });
  const invoke = (name, input) =>
    f.broker.rpc({
      action: "callTool",
      token: card.token,
      name,
      arguments: input,
    });
  await assert.rejects(
    invoke("tripo_ui_review", { review_id: "other", action: "cancel" }),
    { code: "ACCESS_DENIED" }
  );
  await assert.rejects(invoke("tripo_task_cancel", { task_id: "other" }), {
    code: "ACCESS_DENIED",
  });
  await assert.rejects(invoke("tripo_submit_task", { task_id: "other" }), {
    code: "ACCESS_DENIED",
  });
  await assert.rejects(invoke("tripo_run_workflow", {}), {
    code: "ACCESS_DENIED",
  });
  await assert.rejects(
    f.broker.rpc({
      action: "readResource",
      token: card.token,
      uri: f.workbenchUri,
    }),
    { code: "ACCESS_DENIED" }
  );
  await invoke("tripo_ui_review", { review_id: "review-1", action: "cancel" });
  assert.equal(f.calls.length, 2);
});

it("the preflight probe cannot call tools and disconnected views lose authorization", async (t) => {
  const f = await fixture(t);
  const probe = await f.ready();
  await assert.rejects(
    f.broker.rpc({
      action: "callTool",
      token: probe.token,
      name: "tripo_generate_model",
    }),
    { code: "UI_UNAVAILABLE" }
  );
  f.broker.disconnect();
  assert.equal(f.broker.ready("session-1"), false);
  await assert.rejects(
    f.broker.rpc({ action: "heartbeat", token: probe.token }),
    { code: "VIEW_EXPIRED" }
  );
  assert.equal(f.calls.length, 0);
});

it("forwards cancellation and preserves upstream tool errors", async (t) => {
  const f = await fixture(t);
  const abort = new AbortController();
  f.client.callTool = async (_input, _schema, options) => {
    assert.equal(options.signal, abort.signal);
    return {
      isError: true,
      content: [{ type: "text", text: "Login required" }],
      _meta: { private: true },
    };
  };
  const result = await f.broker.callModel(
    "tripo_auth_status",
    {},
    { sessionId: "session-1", callId: "status-1", signal: abort.signal }
  );
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "Login required");
  assert.equal(result._meta, undefined);
});

it("rejects traversal, malformed RPC and unknown view tokens", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.broker.attach({ sessionId: "../other", surface: "probe" }),
    { code: "INVALID_INPUT" }
  );
  const response = await f.broker.fetch(
    new Request("http://localhost/api/tripo-studio", {
      method: "POST",
      body: "[]",
    })
  );
  assert.equal(response.status, 400);
  await assert.rejects(
    f.broker.rpc({ action: "heartbeat", token: "unknown" }),
    { code: "VIEW_EXPIRED" }
  );
});

it("keeps stable bounded DSH names and strips only UI metadata from MCP results", () => {
  assert.equal(
    publicToolName("tripo_generate_model"),
    "mcp__tripo-studio__tripo_generate_model"
  );
  assert.equal(publicToolName("x".repeat(100)).length, 64);
  assert.notEqual(publicToolName("a.b"), publicToolName("a b"));
  assert.deepEqual(
    modelResult({
      content: [],
      structuredContent: { next_action: "wait" },
      _meta: { secret: true },
    }),
    { content: [], structuredContent: { next_action: "wait" } }
  );
});

it("replays an existing call after reconnect without a new UI lease and rejects changed arguments", async (t) => {
  const f = await fixture(t);
  await f.ready();
  const identity = { sessionId: "session-1", callId: "call-1" };
  await f.broker.callModel(
    "tripo_generate_model",
    { prompt: "arch" },
    identity
  );
  f.broker.disconnect();
  await f.broker.connect(f.client);
  const result = await f.broker.callModel(
    "tripo_generate_model",
    { prompt: "arch" },
    identity
  );
  assert.equal(result._meta, undefined);
  assert.equal(f.calls.length, 1);
  await assert.rejects(
    f.broker.callModel(
      "tripo_generate_model",
      { prompt: "different" },
      identity
    ),
    { code: "CALL_MISMATCH" }
  );
});
