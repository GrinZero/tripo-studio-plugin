import { createHash, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { COPYFILE_EXCL } from "node:constants";
import { chmod, copyFile, mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import { TripoError } from "../errors.mjs";
import { assertLocalPathSpecifier } from "../security/path-policy.mjs";
import { inspectImage } from "../util/image.mjs";
import { JsonDocument } from '../store/jsondoc.mjs';
import { FileLock } from '../store/lock.mjs';
import { hashObject } from '../util/misc.mjs';

const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_INPUT_BUCKET = 'tripo-plugin-local-input';

// An internal reference to a frozen local input; card mounting can pre-upload it.
export function pendingInputWire(provenance) {
  return { bucket: LOCAL_INPUT_BUCKET, key: provenance.relative_path };
}

async function cachedUpload(ctx, task, snapshot) {
  const key = hashObject({ account: task.account_fingerprint, sha256: snapshot.sha256, format: snapshot.format });
  const directory = path.join(ctx.config.dataDir, 'input-uploads');
  const doc = new JsonDocument(path.join(directory, `${key}.json`));
  const lock = new FileLock(path.join(ctx.config.dataDir, 'locks'));
  // A separate content lock coalesces background uploads, saves and confirmation,
  // including requests from other MCP processes using the same account.
  return lock.withLock(`input-${key.slice(0, 56)}`, async () => {
    const assertAccount = async () => {
      if (await ctx.session.accountFingerprint() !== task.account_fingerprint)
        throw new TripoError('PLAN_MISMATCH', 'The authenticated account changed while uploading inputs.', { stage: 'operation_stage' });
    };
    await assertAccount();
    let cached = await doc.read();
    if (!cached || Date.parse(cached.expires_at) <= Date.now()) {
      const source = await verifySnapshot(ctx.config, task.task_id, snapshot);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const file = path.join(directory, `${key}.${snapshot.format}`);
      try {
        // The cache owns its upload file, so canceling/replacing a draft cannot
        // delete an in-flight upload's input.
        await copyFile(source, file);
        const verify = async () => {
          const bytes = await readFile(file);
          if (bytes.length !== snapshot.size_bytes || createHash('sha256').update(bytes).digest('hex') !== snapshot.sha256)
            throw new TripoError('FILE_CHANGED', 'The cached upload input changed.', { stage: 'operation_provenance' });
        };
        await verify();
        const token = await ctx.gateway.requestTemporaryToken(snapshot.format);
        const uploaded = await ctx.uploader.upload(file, token);
        await verify();
        await assertAccount();
        cached = { uploaded, expires_at: new Date(Date.now() + ctx.config.planTtlMs).toISOString() };
        await doc.write(cached);
      } finally { await rm(file, { force: true }).catch(() => {}); }
    }
    if (snapshot.audit_required && !cached.audit) {
      cached.audit = await ctx.gateway.auditImage(cached.uploaded);
      await assertAccount();
      await doc.write(cached);
    }
    return cached;
  }, { timeoutMs: 30 * 60 * 1000, staleMs: 60 * 60 * 1000 });
}

export async function resolvePendingInputs(ctx, task, { uploadOnly = false } = {}) {
  const resolved = new Map();
  for (const snapshot of task.snapshots ?? []) {
    if (!snapshot.pending_upload) continue;
    const { uploaded, audit } = await cachedUpload(ctx, task, snapshot);
    if (audit && (!['pass', 'sensitive'].includes(audit.result) ||
      (audit.result === 'sensitive' && task.kind === 'image.generate' && !task.metadata.allow_sensitive))) {
      throw new TripoError('CONTENT_AUDIT_REJECTED', 'The reference image did not pass the Studio audit.', { stage: 'audit', safeToRetryPaidOperation: true });
    }
    resolved.set(snapshot.relative_path, { ...uploaded, ...(audit ? { image_audit_result: audit.result } : {}) });
  }
  if (uploadOnly) return;
  const replace = value => {
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') {
      if (value.bucket === LOCAL_INPUT_BUCKET) {
        const uploaded = resolved.get(value.key);
        if (!uploaded) throw new TripoError('STAGING_REQUIRED', 'A deferred input has no verified snapshot.', { stage: 'operation_stage' });
        return { ...value, ...uploaded };
      }
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replace(entry)]));
    }
    return value;
  };
  const payload = replace(task.payload);
  if (task.metadata.pending_symmetry) {
    const reference = Array.isArray(payload.body.image) ? payload.body.image.find(Boolean) : payload.body.image;
    if (reference) payload.body.symmetry = await ctx.gateway.checkSymmetry(reference);
  }
  return payload;
}

export function snapshotDirectory(config, taskId) {
  if (!PLAN_ID.test(taskId)) {
    throw new TripoError("CONFIGURATION_ERROR", "The task identifier for input snapshots is invalid.", { stage: "operation_stage" });
  }
  return path.join(config.dataDir, "task-inputs", taskId);
}

async function syncSnapshot(filePath, directory) {
  // Windows requires a writable handle for FlushFileBuffers (fsync).
  // POSIX snapshots have already been made read-only before this call.
  const handle = await open(filePath, process.platform === "win32" ? "r+" : "r");
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
  const snapshotName = `input-${retain.index}-${randomUUID()}.${canonicalSourceFormat}`;
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
    const deferred = retain.upload !== false && retain.deferUpload === true;
    const token = retain.upload === false || deferred ? null : await gateway.requestTemporaryToken(snapshot.format);
    const uploaded = deferred ? pendingInputWire({ relative_path: `task-inputs/${retain.taskId}/${snapshotName}` }) : token ? await uploader.upload(snapshot.path, token) : undefined;
    const unchanged = await inspectImage(snapshot.path);
    if (unchanged.sha256 !== snapshot.sha256 || unchanged.size !== snapshot.size) {
      throw new TripoError("FILE_CHANGED", "The immutable image snapshot changed during upload.", {
        safeToRetryPaidOperation: true,
        stage: "operation_stage"
      });
    }
    const auditResult = audit ? deferred ? { result: 'pass', deferred: true } : await gateway.auditImage(uploaded) : undefined;
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
        ...(deferred ? { pending_upload: true, audit_required: audit } : {}),
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
  const snapshotName = `input-${retain.index}-${randomUUID()}${extension}`;
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
