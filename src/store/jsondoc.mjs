import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TripoError } from "../errors.mjs";

// Atomic durable JSON document: write to a unique temp file, fsync, rename,
// fsync the directory. In-process mutations are serialized per document;
// callers that span processes must wrap mutations in a FileLock themselves.
export class JsonDocument {
  #file;
  #mutation = Promise.resolve();
  constructor(file) {
    this.#file = path.resolve(file);
  }

  get file() {
    return this.#file;
  }

  async read(fallback) {
    let text;
    try {
      text = await readFile(this.#file, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return typeof fallback === "function" ? fallback() : fallback;
      throw new TripoError("PERSISTENCE_ERROR", `Could not read ${path.basename(this.#file)}.`, { cause: error });
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new TripoError("PERSISTENCE_ERROR", `${path.basename(this.#file)} is not valid JSON.`, { cause: error });
    }
  }

  async write(value) {
    await mkdir(path.dirname(this.#file), { recursive: true });
    const temporary = path.join(path.dirname(this.#file), `.${path.basename(this.#file)}.${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, this.#file);
      if (process.platform !== "win32") {
        const directory = await open(path.dirname(this.#file), "r");
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
      }
    } catch (error) {
      throw new TripoError("PERSISTENCE_ERROR", `Could not durably update ${path.basename(this.#file)}.`, { cause: error });
    } finally {
      await handle?.close().catch(() => {});
      await unlink(temporary).catch(() => {});
    }
  }

  async update(mutator, fallback) {
    const previous = this.#mutation;
    let release;
    this.#mutation = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const current = await this.read(fallback);
      const next = await mutator(current);
      await this.write(next);
      return next;
    } finally {
      release();
    }
  }

  async remove() {
    await unlink(this.#file).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
