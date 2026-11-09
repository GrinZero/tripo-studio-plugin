import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

export const SERVER_NAME = "tripo-studio";
export const CARD_URI = "ui://tripo-studio/result-card-v2.html";
export const ROUTE = "/api/tripo-studio";
const LEASE_MS = 90000;
const identifier = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_.:-]{1,200}$/.test(value);
const visible = (tool, audience) =>
  (tool?._meta?.ui?.visibility ?? ["model", "app"]).includes(audience);

function problem(code, message) {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

export function publicToolName(rawName) {
  const joined = `mcp__${SERVER_NAME}__${rawName}`;
  if (/^[A-Za-z0-9_-]{1,64}$/.test(joined)) return joined;
  const hash = createHash("sha256")
    .update(`${SERVER_NAME}\0${rawName}`)
    .digest("hex")
    .slice(0, 12);
  return `${joined.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 51)}_${hash}`;
}

// Keep MCP UI metadata out of model history, including nested inline previews.
// Public task/settings data is already redacted by the shared Tripo runtime.
export function modelResult(result) {
  const { _meta, ...canonical } = result;
  return canonical;
}

export class TripoBroker {
  constructor({ stateDir, now = Date.now }) {
    this.stateDir = stateDir;
    this.now = now;
    this.views = new Map();
    this.presentations = new Map();
    this.tools = new Map();
    this.resources = new Set();
  }

  async connect(client) {
    const [tools, resources] = await Promise.all([
      client.listTools(),
      client.listResources(),
    ]);
    this.client = client;
    this.views.clear();
    this.tools = new Map(tools.tools.map((tool) => [tool.name, tool]));
    if (
      !this.tools.get("tripo_generate_model")?._meta?.tripo
        ?.requires_configuration_ui
    )
      throw problem(
        "RUNTIME_INCOMPATIBLE",
        "Install the pinned Tripo runtime with UI capability metadata."
      );
    this.resources = new Set(
      resources.resources.map((resource) => resource.uri)
    );
    this.workbenchUri = [...this.resources].find((uri) =>
      /^ui:\/\/tripo-studio\/workbench-.*\.html$/.test(uri)
    );
    if (!this.workbenchUri || !this.resources.has(CARD_URI))
      throw problem(
        "RUNTIME_INCOMPATIBLE",
        "Tripo MCP Apps resources are missing."
      );
  }

  disconnect() {
    this.client = undefined;
    this.views.clear();
  }

  key(sessionId, callId) {
    if (!identifier(sessionId) || !identifier(callId))
      throw problem(
        "INVALID_INPUT",
        "A valid session and call identity are required."
      );
    return `${sessionId}/${callId}`;
  }

  file(key) {
    return path.join(
      this.stateDir,
      `${createHash("sha256").update(key).digest("hex")}.json`
    );
  }

  async save(presentation) {
    const key = this.key(presentation.sessionId, presentation.callId);
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    const temporary = `${this.file(key)}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(presentation), { mode: 0o600 });
    await rename(temporary, this.file(key));
    this.presentations.set(key, presentation);
    if (this.presentations.size > 500)
      this.presentations.delete(this.presentations.keys().next().value);
  }

  async presentation(sessionId, callId) {
    const key = this.key(sessionId, callId);
    if (this.presentations.has(key)) return this.presentations.get(key);
    try {
      const record = JSON.parse(await readFile(this.file(key), "utf8"));
      if (record.sessionId !== sessionId || record.callId !== callId)
        throw problem("ACCESS_DENIED", "Presentation identity mismatch.");
      return record;
    } catch (error) {
      if (error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  ready(sessionId) {
    for (const [token, view] of this.views) {
      if (view.expires <= this.now()) this.views.delete(token);
      else if (view.sessionId === sessionId && view.ready) return true;
    }
    return false;
  }

  async attach({ sessionId, callId, surface = "card" }) {
    this.key(sessionId, callId ?? "workbench");
    if (!["card", "workbench", "probe"].includes(surface))
      throw problem("INVALID_INPUT", "Unknown UI surface.");
    if (!this.client)
      throw problem("RUNTIME_UNAVAILABLE", "Reconnect the Tripo plugin.");
    const presentation = callId
      ? await this.presentation(sessionId, callId)
      : undefined;
    if (surface === "card" && !presentation)
      throw problem(
        "PRESENTATION_NOT_FOUND",
        "The call has no saved UI result."
      );
    const token = randomUUID();
    const view = {
      sessionId,
      surface,
      ready: false,
      expires: this.now() + LEASE_MS,
      reviewIds: new Set(),
      taskIds: new Set(),
      uri: surface === "workbench" ? this.workbenchUri : CARD_URI,
    };
    this.grant(view, presentation?.result);
    this.views.set(token, view);
    return {
      token,
      uri: view.uri,
      input: presentation?.input ?? {},
      result: presentation?.result,
      tools: [...this.tools.values()].filter((tool) => visible(tool, "model")),
    };
  }

  view(token) {
    const view = this.views.get(token);
    if (!view || view.expires <= this.now()) {
      this.views.delete(token);
      throw problem("VIEW_EXPIRED", "Reconnect this Tripo view.");
    }
    return view;
  }

  grant(view, result) {
    const data = result?.structuredContent;
    if (data?.review?.review_id) view.reviewIds.add(data.review.review_id);
    for (const id of [data?.task?.task_id, data?.task?.draft_id])
      if (id) view.taskIds.add(id);
  }

  async call(name, args, { signal } = {}) {
    if (!this.client)
      throw problem("RUNTIME_UNAVAILABLE", "Reconnect the Tripo plugin.");
    return this.client.callTool({ name, arguments: args }, undefined, {
      signal,
      timeout: 3700000,
    });
  }

  async callModel(name, input, { sessionId, callId, signal }) {
    this.key(sessionId, callId);
    const tool = this.tools.get(name);
    if (!tool || !visible(tool, "model"))
      throw problem("ACCESS_DENIED", "This tool is not exposed to the model.");
    const previous = await this.presentation(sessionId, callId);
    if (previous) {
      if (previous.name !== name || !isDeepStrictEqual(previous.input, input))
        throw problem(
          "CALL_MISMATCH",
          "This call identity already belongs to another request."
        );
      return modelResult(previous.result);
    }
    if (tool._meta?.tripo?.requires_configuration_ui && !this.ready(sessionId))
      throw problem(
        "UI_UNAVAILABLE",
        "Open this session in DeepSeek with the Tripo UI enabled. No countdown or task was created."
      );
    const result = await this.call(name, input, { signal });
    if (tool._meta?.ui?.resourceUri)
      await this.save({ sessionId, callId, name, input, result });
    return modelResult(result);
  }

  async rpc(body, signal) {
    if (body.action === "attach") return this.attach(body);
    if (body.action === "catalog")
      return {
        tools: [...this.tools.values()].filter((tool) =>
          visible(tool, "model")
        ),
      };
    const view = this.view(body.token);
    if (body.action === "detach") {
      this.views.delete(body.token);
      return {};
    }
    if (body.action === "ready" || body.action === "heartbeat") {
      if (body.action === "ready") view.ready = true;
      view.expires = this.now() + LEASE_MS;
      return {};
    }
    if (body.action === "readResource") {
      if (body.uri !== view.uri)
        throw problem("ACCESS_DENIED", "Resource is outside this view.");
      return this.client.readResource(
        { uri: body.uri },
        { signal, timeout: 180000 }
      );
    }
    if (body.action === "listResources")
      return {
        resources: [...this.resources].map((uri) => ({ uri, name: uri })),
      };
    if (body.action !== "callTool")
      throw problem("INVALID_INPUT", "Unknown UI action.");
    if (view.surface === "probe" || !view.ready)
      throw problem("UI_UNAVAILABLE", "The view has not initialized.");
    const tool = this.tools.get(body.name);
    if (!tool || !visible(tool, "app"))
      throw problem("ACCESS_DENIED", "This tool is not exposed to apps.");
    const input = body.arguments ?? {};
    if (view.surface === "card") {
      if (input.task_id && !view.taskIds.has(input.task_id))
        throw problem("ACCESS_DENIED", "Task is outside this card.");
      if (input.review_id && !view.reviewIds.has(input.review_id))
        throw problem("ACCESS_DENIED", "Review is outside this card.");
      if (body.name === "tripo_run_workflow")
        throw problem("ACCESS_DENIED", "Workflows belong to the workbench.");
      if (
        body.name === "tripo_ui_review" &&
        !view.reviewIds.has(input.review_id)
      )
        throw problem("ACCESS_DENIED", "Review is outside this card.");
      if (body.name === "tripo_submit_task" && !view.taskIds.has(input.task_id))
        throw problem("ACCESS_DENIED", "Task is outside this card.");
      if (tool._meta?.tripo?.requires_configuration_ui)
        throw problem(
          "ACCESS_DENIED",
          "New configurations belong to the workbench."
        );
    }
    const result = await this.call(body.name, input, { signal });
    this.grant(view, result);
    return result;
  }

  async fetch(request) {
    try {
      const body = await request.json();
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw problem("INVALID_INPUT", "Expected an action object.");
      return Response.json(await this.rpc(body, request.signal), {
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      return Response.json(
        {
          error: { code: error.code ?? "TRIPO_ERROR", message: error.message },
        },
        { status: error.code === "ACCESS_DENIED" ? 403 : 400 }
      );
    }
  }
}
