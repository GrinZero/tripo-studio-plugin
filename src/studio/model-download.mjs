import path from "node:path";
import { downloadArtifact } from "./downloader.mjs";
import { copyLocalArtifact } from "./local-artifacts.mjs";
import { prepareGlbForBlender } from "../util/glb-decode.mjs";
import { TripoError } from "../errors.mjs";
import { open, rename } from "node:fs/promises";
import { binaryModelFormat, nativeModelName } from "../util/model-format.mjs";

// Keep the source download at path; expose a separate Blender-compatible copy.
export async function downloadResolvedArtifact(
  config,
  resolved,
  requestedPath,
  fetchImpl = fetch
) {
  const defaultName = nativeModelName(resolved.defaultName, resolved.url);
  const download = resolved.localPath
    ? await copyLocalArtifact(
        config,
        resolved.localPath,
        requestedPath,
        defaultName
      )
    : await downloadArtifact(
        config,
        resolved.url,
        requestedPath,
        defaultName,
        fetchImpl
      );
  if (/\.(glb|fbx)$/i.test(defaultName)) {
    const file = await open(download.path, "r");
    let format;
    try {
      const header = Buffer.alloc(27);
      const { bytesRead } = await file.read(header, 0, header.length, 0);
      format = binaryModelFormat(header.subarray(0, bytesRead));
    } finally {
      await file.close();
    }
    if (format) download.format = format;
    if (
      format === "fbx" &&
      !resolved.localPath &&
      !requestedPath &&
      /\.glb$/i.test(download.path)
    ) {
      const target = download.path.replace(/\.glb$/i, ".fbx");
      await rename(download.path, target);
      download.path = target;
    }
  }
  if (
    download.format !== "fbx" &&
    path.extname(defaultName).toLowerCase() === ".glb"
  ) {
    try {
      Object.assign(
        download,
        await prepareGlbForBlender(config, download.path)
      );
    } catch (error) {
      // A compatibility failure must not discard a successful source download.
      download.blender_error = {
        code: error instanceof TripoError ? error.code : "MODEL_DECODE_FAILED",
        message:
          error instanceof TripoError
            ? error.message
            : "Could not create the Blender-compatible copy.",
      };
    }
  }
  return download;
}
