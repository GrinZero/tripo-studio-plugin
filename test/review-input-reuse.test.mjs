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

it('card mount preuploads images; parameter edits reuse them without submitting generation', async () => {
  const f = await fixture();
  try {
    assert.equal(f.counts.uploads, 0);
    await f.reviews.action({review_id:f.initial.review.review_id, action:'ready'});
    await f.runtime.service.preupload(f.initial.task.draft_id);
    assert.equal(f.counts.uploads, 4);
    assert.equal(f.counts.submissions, 0);
    const saved = await f.save({ ...f.input, geometry_quality: 'detailed' });
    await f.runtime.service.preupload(saved.task.draft_id);
    assert.equal(f.counts.uploads, 4, 'settings-only save must not re-upload the four images');
    assert.equal(f.counts.audits, 4);
    assert.equal(saved.review.quote.estimated_credits, 55);
    assert.equal(saved.task.draft_id, f.initial.task.draft_id);
    assert.equal(saved.task.snapshots.length, 4);
    assert.equal(saved.task.paid_request_sent, false);
    assert.equal(saved.task.task_id, undefined);
    assert.equal((await f.runtime.store.list({limit:100})).length, 1, 'saving edits cannot create extra task records');
    const submitted = await f.reviews.action({review_id:f.initial.review.review_id, action:'confirm'});
    assert.equal(submitted.task.task_id, f.initial.task.draft_id);
    assert.equal(submitted.task.remote.operator_ids[0], 'operator');
    const frozen=await f.runtime.store.get(submitted.task.task_id);
    assert.ok(frozen.dispatch_payload.body.image.every(image=>image.bucket==='inputs'));
    assert.equal(f.counts.uploads, 4);
    assert.equal(f.counts.submissions, 1);
  } finally { await f.close(); }
});

it('the 60-second deadline submits only the final configuration once when manual confirmation races it', async () => {
  const f = await fixture();
  try {
    await f.reviews.action({review_id:f.initial.review.review_id,action:'ready'});
    await f.runtime.service.preupload(f.initial.task.draft_id);
    const saved = await f.save({...f.input,face_limit:6000});
    await f.reviews.action({review_id:f.initial.review.review_id,action:'ready'});
    f.advance(59999);
    const before = await f.reviews.action({review_id:f.initial.review.review_id,action:'confirm',automatic:true});
    assert.equal(before.task.task_id,undefined);
    assert.equal(f.counts.submissions,0);
    f.advance(1);
    await Promise.all([
      f.reviews.action({review_id:f.initial.review.review_id,action:'confirm',automatic:true}),
      f.reviews.action({review_id:f.initial.review.review_id,action:'confirm'})
    ]);
    const final = await f.reviews.action({review_id:f.initial.review.review_id,action:'get'});
    assert.equal(final.task.task_id,saved.task.draft_id);
    assert.equal(final.task.effective_settings.face_limit,6000);
    assert.equal(f.counts.uploads,4);
    assert.equal(f.counts.submissions,1);
    assert.equal((await f.runtime.store.list({limit:100})).length,1);
  } finally { await f.close(); }
});

it('saving while an upload is blocked returns promptly and confirmation shares the in-flight upload', async () => {
  const f = await fixture();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const original = f.runtime.uploader.upload;
  f.runtime.uploader.upload = async (...args) => { await gate; return original(...args); };
  try {
    await f.reviews.action({review_id:f.initial.review.review_id, action:'ready'});
    const background = f.runtime.service.preupload(f.initial.task.draft_id);
    const saved = await f.save({...f.input, face_limit:6000});
    assert.equal(saved.review.status, 'pending');
    assert.equal(f.counts.submissions, 0);
    release();
    await background.catch(() => {});
    await f.reviews.action({review_id:f.initial.review.review_id, action:'confirm'});
    assert.equal(f.counts.uploads, 4);
    assert.equal(f.counts.submissions, 1);
  } finally { release(); await f.close(); }
});

it('replacing one view uploads only that view and durable cache survives a service restart', async () => {
  const f = await fixture();
  try {
    await f.runtime.service.preupload(f.initial.task.draft_id);
    await writeFile(f.input.left_image_path, await solidImage({width:16,height:16,channels:3,background:'#aabbcc'}));
    const saved = await f.save({...f.input, face_limit:6000});
    await f.runtime.service.preupload(saved.task.draft_id);
    assert.equal(f.counts.uploads, 5);
    f.runtime.service = new OperationService(f.runtime);
    await f.reviews.action({review_id:f.initial.review.review_id, action:'confirm'});
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
