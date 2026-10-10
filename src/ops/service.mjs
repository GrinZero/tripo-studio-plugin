import { z } from "zod";
import { TripoError, errorSnapshot, isDefinitiveRemoteRejection, toTripoError } from "../errors.mjs";
import { redactDeep } from "../redact.mjs";
import { hashObject, isoNow, uuid } from "../util/misc.mjs";
import { getOperation } from "./registry.mjs";
import { removeSnapshots, resolvePendingInputs, verifySnapshot } from "./images.mjs";
import path from 'node:path';
import { FileLock } from '../store/lock.mjs';
import { characterGroup, normalizedCharacter, resolveCharacterGroup, summarizeGroups, taskContextShape } from './task-groups.mjs';

const CONTRACT_VERSION = "tripo-studio-plugin-v1";
export const RECONCILE_CONFIRMATION = "ADOPT_REMOTE_IDS";

const TERMINAL = new Set(["succeeded", "failed", "canceled", "outcome_unknown", "expired"]);

function event(type, detail) {
  return { at: isoNow(), detail: detail ?? null, type };
}

// Signed/remote URLs never leave the plugin: every "url" becomes
// url_available=true. Downloads go through tripo_download which resolves the
// URL internally at fetch time.
export function stripUrls(value) {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return { url_available: true };
  if (Array.isArray(value)) return value.map(stripUrls);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if ((key === "url" || key.endsWith("_url")) && typeof entry === "string") {
        out[`${key}_available`] = entry.length > 0;
        continue;
      }
      out[key] = stripUrls(entry);
    }
    return out;
  }
  return value;
}

function publicTask(record) {
  const consumesCredits = record.consumes_credits ?? getOperation(record.kind).consumesCredits;
  const output = {
    account_fingerprint: record.account_fingerprint,
    created_at: record.created_at,
    dispatch_state: record.dispatch_state,
    expires_at: record.expires_at ?? null,
    kind: record.kind,
    consumes_credits: consumesCredits,
    cost_estimate: record.cost_estimate ?? null,
    paid_request_sent: record.dispatch_started_at !== undefined && consumesCredits,
    request_hash: record.request_hash,
    revision: record.revision ?? 0,
    status: record.status,
    task_id: record.task_id,
    updated_at: record.updated_at,
    character_group: record.character_group ?? null,
    ...(record.confirmation === undefined ? {} : { confirmation: record.confirmation }),
    ...(record.remote === null ? { remote: null } : { remote: stripUrls(record.remote ?? null) }),
    ...(record.progress === undefined ? {} : { progress: stripUrls(record.progress) }),
    ...(record.result === undefined ? {} : { result: stripUrls(record.result) }),
    ...(record.error === undefined ? {} : { error: record.error }),
    ...(record.warnings?.length ? { warnings: record.warnings } : {}),
    ...(record.parent_task_id ? { parent_task_id: record.parent_task_id } : {}),
    ...(record.workflow_id ? { workflow_id: record.workflow_id } : {}),
    metadata: redactDeep(record.metadata ?? {}),
    effective_settings: record.settings ?? null,
    snapshots: (record.snapshots ?? []).map((s) => ({
      format: s.format,
      height: s.height ?? null,
      label: s.label,
      sha256: s.sha256,
      size_bytes: s.size_bytes,
      slot: s.slot,
      source_name: s.source_name,
      width: s.width ?? null
    })),
    input_summary: redactDeep(record.input_summary ?? {}),
    downloads: record.downloads ?? []
  };
  return output;
}

// Unified durable lifecycle for every operation kind. prepare() freezes the
// input and builds the wire payload; submit() crosses the durable dispatch
// boundary exactly once; sync() reconciles remote progress; reconcile() lets
// the user adopt remote IDs after an ambiguous dispatch instead of paying
// for a duplicate submission.
export class OperationService {
  #ctx;
  #submissionLock;
  #inputPreparations = new Map();
  constructor(ctx) {
    this.#ctx = ctx; // {config, gateway, session, store, uploader}
    this.#submissionLock = new FileLock(path.join(ctx.config.dataDir, 'locks'));
  }

  // Recovery: anything still "dispatching" when the process died crossed the
  // paid boundary without a recorded outcome. It becomes outcome_unknown —
  // never an automatic resubmission.
  async recover() {
    const store = this.#ctx.store;
    let recovered = 0;
    for (const task of await store.listDispatching()) {
      await store
        .update(task.task_id, (record) => {
          if (record.dispatch_state === "dispatching" && !record.remote) {
            const local = getOperation(record.kind).category === "local";
            record.status = local ? "failed" : "outcome_unknown";
            record.dispatch_state = local ? "rejected" : "outcome_unknown";
            record.error = errorSnapshot(
              new TripoError(local ? "LOCAL_INTERRUPTED" : "OUTCOME_UNKNOWN", local ? "The local operation was interrupted. Its input snapshots remain intact; stage a new task to run again." : "The previous request crossed the durable dispatch boundary; reconcile it instead of resubmitting.", { stage: "task_recovery" })
            );
            record.events.push(event(local ? "recovery.local_interrupted" : "recovery.outcome_unknown"));
          }
          return record;
        })
        .catch(() => {});
      recovered += 1;
    }
    return recovered;
  }

  async prepare(kind, input, options = {}) {
    if (options.draftId) return this.#submissionLock.withLock(`submit-${options.draftId}`, () => this.#prepare(kind, input, options), { staleMs: 60 * 60 * 1000 });
    return this.#prepare(kind, input, options);
  }

  async #prepare(kind, input, options) {
    const operation = getOperation(kind);
    const validated = z.object({ ...operation.inputShape, ...taskContextShape }).strict().parse(input);
    const { character_name, parent_task_id, ...parsedInput } = validated;
    const accountFingerprint = operation.category === "local" ? "local" : await this.#ctx.session.accountFingerprint();
    const draft = options.draftId ? await this.#ctx.store.get(options.draftId) : null;
    if (draft && (draft.status !== 'staged' || draft.dispatch_started_at || draft.kind !== kind || draft.account_fingerprint !== accountFingerprint))
      throw new TripoError('PLAN_MISMATCH', 'Only the owned, unsubmitted draft can be revised.', { stage: 'operation_stage' });
    const grouping = await resolveCharacterGroup(this.#ctx.store, parsedInput, accountFingerprint, {name:character_name ?? options.characterName,parentTaskId:parent_task_id ?? options.parentTaskId});
    // Cheap dedupe before any uploads: same normalized input for the same
    // account + kind on a live task returns it untouched.
    const dedupeKey = hashObject({ account_fingerprint: accountFingerprint, input: stripSubmitFlag(parsedInput), kind });
    const duplicate = draft ? null : await this.#ctx.store.findFirst(
      (record) => record.dedupe_key === dedupeKey && record.account_fingerprint === accountFingerprint && !TERMINAL.has(record.status)
    );
    if (duplicate) {
      this.#checkDuplicateGroup(duplicate, grouping.group, character_name ?? options.characterName);
      return { deduplicated: true, paid_request_sent: duplicate.dispatch_started_at !== undefined && operation.consumesCredits, task: publicTask(duplicate) };
    }
    const taskId = draft?.task_id ?? uuid();
    const built = await operation.build({ ...this.#ctx, deferUploads: true }, parsedInput, taskId);
    const requestHash = hashObject({
      account_fingerprint: accountFingerprint,
      contract_version: CONTRACT_VERSION,
      consumes_credits: operation.consumesCredits,
      kind,
      payload: built.payload,
      snapshots: (built.snapshots ?? []).map((s) => ({ relative_path: s.relative_path, sha256: s.sha256, slot: s.slot }))
    });
    // Dedup: identical request already alive → return the existing task.
    const existing = draft ? null : await this.#ctx.store.findByRequestHash(requestHash, accountFingerprint);
    if (existing) {
      this.#checkDuplicateGroup(existing, grouping.group, character_name ?? options.characterName);
      return { deduplicated: true, paid_request_sent: existing.dispatch_started_at !== undefined && operation.consumesCredits, task: publicTask(existing) };
    }
    const now = isoNow();
    const record = {
      account_fingerprint: accountFingerprint,
      contract_version: CONTRACT_VERSION,
      created_at: draft?.created_at ?? now,
      dedupe_key: dedupeKey,
      dispatch_state: "none",
      downloads: [],
      events: draft ? [...draft.events, event('draft.settings_saved')] : [event("task.staged")],
      expires_at: new Date(Date.now() + this.#ctx.config.planTtlMs).toISOString(),
      input_summary: inputSummary(parsedInput),
      kind,
      metadata: built.metadata ?? {},
      parent_task_id: grouping.parentTaskId ?? draft?.parent_task_id ?? null,
      character_group: grouping.group ?? draft?.character_group ?? null,
      progress: null,
      remote: null,
      request_hash: requestHash,
      confirmation: `SUBMIT_${kind.replace(/\./g, "_").toUpperCase()}:${requestHash.slice(0, 12).toUpperCase()}`,
      result: undefined,
      revision: 0,
      schema_version: 1,
      consumes_credits: operation.consumesCredits,
      snapshots: built.snapshots ?? [],
      status: "staged",
      task_id: taskId,
      updated_at: now,
      warnings: [...(built.warnings ?? []),...(grouping.warning ? [grouping.warning] : [])],
      workflow_id: options.workflowId ?? draft?.workflow_id ?? null,
      payload: built.payload,
      settings: built.settings ?? null
    };
    if (this.#ctx.pricing) record.cost_estimate = await this.#ctx.pricing.quote(kind, {}, { task: record, offline: true });
    const created = draft ? await this.#ctx.store.update(taskId, current => {
      if (current.status !== 'staged' || current.dispatch_started_at) throw new TripoError('STAGING_REQUIRED', 'The draft was submitted while saving configuration.');
      return record;
    }) : await this.#ctx.store.create(record);
    const submitted = input.submit === true ? await this.submit(taskId, { confirmation: record.confirmation, requestHash }) : null;
    return {
      confirmation: record.confirmation,
      deduplicated: false,
      paid_request_sent: Boolean(submitted && operation.consumesCredits),
      request_hash: requestHash,
      task: publicTask(submitted?.task ?? created),
      ...(submitted ? { submitted: submitted } : {}),
      warnings: record.warnings
    };
  }

  #checkDuplicateGroup(task, group, explicitName) {
    if (explicitName !== undefined && task.character_group?.id !== group?.id) throw new TripoError('TASK_GROUP_CONFLICT','An identical live task already exists in another group. Use tripo_set_task_character to correct its local grouping; do not dispatch a duplicate.',{stage:'task_group',details:{task_id:task.task_id}});
  }

  async setCharacter(taskId, name) {
    const record = await this.#ctx.store.update(taskId, current => {
      current.character_group = name === null ? null : current.character_group && normalizedCharacter(current.character_group.name) === normalizedCharacter(name) ? {...current.character_group,assigned_by:'manual'} : characterGroup(name,current.account_fingerprint,'manual');
      current.events.push(event('task.character_changed',{character_group:current.character_group}));
      return current;
    });
    return {task:publicTask(record),paid_request_sent:false};
  }

  async listGroups(options = {}) {
    const records = await this.#ctx.store.list({...options,limit:5000,offset:0});
    return {groups:summarizeGroups(records),total:records.length};
  }

  async submit(taskId, input = {}) {
    // Serialize input uploads with dispatch and cancellation across MCP processes.
    return this.#submissionLock.withLock(`submit-${taskId}`, () => this.#submit(taskId, input), { staleMs: 60 * 60 * 1000 });
  }

  preupload(taskId) {
    if (this.#inputPreparations.has(taskId)) return this.#inputPreparations.get(taskId);
    const pending = (async () => {
      const task = await this.#ctx.store.get(taskId);
      if (task.status !== 'staged') return;
      const account = await this.#ctx.session.accountFingerprint();
      if (task.account_fingerprint !== account) throw new TripoError('PLAN_MISMATCH', 'The authenticated Studio account differs from the draft account.');
      await resolvePendingInputs(this.#ctx, task, { uploadOnly: true });
    })().finally(() => this.#inputPreparations.delete(taskId));
    this.#inputPreparations.set(taskId, pending);
    return pending;
  }

  async #submit(taskId, input) {
    const store = this.#ctx.store;
    const staged = await store.get(taskId);
    if (staged.status !== "staged") {
      throw new TripoError("STAGING_REQUIRED", `A task in ${staged.status} state cannot be submitted.`, { safeToRetryPaidOperation: false, stage: "task_dispatch" });
    }
    if (Date.now() >= Date.parse(staged.expires_at)) {
      await store.update(taskId, (record) => {
        record.status = "expired";
        record.events.push(event("task.expired"));
        return record;
      }).catch(() => {});
      throw new TripoError("PLAN_EXPIRED", "The staged task expired; prepare a new one.", { safeToRetryPaidOperation: true, stage: "task_dispatch" });
    }
    if (input.requestHash !== undefined && input.requestHash !== staged.request_hash) {
      throw new TripoError("PLAN_MISMATCH", "The supplied request_hash does not match this task.", { safeToRetryPaidOperation: false, stage: "task_dispatch" });
    }
    if (input.confirmation !== undefined && input.confirmation !== staged.confirmation) {
      throw new TripoError("PLAN_MISMATCH", `The confirmation must be exactly "${staged.confirmation}".`, { safeToRetryPaidOperation: false, stage: "task_dispatch" });
    }
    const accountFingerprint = getOperation(staged.kind).category === "local" ? "local" : await this.#ctx.session.accountFingerprint();
    if (accountFingerprint !== staged.account_fingerprint) {
      throw new TripoError("PLAN_MISMATCH", "The authenticated Studio account differs from the staged task account.", { safeToRetryPaidOperation: false, stage: "task_dispatch" });
    }
    // Re-verify every frozen snapshot immediately before the paid write.
    for (const snapshot of staged.snapshots ?? []) {
      await verifySnapshot(this.#ctx.config, taskId, snapshot);
    }
    const operation = getOperation(staged.kind);
    // Read-only stale-plan checks must finish before the durable write boundary.
    if (operation.beforeSubmit) await operation.beforeSubmit(this.#ctx, staged);
    if (staged.cost_estimate?.offline && this.#ctx.pricing) {
      const quote = await this.#ctx.pricing.quote(staged.kind, {}, { task: staged });
      await store.update(taskId, record => ({ ...record, cost_estimate: quote }));
      if (Number.isFinite(staged.cost_estimate.estimated_credits) && Number.isFinite(quote.estimated_credits) && quote.estimated_credits > staged.cost_estimate.estimated_credits)
        throw new TripoError('PRICE_CHANGED', 'The estimate increased; review the updated quote before submitting.', { stage: 'task_dispatch', safeToRetryPaidOperation: true });
    }
    // Upload/audit failure is still before the paid boundary: retain the draft.
    const payload = await resolvePendingInputs(this.#ctx, staged);
    // Uploading may take time; a different account or expired plan cannot dispatch.
    if (operation.category !== 'local' && await this.#ctx.session.accountFingerprint() !== staged.account_fingerprint)
      throw new TripoError('PLAN_MISMATCH', 'The authenticated Studio account changed while preparing inputs.', { stage: 'task_dispatch' });
    if (Date.now() >= Date.parse(staged.expires_at))
      throw new TripoError('PLAN_EXPIRED', 'The staged task expired while preparing inputs.', { stage: 'task_dispatch' });
    // Durable dispatch boundary: persist "dispatching" BEFORE the remote call.
    await store.update(taskId, (record) => {
      if (record.status !== "staged") throw new TripoError("STAGING_REQUIRED", "The task state changed before dispatch.", { stage: "task_dispatch" });
      record.status = "dispatching";
      record.dispatch_state = "dispatching";
      record.dispatch_started_at = isoNow();
      record.dispatch_payload = payload;
      record.events.push(event("dispatch.begin"));
      return record;
    });
    let remote;
    try {
      remote = await operation.submitRemote(this.#ctx, { ...staged, payload });
    } catch (error) {
      const normalized = toTripoError(error, "task_dispatch");
      if (operation.category === "local" || isDefinitiveRemoteRejection(normalized)) {
        const rejected = await store
          .update(taskId, (record) => {
            record.status = "failed";
            record.dispatch_state = "rejected";
            record.error = errorSnapshot(normalized);
            record.events.push(event("dispatch.rejected", { code: normalized.code }));
            return record;
          })
          .catch(() => undefined);
        throw Object.assign(normalized, { task: rejected ? publicTask(rejected) : undefined });
      }
      const unknown = await store
        .update(taskId, (record) => {
          record.status = "outcome_unknown";
          record.dispatch_state = "outcome_unknown";
          record.error = errorSnapshot(
            new TripoError("OUTCOME_UNKNOWN", "The Studio write may have reached Tripo, but no valid receipt was durably obtained. Do not resubmit; reconcile via tripo_task_reconcile.", { stage: "task_dispatch" })
          );
          record.events.push(event("dispatch.outcome_unknown", { code: normalized.code }));
          return record;
        })
        .catch(() => undefined);
      const outcomeError = new TripoError("OUTCOME_UNKNOWN", "The Studio write may have reached Tripo, but no valid receipt was durably obtained. Do not resubmit; reconcile via tripo_task_reconcile.", {
        cause: error,
        details: { task_id: taskId },
        safeToRetryPaidOperation: false,
        stage: "task_dispatch"
      });
      if (unknown) outcomeError.task = publicTask(unknown);
      throw outcomeError;
    }
    const submitted = await store
      .update(taskId, (record) => {
        if (record.dispatch_state !== "dispatching") return record;
        record.dispatch_state = "submitted";
        record.remote = remote;
        record.status = "queued";
        record.events.push(event("dispatch.submitted", stripUrls(redactDeep(remote))));
        return record;
      })
      .catch((error) => {
        throw new TripoError("OUTCOME_UNKNOWN", "Tripo returned remote IDs but they could not be saved durably. Keep the returned IDs and never resubmit.", {
          cause: error,
          details: { remote: redactDeep(remote) },
          stage: "task_receipt"
        });
      });
    return { paid_request_sent: operation.consumesCredits, remote: stripUrls(redactDeep(remote)), task: publicTask(submitted) };
  }

  async sync(taskId) {
    const store = this.#ctx.store;
    const record = await store.get(taskId);
    if (!record.remote) {
      return { task: publicTask(record) };
    }
    if (TERMINAL.has(record.status)) {
      return { task: publicTask(record) };
    }
    const operation = getOperation(record.kind);
    let remote;
    try {
      remote = await operation.syncRemote(this.#ctx, record);
    } catch (error) {
      const normalized = toTripoError(error, "task_progress");
      if (normalized.code === "AUTH_EXPIRED" || normalized.code === "AUTH_REQUIRED") {
        const waiting = await store.update(taskId, (current) => {
          if (!TERMINAL.has(current.status)) {
            current.status = "waiting_for_auth";
            current.events.push(event("task.waiting_for_auth"));
          }
          return current;
        }).catch(() => record);
        return { task: publicTask(waiting) };
      }
      return { progress_error: errorSnapshot(normalized), task: publicTask(record) };
    }
    const updated = await store.update(taskId, (current) => {
      if (TERMINAL.has(current.status)) return current;
      current.progress = remote.progress ?? current.progress;
      if (remote.result !== undefined) current.result = remote.result;
      const status = remote.status;
      if (status && status !== current.status) {
        current.status = status;
        current.events.push(event(`remote.${status}`, remote.progress ?? null));
      }
      if (status === "failed" && current.error === undefined) {
        current.error = errorSnapshot(new TripoError("REMOTE_FAILED", "The Studio task failed remotely.", { stage: "task_progress" }));
      }
      return current;
    });
    return { task: publicTask(updated) };
  }

  async wait(taskId, timeoutSeconds = 300, pollSeconds = 5) {
    const deadline = Date.now() + timeoutSeconds * 1000;
    let last;
    while (Date.now() < deadline) {
      last = await this.sync(taskId);
      const status = last.task.status;
      if (["succeeded", "failed", "canceled", "expired", "banned", "outcome_unknown"].includes(status)) {
        return { completed: true, ...last };
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollSeconds * 1000, Math.max(0, deadline - Date.now()))));
    }
    return { completed: false, ...(last ?? { task: publicTask(await this.#ctx.store.get(taskId)) }) };
  }

  async cancel(taskId) {
    return this.#submissionLock.withLock(`submit-${taskId}`, () => this.#cancel(taskId), { staleMs: 60 * 60 * 1000 });
  }

  async #cancel(taskId) {
    const store = this.#ctx.store;
    const record = await store.get(taskId);
    if (record.dispatch_started_at !== undefined || !["staged", "dispatching"].includes(record.status)) {
      throw new TripoError("PLAN_NOT_RETRYABLE", `Only a staged (not-yet-submitted) task can be canceled. This task is ${record.status}; already-submitted remote work cannot be withdrawn through Studio.`, {
        safeToRetryPaidOperation: false,
        stage: "task_cancel"
      });
    }
    const cancelled = await store.update(taskId, (current) => {
      current.status = "canceled";
      current.dispatch_state = "rejected";
      current.events.push(event("task.canceled"));
      return current;
    });
    if ((cancelled.snapshots ?? []).length > 0) await removeSnapshots(this.#ctx.config, taskId).catch(() => {});
    return { task: publicTask(cancelled) };
  }

  // Adopt confirmed remote IDs into an outcome_unknown task. Requires the
  // exact ADOPT_REMOTE_IDS confirmation plus matching account + project.
  async reconcile(taskId, input) {
    if (input.confirmation !== RECONCILE_CONFIRMATION) {
      throw new TripoError("PLAN_MISMATCH", `Use the exact ${RECONCILE_CONFIRMATION} confirmation.`, { stage: "task_reconcile" });
    }
    const store = this.#ctx.store;
    const current = await store.get(taskId);
    if (current.status !== "outcome_unknown") {
      throw new TripoError("PLAN_NOT_RETRYABLE", "Only an outcome_unknown task can adopt remote IDs.", { stage: "task_reconcile" });
    }
    const accountFingerprint = await this.#ctx.session.accountFingerprint();
    if (current.account_fingerprint !== accountFingerprint) {
      throw new TripoError("PLAN_MISMATCH", "The active Tripo account does not match this task.", { stage: "task_reconcile" });
    }
    const remote = input.remote;
    if (!remote || typeof remote !== "object" || (!remote.operator_id && !remote.asset_id && !remote.operator_ids && !remote.motion_task_id)) {
      throw new TripoError("INVALID_INPUT", "remote must include operator_id, operator_ids, or asset_id observed in Studio.", { stage: "task_reconcile" });
    }
    // Verify the claimed remote evidence before adopting it.
    if (current.kind === "motion.generate") {
      if (!remote.motion_task_id) throw new TripoError("INVALID_INPUT", "Motion reconciliation requires motion_task_id.");
      const task = await this.#ctx.gateway.getMotionTask(remote.motion_task_id);
      if (task.task_id !== remote.motion_task_id) throw new TripoError("INSUFFICIENT_EVIDENCE", "Motion task identity mismatch.");
    } else if (remote.asset_id) {
      const asset = await this.#ctx.gateway.getStudioImageAsset(remote.asset_id);
      if (asset.asset_id !== remote.asset_id) {
        throw new TripoError("INSUFFICIENT_EVIDENCE", "The supplied asset_id does not identify a Studio image asset.", { stage: "task_reconcile" });
      }
    } else {
      const ids = remote.operator_ids ?? [remote.operator_id];
      const items = await this.#ctx.gateway.getProgress(ids);
      for (const id of ids) {
        selectForReconcile(items, id);
      }
      if (remote.project_id) {
        const project = await this.#ctx.gateway.getProject(remote.project_id, ids[0]);
        if (project.id && project.id !== remote.project_id) {
          throw new TripoError("INSUFFICIENT_EVIDENCE", "The supplied project and operator IDs do not identify the same remote operation.", { stage: "task_reconcile" });
        }
      }
    }
    await store.update(taskId, (current) => {
      current.dispatch_state = "submitted";
      current.remote = remote;
      current.status = "queued";
      delete current.error;
      current.events.push(event("task.reconciled", redactDeep(remote)));
      return current;
    });
    const synced = await this.sync(taskId);
    return { ...synced, reconciled: true };
  }

  async get(taskId) {
    const record = await this.#ctx.store.get(taskId);
    return { events: stripUrls(record.events ?? []), task: publicTask(record) };
  }

  async list(options = {}) {
    const limit = options.limit ?? 50, offset = options.offset ?? 0;
    const records = await this.#ctx.store.list({ ...options, limit: limit + 1 });
    return { tasks: records.slice(0, limit).map(publicTask), offset, next_offset: records.length > limit ? offset + limit : null };
  }
}

function stripSubmitFlag(input) {
  const { submit, ...rest } = input ?? {};
  return rest;
}

function selectForReconcile(items, operatorId) {
  const exact = items.find((entry) => entry.operator_id === operatorId || entry.id === operatorId);
  if (exact) return exact;
  if (items.length === 1 && items[0]?.operator_id === undefined && items[0]?.id === undefined) return items[0];
  throw new TripoError("INSUFFICIENT_EVIDENCE", "Tripo progress did not include the supplied operator ID.", { stage: "task_reconcile" });
}

// A bounded, secret-free summary of the caller's input for the task record.
function inputSummary(input) {
  const summary = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value === undefined || key === "submit") continue;
    if (typeof value === "string" && value.length > 300) {
      summary[key] = `${value.slice(0, 300)}…`;
    } else if (Array.isArray(value) && value.length > 12) {
      summary[key] = `${value.length} items`;
    } else {
      summary[key] = value;
    }
  }
  return summary;
}
