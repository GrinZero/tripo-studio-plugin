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
    return `配置卡片 ${r.review_id}：${r.status}。${value.task?.task_id ? `任务 ID：${value.task.task_id}` : '尚未提交生成任务；通过卡片标识查询当前配置与提交状态。'}`;
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
