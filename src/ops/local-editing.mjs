import { z } from "zod";
import { mkdir, readFile, writeFile, access, open } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertImage, decodePixels, encodePixels } from "../util/image-processing.mjs";
import { TripoError } from "../errors.mjs";
import { stageLocalImage, stageLocalModelFile, snapshotDirectory } from "./images.mjs";
import { inspectModel } from "../util/model-inspect.mjs";
import { prepareGlbForBlender } from "../util/glb-decode.mjs";

const matrix = z.array(z.number().finite()).length(16);
const dimension = z.number().int().min(64).max(2048);
const partName = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$/);
function imagePath(ctx, taskId, provenance) { return path.join(snapshotDirectory(ctx.config, taskId), path.basename(provenance.relative_path)); }
async function retainImage(ctx, filePath, taskId, index = 1) {
  const image = await stageLocalImage(ctx.config, null, null, filePath, false, { taskId, index, label: "Local image", slot: "image", upload: false });
  return { ...image, path: imagePath(ctx, taskId, image.provenance) };
}
async function retainModel(ctx, filePath, taskId) {
  if (path.extname(filePath).toLowerCase() !== ".glb") throw new TripoError("INVALID_INPUT", "Local viewport/edit tools require a self-contained GLB.");
  const model = await stageLocalModelFile(ctx.config, filePath, { taskId, index: 1, label: "Local GLB", slot: "model" });
  await inspectModel(model.path);
  const bytes = await readFile(model.path);
  const jsonLength = bytes.readUInt32LE(12); const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  for (const resource of [...document.buffers ?? [], ...document.images ?? []]) {
    if (resource.uri && !resource.uri.startsWith("data:")) throw new TripoError("INVALID_INPUT", "External GLB resources are not accepted. Embed them before using local tools.");
  }
  const compatible = await prepareGlbForBlender({ ...ctx.config, outputRoots: [snapshotDirectory(ctx.config, taskId)] }, model.path);
  if (!compatible.meshopt_decoded) return { ...model, snapshots: [model.provenance] };
  const derived = { format: "glb", label: "Decoded Blender GLB", relative_path: path.relative(ctx.config.dataDir, compatible.blender_path).split(path.sep).join("/"), sha256: compatible.blender_sha256, size_bytes: compatible.blender_bytes, slot: "blender_model", source_name: path.basename(filePath) };
  return { ...model, path: compatible.blender_path, snapshots: [model.provenance, derived] };
}
async function blender(ctx, task, job) {
  const output = path.join(ctx.config.assetRoot, "operations", task.task_id);
  await mkdir(output, { recursive: true });
  const jobPath = path.join(snapshotDirectory(ctx.config, task.task_id), "worker-job.json");
  await writeFile(jobPath, JSON.stringify({ ...job, output_dir: output }), { mode: 0o600 });
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(moduleDir, "../../scripts/blender-worker.py"), path.resolve(moduleDir, "../scripts/blender-worker.py")];
  let script;
  for (const candidate of candidates) { try { await access(candidate); script = candidate; break; } catch {} }
  if (!script) throw new TripoError("CONFIGURATION_ERROR", "Packaged Blender worker is missing.");
  const logPath = path.join(output, "blender.log");
  const log = await open(logPath, "w", 0o600);
  try { await new Promise((resolve, reject) => {
    const proc = spawn(ctx.config.blenderExecutable ?? "blender", ["--background", "--factory-startup", "--python-exit-code", "1", "--python", script, "--", jobPath], { stdio: ["ignore", log.fd, log.fd] });
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new TripoError("LOCAL_PROCESS_FAILED", "Blender exceeded the 15-minute limit.")); }, 15 * 60 * 1000);
    proc.on("error", () => { clearTimeout(timer); reject(new TripoError("CONFIGURATION_ERROR", "Blender is unavailable. Install Blender and set TRIPO_BLENDER_EXECUTABLE to its executable.")); });
    proc.on("exit", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new TripoError("LOCAL_PROCESS_FAILED", "Blender could not process this model; inspect the retained worker job.", { details: { exit_code: code, log_path: logPath }, stage: "local_worker" })); });
  }); } finally { await log.close(); }
  const result = JSON.parse(await readFile(path.join(output, "result.json"), "utf8"));
  if (result.render_path) {
    const webp = path.join(output, "viewport.webp");
    await writeFile(webp, await convertImage(result.render_path, { background: "#eeeeee", format: "webp", lossless: true }));
    result.render_image_path = webp;
  }
  return { local_result: result };
}
const local = (title, description, inputShape, build, run) => ({ category: "local", consumesCredits: false, title, description, inputShape: { ...inputShape, submit: z.boolean().optional() }, build, submitRemote: run, async syncRemote(ctx, task) { return { status: "succeeded", result: task.remote.local_result }; } });
const viewShape = { viewport_width: dimension.default(512), viewport_height: dimension.default(512), fov_degrees: z.number().min(10).max(120).default(50), camera_matrix: matrix.optional(), view: z.enum(["front", "left", "back", "right", "three_quarter"]).default("three_quarter") };
async function modelJob(ctx, input, taskId, kind) {
  const model = await retainModel(ctx, input.model_path, taskId);
  const { submit, ...params } = input;
  return { payload: { ...params, model_path: model.path, kind }, snapshots: model.snapshots };
}
export const localEditingOperations = {
  "local.render": local("Render model viewport", "Render a self-contained local GLB with Blender in background. Outputs a static WebP at exactly 2x viewport plus a Three.js Y-up camera world matrix for Magic Brush. Requires local Blender; changes no Studio project.", { model_path: z.string(), ...viewShape }, (ctx, input, taskId) => modelJob(ctx, input, taskId, "render"), (ctx, task) => blender(ctx, task, task.payload)),
  "local.inspect_parts": local("Inspect local mesh parts", "Inspect GLB parts, polygon counts, UV presence, skinning and estimated UV utilization per part (256x256 union in tile [0,1]). This estimate is not Studio's exact UI metric. Face indices refer to Blender-imported polygons. Requires Blender.", { model_path: z.string() }, (ctx, input, taskId) => modelJob(ctx, input, taskId, "inspect"), (ctx, task) => blender(ctx, task, task.payload)),
  "local.edit_parts": local("Edit parts in a model copy", "Merge, hide, delete, or split selected face indices in a local GLB copy with Blender. Preserves original input; structural edits of skinned parts are rejected. Upload the inspected result with model.import if needed.", {
    model_path: z.string(), edits: z.array(z.object({ action: z.enum(["merge", "hide", "delete", "split"]), part_names: z.array(partName).min(1).max(200), name: partName.optional(), face_indices: z.array(z.number().int().nonnegative()).min(1).max(100000).optional() }).strict()).min(1).max(100)
  }, async (ctx, input, taskId) => {
    for (const edit of input.edits) {
      if (["merge", "split"].includes(edit.action) && !edit.name) throw new TripoError("INVALID_INPUT", "Merge/split requires a result name.");
      if (edit.action === "split" && (edit.part_names.length !== 1 || !edit.face_indices)) throw new TripoError("INVALID_INPUT", "Split requires one part and face_indices.");
      if (new Set(edit.part_names).size !== edit.part_names.length) throw new TripoError("INVALID_INPUT", "Duplicate part names.");
    }
    return modelJob(ctx, input, taskId, "edit_parts");
  }, (ctx, task) => blender(ctx, task, task.payload)),
  "local.project_texture": local("Bake viewport edit to part textures", "Project an edited viewport image onto a local GLB using the exact camera matrix/FOV and bake complete per-part UV textures. Face-center ray casting masks occlusion; coarse triangles need inspection. Feed the resulting textures into texture.edit_apply. Requires Blender; no Studio write.", {
    model_path: z.string(), image_path: z.string(), ...viewShape, camera_matrix: matrix,
    part_names: z.array(partName).min(1).max(200).optional(), resolution: z.union([z.literal(512), z.literal(1024), z.literal(2048), z.literal(4096)]).default(2048), strength: z.number().min(0).max(1).default(1)
  }, async (ctx, input, taskId) => {
    const model = await modelJob(ctx, input, taskId, "project_texture");
    const image = await retainImage(ctx, input.image_path, taskId, 2);
    if (image.metadata.width !== input.viewport_width * 2 || image.metadata.height !== input.viewport_height * 2) throw new TripoError("INVALID_INPUT", "Projection image dimensions must be exactly 2x viewport dimensions.");
    model.snapshots.push(image.provenance);model.payload.image_path=image.path;
    return model;
  }, (ctx, task) => blender(ctx, task, task.payload)),
  "local.paint": local("Paint texture with UV brush strokes", "Paint normalized UV brush strokes onto a local texture copy, preserving the original. u/v are in [0,1], v=0 bottom; radius is pixels, RGB is 0–255. Feed the PNG into texture.edit_apply for the corresponding part.", {
    image_path: z.string(), strokes: z.array(z.object({ points: z.array(z.array(z.number().min(0).max(1)).length(2)).min(1).max(10000), radius: z.number().min(1).max(2048), color: z.array(z.number().int().min(0).max(255)).length(3), opacity: z.number().min(0).max(1).default(1) }).strict()).min(1).max(1000)
  }, async (ctx, input, taskId) => {
    const image=await retainImage(ctx,input.image_path,taskId);
    return { payload:{ image_path:image.path,strokes:input.strokes }, snapshots:[image.provenance] };
  }, async (ctx, task) => {
    const { data, info }=await decodePixels(task.payload.image_path);
    for (const stroke of task.payload.strokes) {
      const mask=new Float32Array(info.width*info.height);
      const stamp=(u,v)=>{
        const x=u*(info.width-1),y=(1-v)*(info.height-1),r=stroke.radius;
        for(let py=Math.max(0,Math.floor(y-r));py<=Math.min(info.height-1,Math.ceil(y+r));py++) for(let px=Math.max(0,Math.floor(x-r));px<=Math.min(info.width-1,Math.ceil(x+r));px++) {
          const coverage=Math.max(0,Math.min(1,r+.5-Math.hypot(px-x,py-y)))*stroke.opacity;
          const index=py*info.width+px;mask[index]=Math.max(mask[index],coverage);
        }
      };
      for(let i=0;i<stroke.points.length;i++) {
        const [u,v]=stroke.points[i],previous=stroke.points[i-1]??[u,v];
        const steps=Math.max(1,Math.ceil(Math.hypot((u-previous[0])*info.width,(v-previous[1])*info.height)/Math.max(1,stroke.radius/2)));
        for(let step=0;step<=steps;step++) stamp(previous[0]+(u-previous[0])*step/steps,previous[1]+(v-previous[1])*step/steps);
      }
      for(let pixel=0;pixel<mask.length;pixel++) if(mask[pixel]) for(let channel=0;channel<3;channel++) data[pixel*4+channel]=Math.round(data[pixel*4+channel]*(1-mask[pixel])+stroke.color[channel]*mask[pixel]);
    }
    const dir=path.join(ctx.config.assetRoot,"operations",task.task_id);await mkdir(dir,{recursive:true});const output=path.join(dir,"painted-texture.png");
    await writeFile(output, await encodePixels(data, info));return { local_result:{image_path:output,width:info.width,height:info.height} };
  }),
  "local.crop": local("Crop image copy", "Crop a local image to an explicit pixel rectangle without changing its source; Studio automatic subject cutout is image.split.", {
    image_path:z.string(),left:z.number().int().nonnegative(),top:z.number().int().nonnegative(),width:z.number().int().min(1).max(16384),height:z.number().int().min(1).max(16384)
  }, async(ctx,input,taskId)=>{
    const image=await retainImage(ctx,input.image_path,taskId);
    if(input.left+input.width>image.metadata.width||input.top+input.height>image.metadata.height)throw new TripoError("INVALID_INPUT","Crop rectangle is outside the image.");
    return {payload:{image_path:image.path,rectangle:{left:input.left,top:input.top,width:input.width,height:input.height}},snapshots:[image.provenance]};
  },async(ctx,task)=>{
    const dir=path.join(ctx.config.assetRoot,"operations",task.task_id);await mkdir(dir,{recursive:true});const output=path.join(dir,"cropped-image.png");await writeFile(output, await convertImage(task.payload.image_path, { crop: task.payload.rectangle }));return {local_result:{image_path:output}};
  })
};
