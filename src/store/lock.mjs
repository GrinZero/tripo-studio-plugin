import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { delay } from "../util/misc.mjs";

// Cross-process mutex built on atomic mkdir. A lock is a directory
// `locks/<name>.lock/` containing owner.json {pid, at, id}. Stale locks from
// dead processes are reclaimed after staleMs.
export class FileLock {
  #dir;
  constructor(locksDir) {
    this.#dir = locksDir;
  }

  async acquire(name, { timeoutMs = 30000, staleMs = 120000 } = {}) {
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(name)) throw new Error(`Invalid lock name: ${name}`);
    const lockPath = path.join(this.#dir, `${name}.lock`);
    const ownerPath = path.join(lockPath, "owner.json");
    const owner = { id: randomUUID(), pid: process.pid, at: new Date().toISOString() };
    const deadline = Date.now() + timeoutMs;
    await mkdir(this.#dir, { recursive: true });
    for (;;) {
      try {
        await mkdir(lockPath);
        await writeFile(ownerPath, `${JSON.stringify(owner)}\n`, { mode: 0o600 });
        return this.#handle(lockPath, ownerPath, owner.id);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (await this.#reclaimIfStale(lockPath, ownerPath, staleMs)) continue;
        if (Date.now() >= deadline) {
          const err = new Error(`Timed out acquiring lock ${name}.`);
          err.code = "LOCK_TIMEOUT";
          throw err;
        }
        await delay(80 + Math.floor(Math.random() * 70));
      }
    }
  }

  async #reclaimIfStale(lockPath, ownerPath, staleMs) {
    try {
      const owner = JSON.parse(await readFile(ownerPath, "utf8"));
      const info = await stat(lockPath);
      const ageMs = Date.now() - Math.max(info.mtimeMs, Date.parse(owner.at ?? "") || 0);
      const alive = typeof owner.pid === "number" && process.kill(owner.pid, 0) !== false;
      if (alive && ageMs < staleMs) return false;
      await rm(lockPath, { force: true, recursive: true });
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return true;
      if (error?.code === "ESRCH") {
        // Owner pid is dead.
        await rm(lockPath, { force: true, recursive: true }).catch(() => {});
        return true;
      }
      if (error?.code === "EPERM") return false; // owner alive, not ours
      // Corrupt/unreadable owner file: treat as stale after grace period.
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > staleMs) {
          await rm(lockPath, { force: true, recursive: true });
          return true;
        }
      } catch {}
      return false;
    }
  }

  #handle(lockPath, ownerPath, id) {
    let released = false;
    return {
      id,
      release: async () => {
        if (released) return;
        released = true;
        await rm(lockPath, { force: true, recursive: true }).catch(() => {});
      },
      [Symbol.asyncDispose]: async () => {
        if (!released) {
          released = true;
          await rm(lockPath, { force: true, recursive: true }).catch(() => {});
        }
      }
    };
  }

  async withLock(name, fn, options) {
    const lock = await this.acquire(name, options);
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }
}
