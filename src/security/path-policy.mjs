import path from "node:path";
import { realpath } from "node:fs/promises";
import { TripoError } from "../errors.mjs";

// Local-path inputs only: file:// and remote URL forms are rejected so a tool
// call cannot smuggle a URL fetch or a UNC/remote specifier into a paid op.
export function assertLocalPathSpecifier(value, stage = "path_policy") {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TripoError("INVALID_INPUT", "A local file path is required.", { stage });
  }
  const trimmed = value.trim();
  if (/^(https?|file|ftp|s3|gs|data):\/\//i.test(trimmed) || /^data:/i.test(trimmed)) {
    throw new TripoError("INVALID_INPUT", "Only plain local filesystem paths are accepted; URL and data specifiers are rejected.", { stage });
  }
  if (trimmed.includes("\0")) {
    throw new TripoError("INVALID_INPUT", "The path contains a NUL byte.", { stage });
  }
  return trimmed;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

// Downloads may only write beneath configured output roots. Resolves symlinks
// on the deepest existing ancestor before containment checking.
export async function resolveOutputPath(config, requestedPath, defaultName) {
  const target = requestedPath
    ? path.resolve(assertLocalPathSpecifier(requestedPath, "download_path"))
    : path.join(config.assetRoot, "downloads", defaultName);
  const roots = config.outputRoots.map((root) => path.resolve(root));
  const existing = await nearestExistingAncestor(target);
  if (!existing) {
    throw new TripoError("DOWNLOAD_REJECTED", "No existing ancestor directory was found for the download path.", { stage: "download_path" });
  }
  const canonicalAncestor = await realpath(existing.path);
  const canonicalTarget = path.join(canonicalAncestor, path.relative(existing.path, target));
  if (!roots.some((root) => isInside(root, canonicalTarget))) {
    throw new TripoError(
      "DOWNLOAD_REJECTED",
      `Download paths must stay under configured output roots (${roots.join(", ")}).`,
      { details: { requested: target }, stage: "download_path" }
    );
  }
  return canonicalTarget;
}

async function nearestExistingAncestor(target) {
  let current = target;
  for (let depth = 0; depth < 64; depth += 1) {
    try {
      const canonical = await realpath(current);
      return { path: canonical };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
  return null;
}

const DOWNLOAD_HOST_SUFFIXES = ["tripo3d.ai", "tripo3d.com", "amazonaws.com", "cloudfront.net"];

export function assertDownloadUrl(urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch (error) {
    throw new TripoError("DOWNLOAD_REJECTED", "The remote artifact URL is invalid.", { cause: error, stage: "download" });
  }
  if (url.protocol !== "https:") {
    throw new TripoError("DOWNLOAD_REJECTED", "Remote artifacts must be served over HTTPS.", { stage: "download" });
  }
  const host = url.hostname.toLowerCase();
  if (!DOWNLOAD_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    throw new TripoError("DOWNLOAD_REJECTED", `Remote artifact host ${host} is not in the allowlist.`, {
      details: { host },
      stage: "download"
    });
  }
  return url;
}
