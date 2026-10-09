import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { TripoError } from "../errors.mjs";
import { JsonDocument } from "./jsondoc.mjs";
import { FileLock } from "./lock.mjs";
import { isoNow } from "../util/misc.mjs";

const TASK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_STATUSES = new Set(["staged", "dispatching", "queued", "running", "waiting_for_auth"]);
export const TERMINAL_TASK_STATUSES = new Set(["succeeded", "failed", "canceled", "outcome_unknown", "expired"]);

// One durable JSON document per task plus a small index doc. All mutations go
// through a process-shared file lock so several stdio MCP processes can safely
// share the same data directory (no resident backend).
export class TaskStore {
  #dir;
  #index;
  #lock;
  constructor(dataDir) {
    this.#dir = path.join(dataDir, "tasks");
    this.#index = new JsonDocument(path.join(this.#dir, "index.json"));
    this.#lock = new FileLock(path.join(dataDir, "locks"));
  }

  #taskDoc(taskId) {
    if (!TASK_ID.test(taskId)) throw new TripoError("INVALID_INPUT", "task_id must be a plugin task identifier.", { stage: "task_store" });
    return new JsonDocument(path.join(this.#dir, `${taskId}.json`));
  }

  async #readIndex() {
    const index = await this.#index.read({ task_ids: [] });
    return Array.isArray(index.task_ids) ? index.task_ids.filter((id) => TASK_ID.test(id)) : [];
  }

  async get(taskId) {
    const record = await this.#taskDoc(taskId).read(undefined);
    if (!record) throw new TripoError("PLAN_NOT_FOUND", `Task ${taskId} does not exist.`, { stage: "task_store" });
    return record;
  }

  async find(taskId) {
    return await this.#taskDoc(taskId).read(undefined);
  }

  async create(record) {
    await mkdir(this.#dir, { recursive: true, mode: 0o700 });
    return await this.#lock.withLock("tasks", async () => {
      await this.#taskDoc(record.task_id).write(record);
      const ids = await this.#readIndex();
      await this.#index.write({ task_ids: [record.task_id, ...ids.filter((id) => id !== record.task_id)].slice(0, 5000) });
      return record;
    });
  }

  // Serialized read-modify-write under the shared lock.
  async update(taskId, mutator) {
    return await this.#lock.withLock("tasks", async () => {
      const doc = this.#taskDoc(taskId);
      const current = await doc.read(undefined);
      if (!current) throw new TripoError("PLAN_NOT_FOUND", `Task ${taskId} does not exist.`, { stage: "task_store" });
      const next = await mutator(current);
      next.revision = (current.revision ?? 0) + 1;
      next.updated_at = isoNow();
      await doc.write(next);
      return next;
    });
  }

  async list({ limit = 50, offset = 0, status, statuses, kind, accountFingerprint, character_group_id } = {}) {
    const ids = await this.#readIndex();
    const output = [];
    let skipped = 0;
    for (const id of ids) {
      if (output.length >= limit) break;
      const record = await this.#taskDoc(id).read(undefined).catch(() => undefined);
      if (!record) continue;
      if (status !== undefined && record.status !== status) continue;
      if (statuses?.length && !statuses.includes(record.status)) continue;
      if (kind !== undefined && record.kind !== kind) continue;
      if (character_group_id !== undefined && (record.character_group?.id ?? 'ungrouped') !== character_group_id) continue;
      if (accountFingerprint !== undefined && record.account_fingerprint !== accountFingerprint) continue;
      if (skipped++ < offset) continue;
      output.push(record);
    }
    return output;
  }

  async listActive() {
    const ids = await this.#readIndex();
    const output = [];
    for (const id of ids) {
      const record = await this.#taskDoc(id).read(undefined).catch(() => undefined);
      if (record && ACTIVE_STATUSES.has(record.status)) output.push(record);
    }
    return output;
  }

  async findFirst(predicate) {
    const ids = await this.#readIndex();
    for (const id of ids) {
      const record = await this.#taskDoc(id).read(undefined).catch(() => undefined);
      if (record && predicate(record)) return record;
    }
    return undefined;
  }

  // Idempotency: same request_hash + account on a non-terminal task reuses it.
  async findByRequestHash(requestHash, accountFingerprint) {
    return await this.findFirst(
      (record) => record.request_hash === requestHash && record.account_fingerprint === accountFingerprint && !TERMINAL_TASK_STATUSES.has(record.status)
    );
  }

  async listDispatching() {
    const ids = await this.#readIndex();
    const output = [];
    for (const id of ids) {
      const record = await this.#taskDoc(id).read(undefined).catch(() => undefined);
      if (record && (record.status === "dispatching" || record.dispatch_state === "dispatching")) output.push(record);
    }
    return output;
  }
}
