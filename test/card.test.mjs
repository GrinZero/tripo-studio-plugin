import assert from 'node:assert/strict';
import { it } from 'node:test';
import { cardItems, operationGroups, taskContextSummary } from '../ui/card-model.mjs';
import { operationCatalog } from '../src/ops/registry.mjs';
import { ok } from '../src/mcp/result.mjs';
import { quoteCard } from '../ui/quote-model.mjs';
import { modelQuote } from './fixtures/model-quote.mjs';
it('summarizes the completed character task with queryable ids instead of the configuration payload', () => {
  const data = {
    review: { kind: 'model.rig', status: 'submitted', input: { character_name: '云峰鹤' }, schema: { description: 'schema'.repeat(2000) } },
    task: { task_id: 'rig-task', kind: 'model.rig', status: 'succeeded', progress: { progress: 100 },
      result: { project_id: 'rigged-model' }, remote: { project_id: 'source-model' },
      account_fingerprint: 'private-account', confirmation: 'SUBMIT_MODEL_RIG', cost_estimate: { status: 'unknown' } }
  };
  const summary = taskContextSummary(data);
  assert.equal(summary.split('\n')[0], '云峰鹤 · 绑定 · 已完成');
  assert.match(summary, /进度：100%/);
  assert.match(summary, /任务 ID: rig-task/);
  assert.match(summary, /模型 ID：rigged-model/);
  for (const omitted of ['schema', 'private-account', 'SUBMIT_MODEL_RIG', 'cost_estimate', 'source-model']) assert.ok(!summary.includes(omitted));
  assert.ok(summary.length < 200);
});
it('keeps cancellation and submission failure distinct from an unsubmitted task', () => {
  const task = { task_id: 'staged-task', kind: 'model.generate', status: 'staged', progress: { progress: 100 } };
  const canceled = taskContextSummary({ review: { status: 'canceled' }, task });
  assert.match(canceled, /^模型生成 · 已取消/);
  assert.ok(!canceled.includes('100%'));
  const failed = taskContextSummary({ review: { status: 'failed', error: { message: 'Submission failed\n' + 'detail '.repeat(1000) } }, task });
  assert.match(failed, /^模型生成 · 提交失败/);
  assert.match(failed, /错误：Submission failed detail/);
  assert.ok(failed.length < 350);
});
it('summarizes review-only results and running tasks without inventing completion or model ids', () => {
  assert.equal(taskContextSummary({ review: { kind: 'image.generate', status: 'submitted', input: { character_name: '派蒙' } } }), '派蒙 · 图片生成 · 已提交');
  const running = taskContextSummary({ review: { status: 'submitted', input: { project_id: 'source-model' } },
    task: { task_id: 'rig-task', kind: 'model.rig', status: 'running', character_group: { name: '云峰鹤' }, progress: { progress: 45 } } });
  assert.match(running, /^云峰鹤 · 绑定 · 处理中/);
  assert.match(running, /进度：45%/);
  assert.match(running, /模型 ID：source-model/);
});
it('tracks the stable configuration card and hides task ids until submission', () => {
  const review={review_id:'stable-card',kind:'model.generate',status:'editing'};
  const draft={task_id:'internal-draft',kind:'model.generate',status:'staged'};
  const summary=taskContextSummary({review,task:draft});
  assert.match(summary,/编辑中/);
  assert.match(summary,/配置卡片 ID：stable-card/);
  assert.ok(!summary.includes('internal-draft'));
  assert.ok(!summary.includes('任务 ID'));
  const result=ok({review,task:{...draft,task_id:undefined,draft_id:'internal-draft'}});
  assert.match(result.content[0].text,/尚未提交生成任务/);
  assert.ok(!result.content[0].text.includes('internal-draft'));
  const submitted=taskContextSummary({review:{...review,status:'submitted'},task:{...draft,status:'queued',remote:{operator_id:'actual-operator'}}});
  assert.match(submitted,/任务 ID: internal-draft/);
});
it('shows successful downloads as file cards with previews of the saved artifact instead of JSON', () => {
  const download={path:'/assets/9c60c1c9.glb',bytes:14065008,blender_path:'/assets/9c60c1c9.decoded.glb'};
  const result=ok({download,source:{project_id:'project-one'}});
  assert.ok(!result.content[0].text.startsWith('{'), 'download summary must not be raw JSON');
  assert.match(result.content[0].text,/下载完成/);
  const [card]=cardItems(result.structuredContent);
  assert.equal(card.title,'9c60c1c9.glb');
  assert.equal(card.status,'下载完成');
  assert.deepEqual(card.preview,{local_path:download.path,type:'model'});
  assert.ok(card.details.some(([label,value])=>label==='文件大小' && value==='13.4 MB'));
  assert.ok(card.details.some(([label,value])=>label==='Blender 文件' && value===download.blender_path));
  assert.equal(cardItems({download:{path:'/assets/export.zip',bytes:10}})[0].preview,null);
  assert.deepEqual(cardItems({download:{path:'/assets/view.png',bytes:10},source:{output_index:2}})[0].preview,{local_path:'/assets/view.png',type:'image'});
  const failed=cardItems({download:{...download,blender_error:{message:'解码失败'}}})[0];
  assert.match(failed.warning,/解码失败/);
});
it('cards avoid previewing incomplete tasks and choose the correct completed artifact', () => {
  assert.equal(cardItems({task:{kind:'model.generate',task_id:'one',status:'running'}})[0].preview,null);
  assert.deepEqual(cardItems({task:{kind:'local.crop',task_id:'two',status:'succeeded'}})[0].preview,{task_id:'two',type:'image'});
  assert.deepEqual(cardItems({task:{kind:'model.generate',task_id:'three',status:'succeeded'}})[0].preview,{task_id:'three',type:'model'});
  assert.equal(cardItems({tasks:[{task:{kind:'image.generate',task_id:'four',status:'staged'}}]})[0].taskId,'four');
});
it('renders the complete operation catalog as named groups without JSON text or asset previews', () => {
  const operations = operationCatalog();
  const result = ok({ operations, session: { authenticated: false } });
  assert.ok(!result.content[0].text.includes('"operations"'));
  assert.match(result.content[0].text, /28 项/);
  assert.deepEqual(result.structuredContent.operations, operations);
  const groups = operationGroups(operations);
  assert.equal(groups.flatMap(group => group.items).length, 28);
  assert.ok(groups.find(group => group.title === '图片').items.some(item => item.title === '图片生成' && item.credits === '消耗积分'));
  assert.ok(groups.find(group => group.title === '本地编辑').items.every(item => item.credits === '不消耗积分'));
  assert.ok(groups.find(group => group.title === '绑定与动作').items.some(item => item.title === '绑定'));
  assert.ok(groups.find(group => group.title === '贴图与 UV').items.some(item => item.title === 'Smart UV'));
  assert.deepEqual(cardItems(result.structuredContent), []);
  assert.deepEqual(operationGroups([]), []);
  assert.equal(operationGroups([{kind:'future.operation',title:'新功能',category:'future'}])[0].items[0].credits, '积分待确认');
});
it('shows the reported 40-credit quote with localized billing and actual model settings', () => {
  const card = quoteCard(modelQuote, Date.parse(modelQuote.quoted_at));
  assert.equal(card.amount, '40');
  assert.equal(card.status, '费用预估');
  assert.deepEqual(card.breakdown, [['模型生成（含贴图）','25 积分'],['4K 贴图','10 积分'],['PBR 材质','5 积分']]);
  assert.ok(card.parameters.some(([key,value])=>key==='目标面数' && value==='30000'));
  assert.ok(card.parameters.some(([key,value])=>key==='贴图质量' && value==='4K'));
  assert.equal(card.parameters.filter(([key])=>key==='Smart Poly').length, 1);
  assert.match(card.submission, /尚未提交/);
  assert.equal(card.expiry, modelQuote.estimate_expires_at);
  const result = ok({quote:modelQuote});
  assert.match(result.content[0].text, /40 积分/);
  assert.ok(!result.content[0].text.includes('"quote"'));
  assert.deepEqual(result.structuredContent.quote, modelQuote);
});
it('distinguishes expired, free, trial-discounted and unknown quotes', () => {
  const expired = quoteCard(modelQuote, Date.parse(modelQuote.estimate_expires_at));
  assert.equal(expired.status, '报价已过期');
  assert.equal(expired.caption, '上次预计费用');
  assert.equal(expired.amount, '40');
  const free = quoteCard({status:'free',estimated_credits:0,kind:'model.export'});
  assert.equal(free.amount, '0');
  assert.equal(free.status, '不消耗积分');
  const unknown = quoteCard({kind:'motion.generate',status:'unknown',estimated_credits:null,base_credits:null});
  assert.equal(unknown.amount, '待确认');
  assert.equal(unknown.known, false);
  assert.deepEqual(unknown.rows, []);
  assert.match(ok({quote:{status:'unknown',estimated_credits:null}}).content[0].text, /待确认/);
  const batch = quoteCard({...modelQuote,estimated_credits:12,base_credits:120,per_request_credits:30,request_count:4,discount_multiplier:0.2,free_requests_applied:2},Date.parse(modelQuote.quoted_at));
  assert.equal(batch.amount, '12');
  assert.deepEqual(batch.rows,[['请求数量','4'],['每次基础费用','30 积分'],['基础费用合计','120 积分'],['折扣系数','× 0.2'],['免费次数','2']]);
});
