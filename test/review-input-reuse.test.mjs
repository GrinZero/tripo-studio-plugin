import assert from 'node:assert/strict';
import { it } from 'node:test';
import { writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { makeRuntime } from './helpers/runtime.mjs';
import { solidImage } from './helpers/image-fixture.mjs';
import { OperationService } from '../src/ops/service.mjs';
import { ConfigurationReviews } from '../src/ui/reviews.mjs';

async function fixture() {
  const runtime = await makeRuntime();
  const counts = { uploads: 0, audits: 0, quotes: 0, submissions: 0 };
  runtime.gateway.requestTemporaryToken = async () => ({});
  runtime.gateway.auditImage = async () => { counts.audits++; return { result: 'pass' }; };
  runtime.uploader = { upload: async () => ({ bucket: 'inputs', key: `image-${++counts.uploads}` }) };
  runtime.gateway.submitModelGeneration = async payload => {
    counts.submissions++;
    assert.ok(payload.body.image.every(image => image.bucket === 'inputs' && image.key.startsWith('image-')));
    return [{ operator_id: 'operator', project_id: 'project' }];
  };
  runtime.pricing = { quote: async (kind, input, { task }) => {
    counts.quotes++;
    return { estimated_credits: task.settings.geometry_quality === 'detailed' ? 55 : 40 };
  } };
  runtime.service = new OperationService(runtime);
  const input = { mode: 'multiview', tier: 'high_detail', face_limit: 60000, geometry_quality: 'standard' };
  for (const [index, slot] of ['front', 'left', 'back', 'right'].entries()) {
    const file = path.join(runtime.config.dataDir, `${slot}.png`);
    await writeFile(file, await solidImage({ width: 16, height: 16, channels: 3, background: ['#112233', '#334455', '#556677', '#778899'][index] }));
    input[`${slot}_image_path`] = file;
  }
  let time = Date.now();
  const reviews = new ConfigurationReviews(runtime, { now:()=>time, schedule: () => 1, unschedule: () => {} });
  const initial = await reviews.create('model.generate', input, await runtime.service.prepare('model.generate', input));
  const save = async (values) => {
    const edited = await reviews.action({ review_id: initial.review.review_id, action: 'edit' });
    return reviews.action({ review_id: initial.review.review_id, action: 'save', revision: edited.review.revision, input: values });
  };
  return { runtime, counts, input, initial, reviews, save, advance:ms=>time+=ms, close: async () => {
    reviews.close();
    await Promise.all((await runtime.store.list({limit:100})).map(task => runtime.service.preupload(task.task_id).catch(() => {})));
    await rm(runtime.config.dataDir, { recursive: true, force: true });
  } };
}

async function waitForAudits(f, count) {
  for(let attempt=0;attempt<200&&f.counts.audits<count;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(f.counts.audits,count,'visibility must start background uploads and audit without another tool call');
}

it('visible form preuploads before generation; saving submits new parameters using those uploads', async () => {
  const f = await fixture();
  try {
    assert.equal(f.counts.uploads, 0);
    await f.reviews.action({review_id:f.initial.review.review_id, action:'ready'});
    await waitForAudits(f,4);
    assert.equal(f.counts.uploads, 4);
    assert.equal(f.counts.submissions, 0);
    const saved = await f.save({ ...f.input, geometry_quality: 'detailed' });
    assert.equal(f.counts.uploads, 4, 'settings-only save must not re-upload the four images');
    assert.equal(f.counts.audits, 4);
    assert.equal(saved.review.quote.estimated_credits, 55);
    assert.equal(saved.review.status, 'submitted');
    assert.equal(saved.review.deadline_at, null);
    assert.equal(saved.task.task_id, f.initial.task.draft_id);
    assert.equal(saved.task.snapshots.length, 4);
    assert.equal(saved.task.remote.operator_ids[0], 'operator');
    assert.equal((await f.runtime.store.list({limit:100})).length, 1);
    const frozen=await f.runtime.store.get(saved.task.task_id);
    assert.ok(frozen.dispatch_payload.body.image.every(image=>image.bucket==='inputs'));
    assert.equal(f.counts.submissions, 1);
  } finally { await f.close(); }
});

it('editing before visibility still preuploads immediately without arming automatic submission', async () => {
  const f = await fixture();
  try {
    const id=f.initial.review.review_id;
    await f.reviews.action({review_id:id,action:'edit'});
    const shown=await f.reviews.action({review_id:id,action:'ready'});
    await waitForAudits(f,4);
    assert.equal(shown.review.status,'editing');
    assert.equal(shown.review.deadline_at,null);
    assert.equal(f.counts.uploads,4);
    assert.equal(f.counts.submissions,0);
  } finally { await f.close(); }
});

it('saving the final configuration dispatches once even when an old deadline races it', async () => {
  const f = await fixture();
  try {
    const id=f.initial.review.review_id;
    await f.reviews.action({review_id:id,action:'ready'});
    const edit=await f.reviews.action({review_id:id,action:'edit'});
    f.advance(60000);
    await Promise.all([
      f.reviews.action({review_id:id,action:'save',revision:edit.review.revision,input:{...f.input,face_limit:6000}}),
      f.reviews.action({review_id:id,action:'confirm',automatic:true})
    ]);
    await f.reviews.action({review_id:id,action:'confirm'});
    const final = await f.reviews.action({review_id:id,action:'get'});
    assert.equal(final.task.task_id,f.initial.task.draft_id);
    assert.equal(final.task.effective_settings.face_limit,6000);
    assert.equal(f.counts.uploads,4);
    assert.equal(f.counts.submissions,1);
    assert.equal((await f.runtime.store.list({limit:100})).length,1);
  } finally { await f.close(); }
});

it('saving starts submission immediately and shares an in-flight upload before remote dispatch', async () => {
  const f = await fixture();
  let release, saving;
  const gate = new Promise(resolve => { release = resolve; });
  const original = f.runtime.uploader.upload;
  f.runtime.uploader.upload = async (...args) => { await gate; return original(...args); };
  try {
    await f.reviews.action({review_id:f.initial.review.review_id, action:'ready'});
    const background = f.runtime.service.preupload(f.initial.task.draft_id);
    saving = f.save({...f.input, face_limit:6000});
    // Wait for the persisted submission boundary, while the remote upload is blocked.
    for(let attempt=0;attempt<200;attempt++){
      if((await f.reviews.doc(f.initial.review.review_id).read()).status==='submitting')break;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    const current=await f.reviews.action({review_id:f.initial.review.review_id,action:'get'});
    assert.equal(current.review.status,'submitting');
    assert.equal(current.review.deadline_at,null);
    assert.equal(f.counts.submissions, 0);
    release();
    await background.catch(() => {});
    const saved=await saving;
    assert.equal(saved.review.status,'submitted');
    assert.equal(f.counts.uploads, 4);
    assert.equal(f.counts.submissions, 1);
  } finally { release(); await saving?.catch(()=>{}); await f.close(); }
});

it('replacing one view uploads only that view and durable cache survives a service restart', async () => {
  const f = await fixture();
  try {
    await f.runtime.service.preupload(f.initial.task.draft_id);
    await writeFile(f.input.left_image_path, await solidImage({width:16,height:16,channels:3,background:'#aabbcc'}));
    f.runtime.service = new OperationService(f.runtime);
    const saved = await f.save({...f.input, face_limit:6000});
    assert.equal(saved.review.status,'submitted');
    assert.equal(f.counts.uploads, 5);
    assert.equal(f.counts.submissions, 1);
  } finally { await f.close(); }
});

it('audit rejection before dispatch never sends a generation request or crosses the paid boundary', async () => {
  const f = await fixture();
  try {
    f.runtime.gateway.auditImage = async () => ({result:'reject'});
    await assert.rejects(f.runtime.service.preupload(f.initial.task.draft_id), error => error.code === 'CONTENT_AUDIT_REJECTED');
    const result = await f.reviews.action({review_id:f.initial.review.review_id, action:'confirm'});
    assert.equal(result.review.status, 'failed');
    assert.equal(result.task.paid_request_sent, false);
    assert.equal(f.counts.submissions, 0);
  } finally { await f.close(); }
});

it('upload cache is scoped to the account and cannot reuse another account\'s storage objects', async () => {
  const f = await fixture();
  try {
    await f.runtime.service.preupload(f.initial.task.draft_id);
    f.runtime.session.accountFingerprint = async () => 'other-account';
    const other = await f.runtime.service.prepare('model.generate',f.input);
    await f.runtime.service.preupload(other.task.task_id);
    assert.equal(f.counts.uploads,8);
    assert.equal(f.counts.submissions,0);
  } finally { await f.close(); }
});

it('saving changed settings computes the updated quote exactly once', async () => {
  const f = await fixture();
  try {
    const before = f.counts.quotes;
    await f.save({ ...f.input, face_limit: 6000 });
    assert.equal(f.counts.quotes - before, 1, 'save must not fetch pricing twice');
  } finally { await f.close(); }
});
