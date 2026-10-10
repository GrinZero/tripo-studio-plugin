import { t as tr } from './i18n.mjs';
import { artifactFor, taskTitle, taskProject, STATUS, KINDS } from './model.mjs';

// Keep model context readable and small; full configuration stays in the card.
export function taskContextSummary({ review = {}, task = {} } = {}) {
  const kind = task.kind ?? review.kind;
  const name = task.character_group?.name ?? review.input?.character_name ?? task.input_summary?.character_name;
  const title = name ? `${String(name).replace(/\s+/g, ' ').trim().slice(0, 80)} · ${KINDS[kind] ?? kind}`
    : taskTitle({ ...task, kind, input_summary: task.input_summary ?? review.input });
  const reviewStatus = { pending:tr("等待确认"), editing:tr("编辑中"), submitting:tr("提交中"), submitted: tr("已提交"), canceled: tr("已取消"), failed: tr("提交失败") }[review.status];
  const status = ['pending','editing','submitting','canceled', 'failed'].includes(review.status) ? reviewStatus
    : STATUS[task.status] ?? task.status ?? reviewStatus ?? tr("等待确认");
  const lines = [`${title} · ${status}`];
  if (!['canceled', 'failed'].includes(review.status) && Number.isFinite(task.progress?.progress)) {
    lines.push(tr("进度: {0}%", { 0: Math.max(0, Math.min(100, task.progress.progress)) }));
  }
  if (review.review_id) lines.push(tr("配置卡片 ID: {0}", {0:review.review_id}));
  if (task.task_id && !['staged','dispatching'].includes(task.status) && (task.remote || ['queued','running','succeeded','outcome_unknown','waiting_for_auth'].includes(task.status)))
    lines.push(tr("任务 ID: {0}", { 0: task.task_id }));
  const projectId = taskProject(task) ?? review.input?.project_id;
  if (projectId) lines.push(tr("模型 ID: {0}", { 0: projectId }));
  const error = review.error ?? task.error;
  if (error?.message) lines.push(tr("错误: {0}", { 0: String(error.message).replace(/\s+/g, ' ').slice(0, 240) }));
  return lines.join('\n');
}

export function operationGroups(operations) {
  const groups = new Map();
  for (const operation of operations) {
    const kind = operation.kind ?? '';
    const category = kind.startsWith('texture.') || kind.startsWith('model.uv_') ? tr("贴图与 UV")
      : kind.startsWith('motion.') || ['model.rig', 'model.animate', 'model.apply_motion'].includes(kind) ? tr("绑定与动作")
      : kind === 'model.export' ? tr("导出")
      : ({ image: tr("图片"), model: tr("3D 模型"), postprocess: tr("3D 模型"), local: tr("本地编辑") }[operation.category] ?? tr("其他功能"));
    if (!groups.has(category)) groups.set(category, { title: category, items: [] });
    groups.get(category).items.push({
      title: KINDS[kind] ?? operation.title ?? kind,
      credits: operation.consumes_credits === true ? tr("消耗积分") : operation.consumes_credits === false ? tr("不消耗积分") : tr("积分待确认")
    });
  }
  return [...groups.values()];
}
export function cardItems(data = {}) {
  if (data.download?.path) {
    const download=data.download, title=download.path.split(/[\\/]/).pop(), extension=title.split('.').pop().toLowerCase();
    const type=extension==='glb' ? 'model' : ['png','jpg','jpeg','webp'].includes(extension) ? 'image' : null;
    const details=[[tr("文件格式"),extension.toUpperCase()]];
    if (Number.isFinite(download.bytes)) {
      const bytes=download.bytes;
      details.push([tr("文件大小"),bytes>=1048576 ? `${(bytes/1048576).toFixed(1)} MB` : bytes>=1024 ? `${(bytes/1024).toFixed(1)} KB` : `${bytes} B`]);
    }
    details.push([tr("保存位置"),download.path]);
    if (download.blender_path && download.blender_path!==download.path) details.push([tr("Blender 文件"),download.blender_path]);
    return [{title,status:tr("下载完成"),details,warning:download.blender_error ? tr("文件已保存，Blender 兼容处理失败：{0}", { "0": download.blender_error.message }) : null,
      preview:type ? {local_path:download.path,type} : null}];
  }
  const taskItem = task => ({ title:taskTitle(task), status:STATUS[task.status] ?? task.status, taskId:task.task_id,
    downloads:task.downloads ?? [],
    downloadTarget:task.status === 'succeeded' ? {task_id:task.task_id,artifact:artifactFor(task) === 'motion' ? 'model' : artifactFor(task),output_index:data.preview_target?.output_index ?? 0} : null,
    preview:task.status === 'succeeded' ? data.preview_target ?? { task_id:task.task_id, type:['model','motion'].includes(artifactFor(task)) ? 'model' : 'image' } : null });
  if (data.task) return [taskItem(data.task)];
  if (data.tasks) return data.tasks.slice(0,12).map(item => taskItem(item.task ?? item));
  if (data.models) return data.models.slice(0,12).map(item => ({title:item.name ?? item.project_name ?? tr("模型"), preview:{project_id:item.project_id, type:'thumbnail'}}));
  if (data.assets) return data.assets.slice(0,12).map(item => ({title:item.input?.prompt ?? tr("图片"), status:item.status, preview:item.status === 'success' ? {asset_id:item.asset_id, type:'image'} : null}));
  if (data.project_id) return [{title:data.project_name ?? tr("模型预览"), downloadTarget:{project_id:data.project_id}, preview:{project_id:data.project_id, type:'model'}}];
  if (data.asset_id) return [{title:data.input?.prompt ?? tr("图片预览"), status:data.status, downloadTarget:data.status === 'success' ? {asset_id:data.asset_id,artifact:'image',output_index:data.preview_target?.output_index ?? 0} : null, preview:data.status === 'success' ? data.preview_target ?? {asset_id:data.asset_id, type:'image'} : null}];
  return [];
}
