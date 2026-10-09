import path from "node:path";
import { constants } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { resolveOutputPath } from "../security/path-policy.mjs";
import { TripoError } from "../errors.mjs";

export function localArtifact(record, artifact, index = 0) {
  const result = record.result ?? {};
  const file = artifact === "texture" ? result.textures?.[index]?.image_path
    : artifact === "render" ? result.render_image_path
    : artifact === "image" ? result.image_path
    : result.model_path ?? result.image_path ?? result.render_image_path;
  if (!file) throw new TripoError("INSUFFICIENT_EVIDENCE", "The local task has no file for the selected artifact.", { stage: "download" });
  return file;
}

export async function copyLocalArtifact(config, sourcePath, requestedPath, defaultName) {
  const source = await resolveOutputPath(config, sourcePath, defaultName);
  const target = await resolveOutputPath(config, requestedPath, defaultName);
  const info = await stat(source);
  if (!info.isFile()) throw new TripoError("DOWNLOAD_REJECTED", "Local artifact is not a regular file.", { stage: "download" });
  if (source !== target) {
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target, constants.COPYFILE_EXCL);
  }
  return { bytes: info.size, host: "local", path: target, name: path.basename(target) };
}
