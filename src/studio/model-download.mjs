import path from "node:path";
import { downloadArtifact } from "./downloader.mjs";
import { copyLocalArtifact } from "./local-artifacts.mjs";
import { prepareGlbForBlender } from "../util/glb-decode.mjs";
import { TripoError } from "../errors.mjs";

// Keep the source download at path; expose a separate Blender-compatible copy.
export async function downloadResolvedArtifact(config, resolved, requestedPath, fetchImpl = fetch) {
  const download = resolved.localPath
    ? await copyLocalArtifact(config, resolved.localPath, requestedPath, resolved.defaultName)
    : await downloadArtifact(config, resolved.url, requestedPath, resolved.defaultName, fetchImpl);
  if (path.extname(resolved.defaultName).toLowerCase() === ".glb") {
    try { Object.assign(download, await prepareGlbForBlender(config, download.path)); }
    catch (error) {
      // A compatibility failure must not discard a successful source download.
      download.blender_error = { code: error instanceof TripoError ? error.code : "MODEL_DECODE_FAILED", message: error instanceof TripoError ? error.message : "Could not create the Blender-compatible copy." };
    }
  }
  return download;
}
