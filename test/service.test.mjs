import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { Buffer } from "node:buffer";
import { SessionManager } from "../src/auth/session.mjs";
import { TaskStore } from "../src/store/tasks.mjs";
import { OperationService, RECONCILE_CONFIRMATION } from "../src/ops/service.mjs";
import { TripoError } from "../src/errors.mjs";

import { jwt, makeConfig, makeRuntime } from "./helpers/runtime.mjs";

describe("session", () => {
  it("persists and reloads a JWT session", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tripo-ses-"));
    const config = makeConfig(dir);
    const s1 = new SessionManager(config);
    await s1.set({ authorization: `Bearer ${jwt(Math.floor(Date.now() / 1000) + 3600)}` });
    const s2 = new SessionManager(config);
    const status = await s2.status();
    assert.equal(status.authenticated, true);
    assert.ok(status.expires_in_seconds > 3000);
    const s3 = new SessionManager(config);
    await s3.set({ authorization: `Bearer ${jwt(Math.floor(Date.now() / 1000) - 10)}` }).then(() => assert.fail("expired accepted")).catch((e) => assert.equal(e.code, "AUTH_EXPIRED"));
  });
  it("rejects non-jwt material", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tripo-ses-"));
    const s = new SessionManager(makeConfig(dir));
    await assert.rejects(() => s.set({ authorization: "Bearer not-a-jwt" }), /not a JWT|JWT/);
  });
});

describe("task lifecycle", () => {
  it("prepares, dedupes, submits and succeeds a postprocess task", async () => {
    const { service, gateway } = await makeRuntime();
    const prepared = await service.prepare("model.segment", { project_id: "proj-1", segmentation_granularity: "balanced" });
    assert.equal(prepared.task.status, "staged");
    assert.ok(prepared.confirmation.startsWith("SUBMIT_MODEL_SEGMENT:"));

    const dup = await service.prepare("model.segment", { project_id: "proj-1", segmentation_granularity: "balanced" });
    assert.equal(dup.deduplicated, true);
    assert.equal(dup.task.task_id, prepared.task.task_id);

    await assert.rejects(
      () => service.submit(prepared.task.task_id, { confirmation: "WRONG" }),
      /confirmation/
    );
    const submitted = await service.submit(prepared.task.task_id, { confirmation: prepared.confirmation });
    assert.equal(submitted.task.status, "queued");
    assert.deepEqual(submitted.remote, { operator_id: "op-1", project_id: "proj-1" });
    assert.ok(gateway.calls.some((c) => c[0] === "submitPostprocess" && c[1] === "ai_segmentation"));

    const synced = await service.sync(prepared.task.task_id);
    assert.equal(synced.task.status, "succeeded");
    assert.equal(synced.task.result.project_id, "proj-1");
  });

  it("auto-submits when submit=true", async () => {
    const { service } = await makeRuntime();
    const prepared = await service.prepare("texture.pbr", { project_id: "proj-1", submit: true });
    assert.equal(prepared.paid_request_sent, true);
    assert.equal(prepared.task.status, "queued");
  });

  it("marks ambiguous dispatch outcome_unknown and reconciles instead of resubmitting", async () => {
    const { service, gateway } = await makeRuntime();
    gateway.submitError = new TripoError("HTTP_ERROR", "connection reset", { retryable: true });
    const prepared = await service.prepare("model.segment", { project_id: "proj-1" });
    await assert.rejects(
      () => service.submit(prepared.task.task_id, { confirmation: prepared.confirmation }),
      (e) => e.code === "OUTCOME_UNKNOWN"
    );
    const after = await service.get(prepared.task.task_id);
    assert.equal(after.task.status, "outcome_unknown");
    // never auto-resubmits
    await assert.rejects(() => service.submit(prepared.task.task_id, { confirmation: prepared.confirmation }), /cannot be submitted/);
    // reconcile with remote ids
    const reconciled = await service.reconcile(prepared.task.task_id, {
      confirmation: RECONCILE_CONFIRMATION,
      remote: { operator_id: "op-1", project_id: "proj-1" }
    });
    assert.equal(reconciled.reconciled, true);
    assert.equal(reconciled.task.status, "succeeded");
  });

  it("records definitive rejections as failed without outcome_unknown", async () => {
    const { service, gateway } = await makeRuntime();
    gateway.submitError = new TripoError("INSUFFICIENT_CREDITS", "no credits", { safeToRetryPaidOperation: false });
    const prepared = await service.prepare("model.segment", { project_id: "proj-1" });
    await assert.rejects(
      () => service.submit(prepared.task.task_id, { confirmation: prepared.confirmation }),
      (e) => e.code === "INSUFFICIENT_CREDITS"
    );
    const after = await service.get(prepared.task.task_id);
    assert.equal(after.task.status, "failed");
    assert.equal(after.task.error.code, "INSUFFICIENT_CREDITS");
  });

  it("recovers dispatching tasks as outcome_unknown on restart", async () => {
    const { service, store } = await makeRuntime();
    const prepared = await service.prepare("model.segment", { project_id: "proj-1" });
    await store.update(prepared.task.task_id, (record) => {
      record.status = "dispatching";
      record.dispatch_state = "dispatching";
      return record;
    });
    const recovered = await service.recover();
    assert.equal(recovered, 1);
    const after = await service.get(prepared.task.task_id);
    assert.equal(after.task.status, "outcome_unknown");
  });

  it("cancels only staged tasks", async () => {
    const { service } = await makeRuntime();
    const prepared = await service.prepare("model.segment", { project_id: "proj-1" });
    const cancelled = await service.cancel(prepared.task.task_id);
    assert.equal(cancelled.task.status, "canceled");
    const submittedTask = await service.prepare("texture.pbr", { project_id: "proj-1", submit: true });
    await assert.rejects(() => service.cancel(submittedTask.task.task_id), /cannot be withdrawn|Only a staged/);
  });

  it("never exposes urls in public task results", async () => {
    const { service, gateway } = await makeRuntime();
    const prepared = await service.prepare("model.segment", { project_id: "proj-1", submit: true });
    const synced = await service.sync(prepared.task.task_id);
    const raw = JSON.stringify(synced.task);
    assert.equal(raw.includes("https://"), false, `public task leaked a URL: ${raw}`);
  });
});
