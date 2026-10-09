import { mkdir, readFile, writeFile, stat, realpath } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { convertImage, imageMetadata } from "../util/image-processing.mjs";
import { z } from "zod";
import { TripoError } from "../errors.mjs";
import { assertDownloadUrl, resolveOutputPath } from "../security/path-policy.mjs";
import { ok, fail } from "../mcp/result.mjs";
import { localArtifact } from "../studio/local-artifacts.mjs";
import { decodeMeshoptGlb } from "../util/glb-decode.mjs";
import { glbNodeNames } from "../util/model-inspect.mjs";

const MAX_IMAGE = 20 * 1024 * 1024;
const MAX_MODEL = 32 * 1024 * 1024;
const id = z.string().regex(/^[^\s\u0000-\u001f\u007f]{1,256}$/);
const unavailable = (message) => new TripoError("PREVIEW_UNAVAILABLE", message, { stage: "workbench_preview" });

// A bounded, redirect-checked read. Signed URLs stay inside the server and
// never enter structuredContent, browser networking or logs.
export async function readPreviewUrl(value, limit, fetchImpl = fetch) {
  let url = assertDownloadUrl(value);
  const signal = AbortSignal.timeout(45000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetchImpl(url, { redirect: "manual", signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      url = assertDownloadUrl(new URL(response.headers.get("location"), url).href);
      continue;
    }
    if (!response.ok || !response.body) throw unavailable(`预览读取失败（HTTP ${response.status}）。`);
    if (Number(response.headers.get("content-length")) > limit) {
      await response.body.cancel();
      throw unavailable("文件超过交互预览大小限制，可下载后查看。");
    }
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > limit) throw unavailable("文件超过交互预览大小限制，可下载后查看。");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw unavailable("预览重定向次数过多。");
}

export function validatePreviewGlb(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) throw unavailable("当前文件不是可预览的 GLB 模型。");
  const end = 20 + bytes.readUInt32LE(12);
  if (end > bytes.length) throw unavailable("模型文件不完整。");
  const json = JSON.parse(bytes.subarray(20, end).toString("utf8").trim());
  for (const entry of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (entry.uri && !/^data:/.test(entry.uri)) throw unavailable("模型包含外部资源，请下载后查看。");
  }
  return json;
}

// Decode Studio's meshopt geometry on the server, so sandboxed app previews
// need neither browser WebAssembly permissions nor an external decoder CDN.
export async function decodePreviewGlb(bytes) {
  validatePreviewGlb(bytes);
  try { return await decodeMeshoptGlb(bytes, MAX_MODEL); }
  catch { throw unavailable("模型解码失败或超过预览大小限制，可下载后查看。"); }
}

async function imagePayload(bytes, full = false) {
  const metadata = await imageMetadata(bytes);
  if (!["jpeg", "png", "webp"].includes(metadata.format)) throw unavailable("仅支持 PNG、JPG 和 WebP 图片。");
  const webp = await convertImage(bytes, { autoOrient: true, maxSize: full ? 1400 : 420, format: "webp", quality: 82 });
  return { data_url: `data:image/webp;base64,${webp.toString("base64")}`, mime_type: "image/webp", width: metadata.width, height: metadata.height, bytes: webp.length };
}

export function createWorkbenchMedia(runtime) {
  const projects = new Map();
  let projectAccount;
  const { config, gateway, store, session } = runtime;
  const inputPath = async (inputId) => resolveOutputPath(config, path.join(config.assetRoot, "ui-inputs", `${inputId}.png`), "input.png");
  const fromDisk = async (file, limit, allowedRoots = [config.assetRoot, config.dataDir]) => {
    const canonical = await realpath(file);
    const roots = await Promise.all(allowedRoots.map(r => realpath(r).catch(() => path.resolve(r))));
    if (!roots.some(r => { const rel = path.relative(r, canonical); return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)); })) throw unavailable("该文件不在工作台的素材目录中。");
    if ((await stat(canonical)).size > limit) throw unavailable("文件超过交互预览大小限制。");
    return readFile(canonical);
  };
  return {
    rememberProjects(items) {
      const account = session.activeAccountFingerprint();
      if (account !== projectAccount) projects.clear();
      projectAccount = account;
      for (const project of items) projects.set(project.id, project);
      while (projects.size > 100) projects.delete(projects.keys().next().value);
    },
    async importImage({ data_base64, name }) {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data_base64)) throw unavailable("图片编码无效。");
      const bytes = Buffer.from(data_base64, "base64");
      if (!bytes.length || bytes.length > MAX_IMAGE) throw unavailable("图片必须小于 20 MB。");
      const preview = await imagePayload(bytes, true);
      const inputId = randomUUID();
      const filePath = await inputPath(inputId);
      await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      const normalized = await convertImage(bytes, { autoOrient: true });
      if (normalized.length > MAX_IMAGE) throw unavailable("解码后的图片超过 20 MB，请压缩后重新选择。");
      await writeFile(filePath, normalized, { flag: "wx", mode: 0o600 });
      return { input_id: inputId, file_path: filePath, name: path.basename(name).slice(0, 120), width: preview.width, height: preview.height, preview };
    },
    async preview(input) {
      if ([input.project_id, input.asset_id, input.task_id, input.input_id, input.local_path].filter(Boolean).length !== 1) throw unavailable("请选择一个模型、图片、任务或已下载文件。");
      let projectId = input.project_id, assetId = input.asset_id, operatorId, file;
      const model = input.type === "model";
      if (input.local_path) {
        if (!path.isAbsolute(input.local_path)) throw unavailable("请提供已下载文件的绝对路径。");
        file = input.local_path;
      }
      if (input.input_id) file = await inputPath(input.input_id);
      if (input.task_id) {
        const task = await store.get(input.task_id);
        if (!task.kind.startsWith("local.") && task.account_fingerprint !== await session.accountFingerprint()) throw unavailable("任务属于另一个账号。");
        if (task.kind.startsWith("local.") && task.status === "succeeded") {
          file = localArtifact(task, model ? "model" : task.kind === "local.render" ? "render" : task.kind === "local.project_texture" ? "texture" : "image", input.output_index ?? 0);
        } else {
          const result = task.result ?? {};
          if (model && result.models) {
            const selected = result.models[input.output_index ?? 0];
            if (!selected?.project_id || selected.status !== 'succeeded') throw unavailable("所选模型输出尚未完成。");
            projectId = selected.project_id;
            operatorId = selected.operator_id;
          } else {
            projectId = result.project_id ?? task.remote?.project_id ?? task.input_summary?.project_id;
            operatorId = model ? task.remote?.operator_id : undefined;
          }
          assetId = result.asset_id ?? task.remote?.asset_id;
          if (!projectId && !assetId) throw unavailable("任务暂时没有可预览的输出。");
        }
      }
      let bytes;
      if (file) bytes = await fromDisk(file, model ? MAX_MODEL : MAX_IMAGE, input.local_path ? config.outputRoots : undefined);
      else if (projectId) {
        const account = await session.accountFingerprint();
        let detail = !model && account === projectAccount && projects.get(projectId);
        if (!detail) detail = await gateway.getProject(projectId, operatorId);
        if (detail.id && detail.id !== projectId) throw unavailable("模型标识与请求不一致。");
        const cover = detail.cover_image_object?.[0];
        const url = model ? detail.model_url : cover?.sizes?.find(s => s.width >= 400)?.url ?? cover?.url ?? detail.cover_image?.[0];
        if (!url) throw unavailable(model ? "这个版本尚无可预览的 GLB，请稍后刷新。" : "这个模型没有缩略图。");
        bytes = await readPreviewUrl(url, model ? MAX_MODEL : MAX_IMAGE);
      } else if (assetId) {
        if (model) throw unavailable("图片不能作为 3D 模型预览。");
        const asset = await gateway.getStudioImageAsset(assetId);
        const output = asset.output.data[input.output_index ?? 0];
        if (asset.status !== "success" || !output?.url) throw unavailable("图片尚未生成完成。");
        if (["reject", "nsfw", "sensitive"].includes(output.image_audit_result)) throw unavailable("此图片的内容审核状态不支持预览。");
        bytes = await readPreviewUrl(output.url, MAX_IMAGE);
      }
      if (!bytes) throw unavailable("没有可用预览。");
      if (!model) return imagePayload(bytes, input.type === "image");
      bytes = await decodePreviewGlb(bytes);
      return { data_url: `data:model/gltf-binary;base64,${bytes.toString("base64")}`, mime_type: "model/gltf-binary", bytes: bytes.length, part_names: glbNodeNames(bytes).slice(0,500) };
    }
  };
}

export function registerWorkbenchMedia(server, media) {
  const meta = { ui: { visibility: ["app"] } };
  server.registerTool("tripo_ui_preview", {
    description: "Workbench-only bounded image or self-contained GLB preview. Signed URLs remain private; bytes go in app metadata only.",
    _meta: meta, annotations: { readOnlyHint: true },
    inputSchema: { project_id: id.optional(), asset_id: id.optional(), task_id: z.string().uuid().optional(), input_id: z.string().uuid().optional(), local_path: z.string().min(1).max(4096).optional().describe("Saved file inside a configured output root; preview the exact downloaded artifact."), output_index: z.number().int().min(0).max(15).default(0), type: z.enum(["thumbnail", "image", "model"]).default("thumbnail") }
  }, async input => {
    try { const preview = await media.preview(input); return { ...ok({ mime_type: preview.mime_type, bytes: preview.bytes }, "预览已准备就绪。"), _meta: { tripo: { preview } } }; } catch (error) { return fail(error); }
  });
  server.registerTool("tripo_ui_import_image", {
    description: "Workbench-only import of a user-selected PNG/JPG/WebP image into the configured local asset folder. Does not upload or generate.",
    _meta: meta,
    inputSchema: { name: z.string().min(1).max(255), data_base64: z.string().min(4).max(Math.ceil(MAX_IMAGE / 3) * 4 + 4) }
  }, async input => {
    try { const { preview, ...info } = await media.importImage(input); return { ...ok(info, "图片已保存到本地素材目录。"), _meta: { tripo: { preview } } }; } catch (error) { return fail(error); }
  });
}
