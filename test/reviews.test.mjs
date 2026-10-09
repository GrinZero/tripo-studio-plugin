import assert from 'node:assert/strict';
import {it} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ConfigurationReviews} from '../src/ui/reviews.mjs';
async function fixture(){
 const dir=await mkdtemp(path.join(tmpdir(),'tripo-review-'));let time=1000,submits=0;const tasks=new Map(),scheduled=new Map();
 const input={mode:'text',tier:'high_detail',face_limit:60000,prompt:'stone arch',geometry_quality:'standard',texture:true,texture_quality:'detailed',pbr:true,delight:true};
 const service={
  async prepare(kind,values){const task={task_id:randomUUID(),account_fingerprint:'account',kind,status:'staged',confirmation:'CONFIRM',request_hash:'a'.repeat(64),cost_estimate:{estimated_credits:values.geometry_quality==='detailed'?55:40},effective_settings:values};tasks.set(task.task_id,task);return {task};},
  async get(id){return {task:{...tasks.get(id)}};},async cancel(id){tasks.get(id).status='canceled';},
  async submit(id){submits++;tasks.get(id).status='queued';return {task:tasks.get(id)};}
 };
 const runtime={config:{dataDir:dir},session:{accountFingerprint:async()=>'account'},service};
 const opts={now:()=>time,schedule:(fn,delay)=>{const token=randomUUID();scheduled.set(token,{fn,delay});return token;},unschedule:token=>scheduled.delete(token)};
 const reviews=new ConfigurationReviews(runtime,opts);
 const initial=await service.prepare('model.generate',input);const output=await reviews.create('model.generate',input,initial);
 return {dir,input,runtime,opts,reviews,output,tasks,scheduled,submits:()=>submits,advance:ms=>time+=ms,close:async()=>{reviews.close();await rm(dir,{recursive:true,force:true});}};
}
it('a delayed card mount cannot consume the edit window or submit an unseen configuration',async()=>{
 const f=await fixture();try{
  f.advance(120000);
  await f.reviews.action({review_id:f.output.review.review_id,action:'confirm',automatic:true});
  assert.equal(f.submits(),0,'the card has not been displayed, so automatic submission must not run');
  assert.equal(f.scheduled.size,0);
  assert.equal(f.output.review.deadline_at,null);
 }finally{await f.close();}
});
it('a 60-second deadline submits once even when confirmation races the timer',async()=>{
 const f=await fixture();try{const shown=await f.reviews.action({review_id:f.output.review.review_id,action:'ready'});assert.equal(shown.review.deadline_at,61000);assert.equal(f.submits(),0);f.advance(60000);
 await Promise.all([f.reviews.action({review_id:f.output.review.review_id,action:'confirm',automatic:true}),f.reviews.action({review_id:f.output.review.review_id,action:'confirm'})]);assert.equal(f.submits(),1);
 const result=await f.reviews.action({review_id:f.output.review.review_id,action:'get'});assert.equal(result.review.status,'submitted');assert.equal(result.task.status,'queued');}finally{await f.close();}
});
it('visibility acknowledgements are idempotent and do not invalidate simultaneous editing',async()=>{
 const f=await fixture();try{const id=f.output.review.review_id;
  const shown=await f.reviews.action({review_id:id,action:'ready',revision:0});
  f.advance(30000);
  const again=await f.reviews.action({review_id:id,action:'ready',revision:0});
  assert.equal(again.review.deadline_at,shown.review.deadline_at);
  assert.equal(again.review.revision,0);
  await f.reviews.action({review_id:id,action:'edit',revision:0});
  await f.reviews.action({review_id:id,action:'ready'});
  f.advance(120000);
  const result=await f.reviews.action({review_id:id,action:'confirm',automatic:true});
  assert.equal(result.review.status,'editing');assert.equal(result.review.deadline_at,null);assert.equal(f.submits(),0);
 }finally{await f.close();}
});
it('only controls displayed in a visible document can start the server deadline',async()=>{
 const {watchConfigurationVisibility}=await import('../ui/configuration-visibility.mjs');
 const f=await fixture();let listener,intersect;
 const doc={visibilityState:'hidden',addEventListener(type,fn){listener=fn;},removeEventListener(){listener=null;}};
 class Observer {constructor(fn){intersect=fn;}observe(){}disconnect(){}}
 const element={},watch=watchConfigurationVisibility(element,()=>f.reviews.action({review_id:f.output.review.review_id,action:'ready'}),{doc,Observer});
 const flush=()=>new Promise(resolve=>setTimeout(resolve,20));
 try{
  f.advance(120000);intersect([{target:element,isIntersecting:true}]);await flush();assert.equal(f.scheduled.size,0);
  intersect([{target:element,isIntersecting:false}]);doc.visibilityState='visible';listener();await flush();assert.equal(f.scheduled.size,0);
  intersect([{target:element,isIntersecting:true}]);await flush();
  const shown=await f.reviews.action({review_id:f.output.review.review_id,action:'get'});assert.equal(shown.review.deadline_at,181000);assert.equal(f.submits(),0);
  f.advance(59999);await f.reviews.action({review_id:f.output.review.review_id,action:'confirm',automatic:true});assert.equal(f.submits(),0);
  f.advance(1);await f.reviews.action({review_id:f.output.review.review_id,action:'confirm',automatic:true});assert.equal(f.submits(),1);
 }finally{watch.dispose();await f.close();}
});
it('editing pauses automatic dispatch; saving validates, replaces the draft, requotes and restarts the clock',async()=>{
 const f=await fixture();try{const id=f.output.review.review_id;const edit=await f.reviews.action({review_id:id,action:'edit',revision:0});f.advance(120000);
 await f.reviews.action({review_id:id,action:'confirm',automatic:true});assert.equal(f.submits(),0);assert.equal(f.scheduled.size,0);
 await assert.rejects(f.reviews.action({review_id:id,action:'save',revision:edit.review.revision,input:{...f.input,face_limit:'wrong'}}));
 const saved=await f.reviews.action({review_id:id,action:'save',revision:edit.review.revision,input:{...f.input,geometry_quality:'detailed'}});
 assert.equal(saved.review.quote.estimated_credits,55);assert.equal(saved.review.deadline_at,null);const shown=await f.reviews.action({review_id:id,action:'ready'});assert.equal(shown.review.deadline_at,181000);assert.notEqual(saved.task.task_id,f.output.task.task_id);assert.equal(f.tasks.get(f.output.task.task_id).status,'canceled');
 await assert.rejects(f.reviews.action({review_id:id,action:'confirm',revision:0}));assert.equal(f.submits(),0);
 await f.reviews.action({review_id:id,action:'confirm',revision:saved.review.revision});assert.equal(f.submits(),1);
 }finally{await f.close();}
});
it('cancel prevents the previously scheduled deadline from submitting',async()=>{const f=await fixture();try{await f.reviews.action({review_id:f.output.review.review_id,action:'ready'});await f.reviews.action({review_id:f.output.review.review_id,action:'cancel'});f.advance(60000);await f.reviews.action({review_id:f.output.review.review_id,action:'confirm',automatic:true});assert.equal(f.submits(),0);assert.equal(f.scheduled.size,0);}finally{await f.close();}});
it('a restarted process waits for visible controls again and never retries interrupted submissions',async()=>{const f=await fixture();try{await f.reviews.action({review_id:f.output.review.review_id,action:'ready'});f.reviews.close();const restored=new ConfigurationReviews(f.runtime,f.opts);f.advance(120000);await restored.recover();assert.equal(f.scheduled.size,0);const recovered=await restored.action({review_id:f.output.review.review_id,action:'confirm',automatic:true});assert.equal(recovered.review.deadline_at,null);assert.equal(f.submits(),0);const shown=await restored.action({review_id:f.output.review.review_id,action:'ready'});assert.equal(shown.review.deadline_at,181000);assert.equal(f.scheduled.size,1);await restored.doc(f.output.review.review_id).update(r=>({...r,status:'submitting'}));restored.close();const again=new ConfigurationReviews(f.runtime,f.opts);await again.recover();assert.equal((await again.action({review_id:f.output.review.review_id,action:'get'})).review.status,'failed');assert.equal(f.submits(),0);again.close();}finally{await f.close();}});
it('an ambiguous submit failure is recorded without automatic retry',async()=>{const f=await fixture();try{f.runtime.service.submit=async()=>{throw Error('network lost after dispatch');};const r=await f.reviews.action({review_id:f.output.review.review_id,action:'confirm'});assert.equal(r.review.status,'failed');await f.reviews.action({review_id:f.output.review.review_id,action:'confirm'});assert.equal(f.scheduled.size,0);}finally{await f.close();}});
it('expired quotes pause the deadline and account changes cannot submit',async()=>{const f=await fixture();try{await f.reviews.action({review_id:f.output.review.review_id,action:'ready'});f.tasks.get(f.output.task.task_id).cost_estimate.estimate_expires_at=new Date(0).toISOString();f.advance(60000);const r=await f.reviews.action({review_id:f.output.review.review_id,action:'confirm',automatic:true});assert.equal(r.review.status,'editing');assert.equal(f.submits(),0);f.runtime.session.accountFingerprint=async()=>'another';await assert.rejects(f.reviews.action({review_id:f.output.review.review_id,action:'confirm'}));}finally{await f.close();}});
it('configuration thumbnails read verified snapshots and reject changed files or another account',async()=>{
 const {makeRuntime}=await import('./helpers/runtime.mjs');const sharp=(await import('sharp')).default;
 const {writeFile,chmod}=await import('node:fs/promises');const {snapshotDirectory}=await import('../src/ops/images.mjs');
 const runtime=await makeRuntime();const reviews=new ConfigurationReviews(runtime,{schedule:()=>1,unschedule:()=>{}});
 try{
  const image=path.join(runtime.config.dataDir,'input.png');await writeFile(image,await sharp({create:{width:32,height:32,channels:3,background:'#628c61'}}).png().toBuffer());
  const input={image_path:image,left:0,top:0,width:16,height:16,submit:false};
  const output=await reviews.create('local.crop',input,await runtime.service.prepare('local.crop',input));
  assert.equal(output.review.sources.length,1);const slot=output.review.sources[0].slot;
  const preview=await reviews.preview(output.review.review_id,slot);assert.ok(preview.data_url.startsWith('data:image/webp;base64,'));
  await assert.rejects(reviews.preview(output.review.review_id,'../../other-file'));
  const frozen=await runtime.store.get(output.task.task_id);const file=path.join(snapshotDirectory(runtime.config,frozen.task_id),path.basename(frozen.snapshots[0].relative_path));
  await chmod(file,0o600);await writeFile(file,await sharp({create:{width:32,height:32,channels:3,background:'#ff0000'}}).png().toBuffer());
  await assert.rejects(reviews.preview(output.review.review_id,slot),/provenance/);
  await reviews.doc(output.review.review_id).update(r=>({...r,account_fingerprint:'another-account'}));
  await assert.rejects(reviews.preview(output.review.review_id,slot),/another account/);
 }finally{reviews.close();await rm(runtime.config.dataDir,{recursive:true,force:true});}
});
