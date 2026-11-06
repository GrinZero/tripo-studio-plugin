import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { solidImage } from "./helpers/image-fixture.mjs";

const [major, minor] = process.versions.node.split(".").map(Number);
it(
  "boots the real stdio runtime, bridges DSH results, cancels a local configuration and withdraws tools",
  { skip: major < 24 || (major === 24 && minor < 9) },
  async (t) => {
    const { apply } = await import("../packages/deepseek-adapter/src/host.mjs");
    const dir = await mkdtemp(path.join(tmpdir(), "tripo dsh host # "));
    const names = [
      "TRIPO_PLUGIN_DATA_DIR",
      "TRIPO_ASSET_ROOT",
      "TRIPO_OUTPUT_ROOTS",
    ];
    const previous = names.map((name) => process.env[name]);
    process.env.TRIPO_PLUGIN_DATA_DIR = path.join(dir, "data");
    process.env.TRIPO_ASSET_ROOT = path.join(dir, "assets");
    process.env.TRIPO_OUTPUT_ROOTS = path.join(dir, "assets");
    const tools = new Map(),
      effects = [],
      skills = [];
    let route;
    t.after(async () => {
      for (const dispose of effects.reverse()) await dispose?.();
      names.forEach((name, index) => {
        if (previous[index] === undefined) delete process.env[name];
        else process.env[name] = previous[index];
      });
      await rm(dir, { recursive: true, force: true });
    });
    const ctx = {
      get: () => undefined,
      effect: (factory) => {
        const dispose = factory();
        effects.push(dispose);
        return dispose;
      },
      skills: { register: (skill) => skills.push(skill) },
      tools: {
        register: (definition) => {
          tools.set(definition.name, definition);
          return () => tools.delete(definition.name);
        },
      },
      connection: {
        fetch: {
          register: (value) => {
            route = value;
          },
        },
      },
    };
    await apply(ctx);
    assert.equal(tools.size, 62);
    assert.equal(skills[0].name, "tripo-studio");
    assert.equal(tools.has("mcp__tripo-studio__tripo_ui_review"), false);
    assert.equal(route.path, "/api/tripo-studio");
    const invoke = (name, args, callId) =>
      tools.get(`mcp__tripo-studio__${name}`).execute(args, {
        agent: { session: { id: "session-1" } },
        callId,
        signal: new AbortController().signal,
      });
    const status = await invoke("tripo_auth_status", {}, "status-1");
    assert.equal(status.structuredContent.session.authenticated, false);
    await assert.rejects(
      invoke("tripo_generate_model", { prompt: "never sent" }, "blocked-1"),
      /UI_UNAVAILABLE/
    );
    const rpc = async (body) => {
      const response = await route.fetch(
        new Request("http://localhost/api/tripo-studio", {
          method: "POST",
          body: JSON.stringify(body),
        })
      );
      assert.equal(
        response.status,
        200,
        JSON.stringify(await response.clone().json())
      );
      return response.json();
    };
    const probe = await rpc({
      action: "attach",
      sessionId: "session-1",
      surface: "probe",
    });
    await rpc({ action: "ready", token: probe.token });
    const workbench = await rpc({
      action: "attach",
      sessionId: "session-1",
      surface: "workbench",
    });
    await rpc({ action: "ready", token: workbench.token });
    const image = await solidImage({
      width: 16,
      height: 12,
      background: "#bb8855",
    });
    const imported = await rpc({
      action: "callTool",
      token: workbench.token,
      name: "tripo_ui_import_image",
      arguments: { name: "test.png", data_base64: image.toString("base64") },
    });
    const input = {
      image_path: imported.structuredContent.file_path,
      left: 0,
      top: 0,
      width: 8,
      height: 6,
    };
    const created = await invoke("tripo_crop_image", input, "crop-1");
    assert.equal(created._meta, undefined);
    assert.equal(created.structuredContent.review.auto_submit, true);
    assert.ok(created.structuredContent.review.deadline_at > Date.now());
    const card = await rpc({
      action: "attach",
      sessionId: "session-1",
      callId: "crop-1",
    });
    assert.equal(card.result._meta.tripo.presentation, "card");
    await rpc({ action: "ready", token: card.token });
    const canceled = await rpc({
      action: "callTool",
      token: card.token,
      name: "tripo_ui_review",
      arguments: {
        review_id: created.structuredContent.review.review_id,
        action: "cancel",
      },
    });
    assert.equal(canceled.structuredContent.review.status, "canceled");
    const history = await rpc({
      action: "attach",
      sessionId: "session-1",
      callId: "crop-1",
    });
    assert.equal(
      history.result.structuredContent.review.review_id,
      created.structuredContent.review.review_id
    );
    for (const dispose of effects.splice(0).reverse()) await dispose?.();
    assert.equal(tools.size, 0);
  }
);
