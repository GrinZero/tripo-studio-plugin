import { t as tr, setText, setAttributeText } from './i18n.mjs';

// Keep previews tied to the currently edited project, including late responses.
export function mountConfigurationModelPreview(root, projectField, { preview, renderModel, beforeInspect, getDark = () => false, onError }) {
  const section = document.createElement('section'); section.className = 'configuration-model-preview';
  const header = document.createElement('div'); header.className = 'source-model-header';
  const title = document.createElement('h3'); setText(title, () => tr('源模型预览'));
  const open = document.createElement('button'); open.type = 'button'; setText(open, () => tr('查看 3D 模型'));
  header.append(title, open);
  const stage = document.createElement('div'); stage.className = 'source-model-stage';
  const message = document.createElement('p'); message.className = 'source-model-message'; message.setAttribute('role', 'status');
  const controls = document.createElement('div'); controls.className = 'source-model-controls';
  const hint = document.createElement('span');
  const reset = document.createElement('button'); reset.type = 'button'; reset.hidden = true; setText(reset, () => tr('重置视角'));
  controls.append(hint, reset); section.append(header, stage, message, controls); root.append(section);
  let revision = 0, disposed = false, viewer, timer, loading = false, projectId;
  const current = stamp => !disposed && stamp === revision;
  function release() { viewer?.dispose(); viewer = null; reset.hidden = true; }
  async function showModel(stamp) {
    if (!current(stamp) || loading || viewer) return;
    loading = true; open.disabled = true; setText(message, () => tr('正在加载 3D 模型…'));
    const host = document.createElement('div'); host.className = 'source-model-viewer'; stage.append(host);
    try {
      const data = await preview(projectId, 'model');
      if (!current(stamp)) return;
      const next = await renderModel(host, data?.data_url, { dark: getDark() });
      if (!current(stamp)) { next.dispose(); return; }
      viewer = next; viewer.theme(getDark());
      stage.replaceChildren(host); reset.hidden = false; open.hidden = true;
      setText(message, () => ''); setText(hint, () => tr('拖动旋转 · 滚轮缩放'));
    } catch {
      host.remove();
      if (current(stamp)) { setText(message, () => tr('3D 预览暂不可用，可重试或核对源模型 ID。')); setText(open, () => tr('重试 3D 预览')); }
    } finally { if (current(stamp)) { loading = false; open.disabled = false; } }
  }
  async function load(stamp) {
    try {
      const data = await preview(projectId, 'thumbnail');
      if (!current(stamp)) return;
      if (viewer) return;
      if (!/^data:image\/(webp|png|jpeg);base64,/.test(data?.data_url ?? '')) throw Error();
      const image = document.createElement('img'); image.src = data.data_url;
      setAttributeText(image, 'alt', () => tr('源模型预览'));
      if (loading) { stage.prepend(image); return; }
      stage.replaceChildren(image);
      setText(message, () => ''); setText(hint, () => tr('检查源模型外观，确认后开始处理。'));
    } catch { if (current(stamp)) await showModel(stamp); }
  }
  function refresh(immediate = false) {
    const stamp = ++revision; clearTimeout(timer); release(); loading = false;
    projectId = projectField.value.trim(); section.hidden = !projectId;
    stage.replaceChildren(); open.hidden = false; open.disabled = false;
    setText(open, () => tr('查看 3D 模型')); setText(hint, () => tr('检查源模型外观，确认后开始处理。'));
    setText(message, () => tr('正在加载源模型预览…'));
    if (!projectId) return;
    if (immediate) void load(stamp); else timer = setTimeout(() => void load(stamp), 400);
  }
  async function inspect(action) {
    const stamp = revision;
    try { await beforeInspect(); if (current(stamp)) await action(stamp); }
    catch (error) { if (!disposed) onError(error); }
  }
  open.onclick = () => void inspect(showModel);
  reset.onclick = () => void inspect(() => viewer?.reset());
  // Inspecting the actual model should leave time to finish the review.
  stage.addEventListener('pointerdown', () => { void inspect(() => {}); });
  stage.addEventListener('focusin', () => { void inspect(() => {}); });
  stage.addEventListener('wheel', () => { void inspect(() => {}); }, { passive: true });
  const change = () => refresh(); projectField.addEventListener('input', change); refresh(true);
  return {
    theme(value) { viewer?.theme(value); },
    dispose() { disposed = true; revision++; clearTimeout(timer); release(); projectField.removeEventListener('input', change); }
  };
}
