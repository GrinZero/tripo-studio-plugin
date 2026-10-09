import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { COPYFILE_EXCL } from "node:constants";
import { chmod, copyFile, mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import { TripoError } from "../errors.mjs";
import { assertLocalPathSpecifier } from "../security/path-policy.mjs";
import { inspectImage } from "../util/image.mjs";

const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function snapshotDirectory(config, taskId) {
  if (!PLAN_ID.test(taskId)) {
    throw new TripoError("CONFIGURATION_ERROR", "The task identifier for input snapshots is invalid.", { stage: "operation_stage" });
  }
  return path.join(config.dataDir, "task-inputs", taskId);
}

async function syncSnapshot(filePath, directory) {
  const handle = await open(filePath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (process.platform !== "win32") {
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  }
}

export async function removeSnapshots(config, taskId) {
  await rm(snapshotDirectory(config, taskId), { force: true, recursive: true });
}

// Re-inspects a retained snapshot against its durable provenance. Called again
// immediately before the paid dispatch so a mutated file can never be sent.
export async function verifySnapshot(config, taskId, provenance) {
  const directory = snapshotDirectory(config, taskId);
  const snapshotPath = path.join(directory, path.basename(provenance.relative_path));
  const relativeToDirectory = path.relative(directory, snapshotPath);
  if (relativeToDirectory === "" || relativeToDirectory.startsWith("..") || path.isAbsolute(relativeToDirectory)) {
    throw new TripoError("FILE_INVALID", "A task input snapshot escaped its private directory.", {
      safeToRetryPaidOperation: false,
      stage: "operation_provenance"
    });
  }
  let snapshot;
  try {
    if (["glb", "obj", "fbx", "stl"].includes(provenance.format)) {
      const bytes = await readFile(snapshotPath);
      snapshot = { path: snapshotPath, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, format: path.extname(snapshotPath).slice(1) };
    } else snapshot = await inspectImage(snapshotPath);
  } catch (error) {
    throw new TripoError("FILE_CHANGED", "A retained task input snapshot is unavailable or invalid.", {
      cause: error,
      safeToRetryPaidOperation: false,
      stage: "operation_provenance"
    });
  }
  if (
    snapshot.sha256 !== provenance.sha256 ||
    snapshot.size !== provenance.size_bytes ||
    snapshot.format !== provenance.format ||
    snapshot.width !== provenance.width ||
    snapshot.height !== provenance.height
  ) {
    throw new TripoError("FILE_CHANGED", "A retained task input snapshot no longer matches its durable provenance.", {
      safeToRetryPaidOperation: false,
      stage: "operation_provenance"
    });
  }
  return snapshot.path;
}

// Freeze a local image into the private task-input directory, upload it to
// Tripo temporary storage, then (optionally) run the Studio image audit.
export async function stageLocalImage(config, gateway, uploader, inputPath, audit, retain) {
  assertLocalPathSpecifier(inputPath, "operation_input_policy");
  const source = await inspectImage(inputPath);
  const canonicalSourceFormat = source.format === "jpg" ? "jpeg" : source.format;
  if (retain.requiredFormat !== undefined && canonicalSourceFormat !== retain.requiredFormat) {
    throw new TripoError("FILE_INVALID", `This input must be a ${retain.requiredFormat} image.`, {
      details: { actual_format: canonicalSourceFormat, required_format: retain.requiredFormat },
      safeToRetryPaidOperation: true,
      stage: "operation_stage"
    });
  }
  if (!Number.isSafeInteger(retain.index) || retain.index < 1 || retain.index > 200) {
    throw new TripoError("CONFIGURATION_ERROR", "The task input snapshot index is invalid.", { stage: "operation_stage" });
  }
  const directory = snapshotDirectory(config, retain.taskId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const snapshotName = `input-${retain.index}.${canonicalSourceFormat}`;
  const snapshotPath = path.join(directory, snapshotName);
  let completed = false;
  try {
    await copyFile(source.path, snapshotPath, COPYFILE_EXCL);
    if (process.platform !== "win32") await chmod(snapshotPath, 0o400);
    await syncSnapshot(snapshotPath, directory);
    const snapshot = await inspectImage(snapshotPath);
    if (snapshot.sha256 !== source.sha256 || snapshot.size !== source.size || snapshot.format !== canonicalSourceFormat || snapshot.width !== source.width || snapshot.height !== source.height) {
      throw new TripoError("FILE_CHANGED", "The source image changed while it was being snapshotted.", {
        safeToRetryPaidOperation: true,
        stage: "operation_stage"
      });
    }
    const token = retain.upload === false ? null : await gateway.requestTemporaryToken(snapshot.format);
    const uploaded = token ? await uploader.upload(snapshot.path, token) : undefined;
    const unchanged = await inspectImage(snapshot.path);
    if (unchanged.sha256 !== snapshot.sha256 || unchanged.size !== snapshot.size) {
      throw new TripoError("FILE_CHANGED", "The immutable image snapshot changed during upload.", {
        safeToRetryPaidOperation: true,
        stage: "operation_stage"
      });
    }
    const auditResult = audit ? await gateway.auditImage(uploaded) : undefined;
    if (auditResult && !["pass", "sensitive"].includes(auditResult.result)) {
      throw new TripoError("CONTENT_AUDIT_REJECTED", `Tripo image audit returned ${auditResult.result}; the operation was not submitted.`, {
        safeToRetryPaidOperation: true,
        stage: "audit"
      });
    }
    completed = true;
    return {
      ...(auditResult === undefined ? {} : { audit: auditResult }),
      metadata: {
        format: snapshot.format,
        height: snapshot.height,
        sha256: snapshot.sha256,
        size_bytes: snapshot.size,
        source_name: path.basename(source.path),
        width: snapshot.width
      },
      provenance: {
        format: snapshot.format,
        height: snapshot.height,
        label: retain.label,
        relative_path: `task-inputs/${retain.taskId}/${snapshotName}`,
        sha256: snapshot.sha256,
        size_bytes: snapshot.size,
        slot: retain.slot,
        source_name: path.basename(source.path),
        width: snapshot.width
      },
      uploaded
    };
  } finally {
    if (!completed) await rm(snapshotPath, { force: true }).catch(() => {});
  }
}

// Same freeze for non-image binary inputs (model import). No audit.
export async function stageLocalModelFile(config, inputPath, retain) {
  assertLocalPathSpecifier(inputPath, "import_input_policy");
  const { realpath, stat, readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const resolved = path.resolve(inputPath);
  const canonical = await realpath(resolved).catch((error) => {
    throw new TripoError("FILE_INVALID", `Model file does not exist: ${resolved}`, { cause: error, stage: "prepare" });
  });
  const metadata = await stat(canonical);
  if (!metadata.isFile()) throw new TripoError("FILE_INVALID", "Model path must point to a regular file.", { stage: "prepare" });
  const directory = snapshotDirectory(config, retain.taskId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const extension = path.extname(canonical).toLowerCase();
  const snapshotName = `input-${retain.index}${extension}`;
  const snapshotPath = path.join(directory, snapshotName);
  await copyFile(canonical, snapshotPath, COPYFILE_EXCL);
  if (process.platform !== "win32") await chmod(snapshotPath, 0o400);
  const bytes = await readFile(snapshotPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    metadata: {
      format: extension.slice(1),
      sha256,
      size_bytes: metadata.size,
      source_name: path.basename(canonical)
    },
    path: snapshotPath,
    provenance: {
      format: extension.slice(1),
      label: retain.label,
      relative_path: `task-inputs/${retain.taskId}/${snapshotName}`,
      sha256,
      size_bytes: metadata.size,
      slot: retain.slot,
      source_name: path.basename(canonical)
    }
  };
}

export function auditedImageWire(image) {
  if (!image.audit) throw new TripoError("STAGING_REQUIRED", "An audited image is required for this operation.", { stage: "operation_stage" });
  return {
    bucket: image.uploaded.bucket,
    image_audit_result: image.audit.result,
    image_source: "upload",
    key: image.uploaded.key
  };
}

export function directImageWire(image) {
  return { bucket: image.uploaded.bucket, key: image.uploaded.key };
}
