import { t as tr, localizedMap, formatNumber } from './i18n.mjs';
export const STATUS = localizedMap({ staged: "待提交", queued: "排队中", running: "处理中", dispatching: "提交中", waiting_for_auth: "等待登录", succeeded: "已完成", failed: "失败", canceled: "已取消", outcome_unknown: "待核实", expired: "已过期" });
export const KINDS = localizedMap({ "model.generate": "模型生成", "model.remesh": "重拓扑", "texture.generate": "贴图", "model.rig": "绑定", "model.export": "导出", "model.import": "导入模型", "model.segment": "分件", "model.animate": "预设动作", "image.generate": "图片生成", "image.multiview": "多视图", "image.regenerate": "图片重生成", "image.upscale": "图片放大", "image.split": "主体拆分", "texture.upscale": "贴图放大", "texture.pbr": "PBR 材质", "model.uv_generate": "Smart UV", "model.uv_apply": "应用 UV", "motion.generate": "生成动作", "model.apply_motion": "应用动作", "model.complete_parts": "补全部件", "texture.edit_preview": "贴图编辑预览", "texture.edit_apply": "应用贴图", "local.render": "本地渲染", "local.crop": "图片裁切", "local.paint": "图片绘制", "local.inspect_parts": "检查分件", "local.edit_parts": "编辑分件", "local.project_texture": "投影烘焙" });
export const ACTIVE = ["queued", "running", "dispatching", "waiting_for_auth"];
export function modelBadge(asset) {
  const labels = {'v3.1-20260211':'H3.1','v3.0-20250812':'H3.0','v2.5-20250123':'H2.5','Nexus-v2.0-20260801':'P2.0','Nexus-v1.0-20260214':'P1.0'};
  if (asset.source_type === 'upload') return {label:tr('导入模型'),className:'badge-gray',smart:false};
  const smart = asset.is_nexus_mesh === true || asset.model_version?.startsWith('Nexus-') === true || asset.source_type === 'smart_mesh';
  const label = labels[asset.model_version] ?? (smart ? 'Smart Mesh' : tr('3D 模型'));
  return {label,className:smart ? 'badge-blue' : labels[asset.model_version] ? 'badge-orange' : 'badge-gray',smart};
}
export function taskProject(task) { return task.result?.project_id ?? task.remote?.project_id ?? task.input_summary?.project_id ?? null; }
export function taskTitle(task, models = []) {
  const name = models.find(m => m.project_id === taskProject(task))?.name ?? task.input_summary?.name ?? task.snapshots?.[0]?.source_name ?? task.metadata?.prompt ?? task.input_summary?.prompt;
  return name ? `${String(name).slice(0, 32)} · ${KINDS[task.kind] ?? task.kind}` : KINDS[task.kind] ?? task.kind;
}
export function artifactFor(task) { return ["local.crop", "local.paint"].includes(task.kind) ? "image" : task.kind === "local.render" ? "render" : task.kind === "local.project_texture" ? "texture" : task.kind.startsWith("image.") ? "image" : task.kind === "motion.generate" ? "motion" : "model"; }
export function quoteCurrent(quote, now = Date.now()) {
  return !!quote && Number.isFinite(quote.estimated_credits) && quote.estimated_credits >= 0 && (quote.status === "free" || Date.parse(quote.estimate_expires_at) > now);
}
export function generationInput(form) {
  const { mode, tier, images = {} } = form;
  const input = { mode, tier, face_limit: Number(form.faces), visibility: form.visibility ?? "private", submit: false };
  if (form.characterName?.trim()) input.character_name = form.characterName.trim();
  if (!Number.isSafeInteger(input.face_limit)) throw Error(tr("请输入有效的目标面数。"));
  if (mode === "text") {
    input.prompt = (form.prompt ?? "").trim();
    if (!input.prompt || input.prompt.length > 1000) throw Error(tr("模型描述需要 1–1000 个字符。"));
    input.t_pose = !!form.tPose;
  } else if (mode === "image") {
    if (!images.front?.file_path) throw Error(tr("请先选择参考图片。"));
    input.image_path = images.front.file_path;
  } else if (mode === "multiview") {
    if (!images.front?.file_path || !["left", "back", "right"].some(v => images[v]?.file_path)) throw Error(tr("请添加正面及至少一个其他视角。"));
    for (const view of ["front", "left", "back", "right"]) if (images[view]?.file_path) input[`${view}_image_path`] = images[view].file_path;
  } else throw Error(tr("请选择图片、文字或多视图生成。"));
  if (tier === "smart_mesh") {
    input.model_version = "Nexus-v2.0-20260801";
    input.quad = !!form.quad;
    input.amount = Number(form.amount ?? 1);
    if (input.face_limit < 500 || input.face_limit > 25000) throw Error(tr("Smart Mesh 面数范围为 500–25,000。"));
  } else {
    input.model_version = "v3.1-20260211";
    input.geometry_quality = form.geometry ?? "standard";
    input.quad = !!form.quad;
    input.texture = !!form.texture;
    const max = input.quad ? 50000 : input.geometry_quality === "detailed" ? 2000000 : 1000000;
    if (input.face_limit < 500 || input.face_limit > max) throw Error(tr("当前设置的面数范围为 500–{0}。", { "0": formatNumber(max) }));
    if (input.texture) { input.texture_quality = form.textureQuality ?? "detailed"; input.pbr = !!form.pbr; input.delight = !!form.delight; }
  }
  return input;
}
export function taskGroups(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    const id = task.character_group?.id ?? 'ungrouped';
    if (!groups.has(id)) groups.set(id,{id,name:id === 'ungrouped' ? tr("未分组") : task.character_group?.name ?? tr("未分组"),tasks:[]});
    groups.get(id).tasks.push(task);
  }
  return [...groups.values()];
}
export function assetGroups(assets) {
  return taskGroups(assets).map(({tasks,...group}) => ({...group,assets:tasks}));
}
export const PARAM_LABELS = localizedMap({ mode: "输入方式", tier: "生成类型", face_limit: "目标面数", geometry_quality: "几何质量", model_version: "模型版本", texture_quality: "贴图质量", quality: "贴图质量", texture: "生成贴图", pbr: "PBR 材质", delight: "去光", quad: "四边形", smart_poly: "Smart Poly", visibility: "可见性", prompt: "描述", format: "导出格式", texture_size: "贴图尺寸", part_name_list: "选择分件", part_names: "选择分件", rigging_type: "绑定类型", skeleton_preset: "骨架预设", t_pose: "T Pose", amount: "变体数量", with_animation: "包含动作", pack_uv: "打包 UV" });
export function parameterRows(task) {
  const values = { ...task.input_summary, ...task.effective_settings };
  const localLabels = { left:tr("左边距"), top:tr("上边距"), width:tr("宽度"), height:tr("高度"), view:tr("视角"), viewport_width:tr("预览宽度"), viewport_height:tr("预览高度"), resolution:tr("分辨率") };
  const names = { ...PARAM_LABELS, ...localLabels };
  const labels = { mode: { text:tr("文字"), image:tr("图片"), multiview:tr("多视图"), batch:tr("独立批量"), studio_image:tr("Studio 图片"), studio_multiview:tr("Studio 多视图") }, tier:{high_detail:tr("高精度"),smart_mesh:"Smart Mesh"}, geometry_quality:{standard:tr("标准"),detailed:tr("精细")}, texture_quality:{standard:"2K",detailed:"4K",ultra:"8K"}, quality:{standard:"2K",detailed:"4K",ultra:"8K"}, visibility:{private:tr("私有"),public:tr("公开"),shareable:tr("可分享")}, rigging_type:{humanoid:tr("人形"),other:tr("动物 / 其他")}, model_version:{"v3.1-20260211":"H3.1","Nexus-v2.0-20260801":"P2.0","v3.0-20260909":"Rig V3"} };
  return Object.entries(values).filter(([k]) => Object.hasOwn(names, k)).map(([key, value]) => [names[key], labels[key]?.[value] ?? (typeof value === "boolean" ? value ? tr("开启") : tr("关闭") : Array.isArray(value) ? value.join(tr("、")) : String(value ?? "—"))]);
}
