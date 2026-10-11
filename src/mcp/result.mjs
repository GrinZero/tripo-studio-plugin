import { TripoError, errorSnapshot, toTripoError } from "../errors.mjs";
import { redactDeep } from "../redact.mjs";

export function ok(structured, text) {
  const clean = redactDeep(structured);
  return {
    content: [{ text: text ?? summarize(clean), type: "text" }],
    structuredContent: clean
  };
}

export function fail(error) {
  const normalized = error instanceof TripoError ? error : toTripoError(error);
  const snapshot = errorSnapshot(normalized);
  const extra = normalized.task ? { task: redactDeep(normalized.task) } : {};
  return {
    content: [{ text: `${snapshot.code}: ${snapshot.message}`, type: "text" }],
    isError: true,
    structuredContent: { error: snapshot, ...extra }
  };
}

function summarize(value) {
  if(value?.review) {
    const r=value.review;
    const prefix=`配置卡片 ${r.review_id}：${r.status}。`;
    const follow=`继续调用 tripo_get_configuration_review({review_id:"${r.review_id}",wait_ms:60000}) 等待并读取最新状态；仍为 pending/submitting 时继续等待，不要提前结束。无需代点表单、开放直接提交接口或重新创建任务。`;
    if(r.status==='pending' && r.auto_submit!==false)return prefix+(Number.isFinite(r.deadline_at)
      ? '正在等待配置表单的 60 秒自动提交；用户编辑会暂停，保存后直接提交。'
      : '正在等待配置表单显示；显示后 60 秒自动提交。这是正常等待状态，不是提交能力缺失。')+follow;
    if(r.status==='submitting')return prefix+'正在上传或等待提交回执；尚无最终任务 ID 不代表未发起提交。'+follow;
    if(r.status==='editing')return prefix+'用户正在修改配置，自动提交已暂停；保存校验通过后直接提交。等待用户保存或取消，不要绕过表单或重复创建任务。';
    if(r.status==='submitted')return prefix+(value.task?.task_id ? `已提交。任务 ID：${value.task.task_id}；继续查询/等待这个任务的生成结果。` : '已提交，继续查询当前卡片获取最终任务 ID。');
    if(r.status==='failed')return prefix+`提交失败：${r.error?.message ?? '请查看任务错误。'} 不要自动重试生成。`;
    if(r.status==='canceled')return prefix+'用户已取消，停止等待，不要提交或重新创建任务。';
    return prefix+'等待用户在现有配置表单中确认提交，不要重复创建任务。';
  }
  if (value?.download?.path) return `下载完成，文件已保存到 ${value.download.path}。${value.download.blender_error ? 'Blender 兼容处理失败，请查看卡片中的提示。' : ''}`;
  if (value?.quote) {
    const quote = value.quote;
    const amount = quote.status !== 'unknown' && Number.isFinite(quote.estimated_credits) ? `${quote.estimated_credits} 积分` : '待确认';
    return `预计费用：${amount}。${quote.paid_request_sent === false ? '仅查询报价，尚未提交任务。' : ''}`;
  }
  if (Array.isArray(value?.operations)) return `已加载 ${value.operations.length} 项可用功能。查看功能列表及积分标记，具体费用以操作报价为准。`;
  if (value?.task) {
    const task = value.task;
    return `${task.kind} task ${task.task_id} — ${task.status}${task.remote ? "" : " (no remote ids yet)"}`;
  }
  if (Array.isArray(value?.tasks)) return `${value.tasks.length} task(s)`;
  return JSON.stringify(value, null, 2).slice(0, 4000);
}
