import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { TripoError } from "../errors.mjs";
import { assertDownloadUrl, resolveOutputPath } from "../security/path-policy.mjs";

const MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024 * 1024;

// Downloads a remote artifact to a configured output root. The URL must be
// HTTPS on the Studio/S3/CDN allowlist; the result records bytes + host only
// (never the signed URL, which can embed credentials).
export async function downloadArtifact(config, urlValue, requestedPath, defaultName, fetchImpl = fetch) {
  const url = assertDownloadUrl(urlValue);
  const target = await resolveOutputPath(config, requestedPath, defaultName);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  try {
    const response = await fetchImpl(url, { redirect: "follow", signal: controller.signal });
    if (!response.ok || !response.body) {
      throw new TripoError("DOWNLOAD_FAILED", `The remote artifact returned HTTP ${response.status}.`, {
        details: { http_status: response.status },
        retryable: true,
        stage: "download"
      });
    }
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_DOWNLOAD_BYTES) {
      await response.body.cancel().catch(() => {});
      throw new TripoError("DOWNLOAD_FAILED", "The remote artifact exceeds the 4 GiB download limit.", { stage: "download" });
    }
    await mkdir(path.dirname(target), { recursive: true });
    let bytes = 0;
    const counting = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > MAX_DOWNLOAD_BYTES) {
          callback(new TripoError("DOWNLOAD_FAILED", "The remote artifact exceeds the 4 GiB download limit.", { stage: "download" }));
          return;
        }
        callback(null, chunk);
      }
    });
    await pipeline(Readable.fromWeb(response.body), counting, createWriteStream(target));
    const written = await stat(target);
    return {
      bytes: written.size,
      host: url.hostname,
      path: target
    };
  } catch (error) {
    if (error instanceof TripoError) throw error;
    throw new TripoError("DOWNLOAD_FAILED", "The remote artifact download failed.", { cause: error, retryable: true, stage: "download" });
  } finally {
    clearTimeout(timeout);
  }
}
