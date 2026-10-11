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
  async prepare(kind,values,options={}){const task={task_id:options.draftId ?? randomUUID(),account_fingerprint:'account',kind,status:'staged',configuration_input:values,confirmation:'CONFIRM',request_hash:'a'.repeat(64),cost_estimate:{estimated_credits:values.geometry_quality==='detailed'?55:40},effective_settings:values};tasks.set(task.task_id,task);return {task};},
  async get(id){return {task:{...tasks.get(id)}};},async cancel(id){tasks.get(id).status='canceled';},
  async submit(id){submits++;tasks.get(id).status='queued';tasks.get(id).remote={operator_id:'operator'};return {task:tasks.get(id)};}
 };
 const runtime={config:{dataDir:dir},session:{accountFingerprint:async()=>'account'},service,store:{get:async id=>tasks.get(id)}};
 const opts={now:()=>time,schedule:(fn,delay)=>{const token=randomUUID();scheduled.set(token,{fn,delay});return token;},unschedule:token=>scheduled.delete(token)};
 const reviews=new ConfigurationReviews(runtime,opts);
 const initial=await service.prepare('model.generate',input);const output=await reviews.create('model.generate',input,initial);
 return {dir,input,runtime,opts,reviews,output,tasks,scheduled,submits:()=>submits,advance:ms=>time+=ms,close:async()=>{reviews.close();await rm(dir,{recursive:true,force:true});}};
}
it('legacy draft forms do not auto-submit on display but saving submits immediately, once',async()=>{
 const f=await fixture();try{
  const prepared=await f.runtime.service.prepare('model.generate',{...f.input,prompt:'manual draft'});
  const output=await f.reviews.create('model.generate',prepared.task.configuration_input,prepared,{autoSubmit:false});
  const id=output.review.review_id;
  assert.equal(output.review.auto_submit,false);assert.equal(output.task.task_id,undefined);
  await f.reviews.action({review_id:id,action:'ready'});
  f.advance(120000);
  await f.reviews.action({review_id:id,action:'confirm',automatic:true});
  const edit=await f.reviews.action({review_id:id,action:'edit'});
  const saved=await f.reviews.action({review_id:id,action:'save',revision:edit.review.revision,input:{...output.review.input,face_limit:24000}});
  assert.equal(saved.task.task_id,output.task.draft_id);assert.equal(saved.review.status,"submitted");assert.equal(saved.review.auto_submit,false);
  f.reviews.close();const restored=new ConfigurationReviews(f.runtime,f.opts);
  try{await restored.recover();await restored.action({review_id:id,action:'ready'});f.advance(120000);
   const current=await restored.action({review_id:id,action:'confirm',automatic:true});
   assert.equal(current.review.deadline_at,null);assert.equal(current.review.input.face_limit,24000);
   assert.equal(f.scheduled.size,0);assert.equal(f.submits(),1);
   await restored.action({review_id:id,action:'confirm'});assert.equal(f.submits(),1);
  }finally{restored.close();}
 }finally{await f.close();}
});
it('a draft-only deduplicated request disables an existing deadline without discarding edits',async()=>{
 const f=await fixture();try{
  const id=f.output.review.review_id;
  await f.reviews.action({review_id:id,action:'ready'});
  const manual=await f.reviews.create('model.generate',f.input,await f.runtime.service.get(id),{autoSubmit:false});
  assert.equal(manual.review.auto_submit,false);assert.equal(manual.review.deadline_at,null);assert.equal(f.scheduled.size,0);
  const edit=await f.reviews.action({review_id:id,action:'edit'});
  const same=await f.reviews.create('model.generate',{...f.input,face_limit:12000},await f.runtime.service.get(id),{autoSubmit:false});
  assert.equal(same.review.status,'editing');assert.equal(same.review.revision,edit.review.revision);
  assert.equal(same.review.input.face_limit,f.input.face_limit);assert.equal(same.review.auto_submit,false);
  f.advance(120000);await f.reviews.action({review_id:id,action:'confirm',automatic:true});assert.equal(f.submits(),0);
 }finally{await f.close();}
});
it('the Agent form entrypoint restores automatic review for a reused manual draft without submitting it',async()=>{
 const f=await fixture();try{
  const prepared=await f.runtime.service.prepare('model.generate',f.input),id=prepared.task.task_id;
  await f.reviews.create('model.generate',f.input,prepared,{autoSubmit:false});
  const automatic=await f.reviews.create('model.generate',f.input,prepared);
  assert.equal(automatic.review.auto_submit,true);assert.equal(automatic.review.deadline_at,null);
  assert.equal(automatic.task.draft_id,id);assert.equal(f.submits(),0);
  const shown=await f.reviews.action({review_id:id,action:'ready'});
  assert.equal(shown.review.deadline_at,61000);assert.equal(f.submits(),0);
 }finally{await f.close();}
});
it('reopens an existing draft with complete inputs and preserves its identity and account ownership',async()=>{
 const f=await fixture();try{
  const input={...f.input,prompt:'long prompt '.repeat(80)};
  const prepared=await f.runtime.service.prepare('model.generate',input);
  const size=f.tasks.size,id=prepared.task.task_id;
  const output=await f.reviews.openDraft(id);
  assert.equal(output.review.input.prompt,input.prompt);assert.equal(output.task.draft_id,id);
  assert.equal(output.review.auto_submit,false);assert.equal(f.tasks.size,size);assert.equal(f.submits(),0);
  assert.deepEqual(await f.reviews.openDraft(id),output);
  f.runtime.session.accountFingerprint=async()=>'another-account';
  await assert.rejects(f.reviews.openDraft(id),/another account/);
 }finally{await f.close();}
});
it('legacy drafts recover complete summaries but reject truncated inputs and submitted work',async()=>{
 const f=await fixture();try{
  const prepared=await f.runtime.service.prepare('model.generate',f.input),task=prepared.task;
  delete task.configuration_input;task.input_summary=f.input;
  const output=await f.reviews.openDraft(task.task_id);
  assert.equal(output.review.input.prompt,f.input.prompt);assert.equal(output.review.auto_submit,false);
  const truncated=(await f.runtime.service.prepare('model.generate',f.input)).task;
  delete truncated.configuration_input;truncated.input_summary={...f.input,prompt:'x'.repeat(300)+'…'};
  await assert.rejects(f.reviews.openDraft(truncated.task_id),error=>error.code==='DRAFT_CONFIGURATION_UNAVAILABLE');
  const submitted=(await f.runtime.service.prepare('model.generate',f.input)).task;submitted.status='queued';
  await assert.rejects(f.reviews.openDraft(submitted.task_id),error=>error.code==='STAGING_REQUIRED');
  assert.equal(f.submits(),0);
 }finally{await f.close();}
});
it('durable draft recovery preserves a long prompt when other settings are edited',async()=>{
 const {makeRuntime}=await import('./helpers/runtime.mjs');
 const runtime=await makeRuntime(),reviews=new ConfigurationReviews(runtime);
 try{
  runtime.gateway.submitModelGeneration=async()=>[{operator_id:"mock-operator",project_id:"mock-project"}];
  const prompt='a crane with a curved wing root '.repeat(20);
  const input={mode:'text',tier:'high_detail',face_limit:60000,prompt,submit:false};
  const prepared=await runtime.service.prepare('model.generate',input),id=prepared.task.task_id;
  assert.notEqual(prepared.task.input_summary.prompt,prompt,'public summaries stay bounded');
  assert.equal(prepared.task.configuration_input,undefined,'complete editable inputs stay private until a form is opened');
  const recovered=await reviews.openDraft(id);
  assert.equal(recovered.review.input.prompt,prompt);
  const editing=await reviews.action({review_id:id,action:'edit'});
  await reviews.action({review_id:id,action:'save',revision:editing.review.revision,input:{...editing.review.input,face_limit:24000}});
  const stored=await runtime.store.get(id);
  assert.equal(stored.configuration_input.prompt,prompt);
  assert.equal(stored.status,'queued');assert.equal(stored.remote.operator_ids[0],'mock-operator');
 }finally{reviews.close();await rm(runtime.config.dataDir,{recursive:true,force:true});}
});
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
it('editing pauses automatic dispatch; saving validates, requotes and immediately submits the same task',async()=>{
 const f=await fixture();try{const id=f.output.review.review_id;const edit=await f.reviews.action({review_id:id,action:'edit',revision:0});f.advance(120000);
 await f.reviews.action({review_id:id,action:'confirm',automatic:true});assert.equal(f.submits(),0);assert.equal(f.scheduled.size,0);
 await assert.rejects(f.reviews.action({review_id:id,action:'save',revision:edit.review.revision,input:{...f.input,face_limit:'wrong'}}));
 const saved=await f.reviews.action({review_id:id,action:'save',revision:edit.review.revision,input:{...f.input,geometry_quality:'detailed'}});
 assert.equal(saved.review.quote.estimated_credits,55);assert.equal(saved.review.deadline_at,null);assert.equal(saved.review.status,'submitted');assert.equal(saved.task.task_id,f.output.task.draft_id);assert.equal(f.tasks.get(f.output.task.draft_id).status,'queued');assert.equal(f.scheduled.size,0);
 await assert.rejects(f.reviews.action({review_id:id,action:'confirm',revision:0}));assert.equal(f.submits(),1);
 await f.reviews.action({review_id:id,action:'confirm',revision:saved.review.revision});assert.equal(f.submits(),1);
 }finally{await f.close();}
});
it('cancel prevents the previously scheduled deadline from submitting',async()=>{const f=await fixture();try{await f.reviews.action({review_id:f.output.review.review_id,action:'ready'});await f.reviews.action({review_id:f.output.review.review_id,action:'cancel'});f.advance(60000);await f.reviews.action({review_id:f.output.review.review_id,action:'confirm',automatic:true});assert.equal(f.submits(),0);assert.equal(f.scheduled.size,0);}finally{await f.close();}});
it('a restarted process waits for visible controls again and never retries interrupted submissions',async()=>{const f=await fixture();try{await f.reviews.action({review_id:f.output.review.review_id,action:'ready'});f.reviews.close();const restored=new ConfigurationReviews(f.runtime,f.opts);f.advance(120000);await restored.recover();assert.equal(f.scheduled.size,0);const recovered=await restored.action({review_id:f.output.review.review_id,action:'confirm',automatic:true});assert.equal(recovered.review.deadline_at,null);assert.equal(f.submits(),0);const shown=await restored.action({review_id:f.output.review.review_id,action:'ready'});assert.equal(shown.review.deadline_at,181000);assert.equal(f.scheduled.size,1);await restored.doc(f.output.review.review_id).update(r=>({...r,status:'submitting'}));restored.close();const again=new ConfigurationReviews(f.runtime,f.opts);await again.recover();assert.equal((await again.action({review_id:f.output.review.review_id,action:'get'})).review.status,'failed');assert.equal(f.submits(),0);again.close();}finally{await f.close();}});
it('an ambiguous submit failure is recorded without automatic retry',async()=>{const f=await fixture();try{f.runtime.service.submit=async()=>{throw Error('network lost after dispatch');};const r=await f.reviews.action({review_id:f.output.review.review_id,action:'confirm'});assert.equal(r.review.status,'failed');await f.reviews.action({review_id:f.output.review.review_id,action:'confirm'});assert.equal(f.scheduled.size,0);}finally{await f.close();}});
it('expired quotes pause the deadline and account changes cannot submit',async()=>{const f=await fixture();try{await f.reviews.action({review_id:f.output.review.review_id,action:'ready'});f.tasks.get(f.output.task.draft_id).cost_estimate.estimate_expires_at=new Date(0).toISOString();f.advance(60000);const r=await f.reviews.action({review_id:f.output.review.review_id,action:'confirm',automatic:true});assert.equal(r.review.status,'editing');assert.equal(f.submits(),0);f.runtime.session.accountFingerprint=async()=>'another';await assert.rejects(f.reviews.action({review_id:f.output.review.review_id,action:'confirm'}));}finally{await f.close();}});
it('configuration thumbnails read verified snapshots and reject changed files or another account',async()=>{
 const {makeRuntime}=await import('./helpers/runtime.mjs');const {solidImage}=await import('./helpers/image-fixture.mjs');
 const {writeFile,chmod}=await import('node:fs/promises');const {snapshotDirectory}=await import('../src/ops/images.mjs');
 const runtime=await makeRuntime();const reviews=new ConfigurationReviews(runtime,{schedule:()=>1,unschedule:()=>{}});
 try{
  const image=path.join(runtime.config.dataDir,'input.png');await writeFile(image,await solidImage({width:32,height:32,channels:3,background:'#628c61'}));
  const input={image_path:image,left:0,top:0,width:16,height:16,submit:false};
  const output=await reviews.create('local.crop',input,await runtime.service.prepare('local.crop',input));
  assert.equal(output.review.sources.length,1);const slot=output.review.sources[0].slot;
  const preview=await reviews.preview(output.review.review_id,slot);assert.ok(preview.data_url.startsWith('data:image/webp;base64,'));
  await assert.rejects(reviews.preview(output.review.review_id,'../../other-file'));
  const frozen=await runtime.store.get(output.task.draft_id);const file=path.join(snapshotDirectory(runtime.config,frozen.task_id),path.basename(frozen.snapshots[0].relative_path));
  await chmod(file,0o600);await writeFile(file,await solidImage({width:32,height:32,channels:3,background:'#ff0000'}));
  await assert.rejects(reviews.preview(output.review.review_id,slot),/provenance/);
  await reviews.doc(output.review.review_id).update(r=>({...r,account_fingerprint:'another-account'}));
  await assert.rejects(reviews.preview(output.review.review_id,slot),/another account/);
 }finally{reviews.close();await rm(runtime.config.dataDir,{recursive:true,force:true});}
});

it('Agent waits across visibility and countdown until the current submission receipt arrives',async()=>{
 const f=await fixture();let transition;
 try{
  const id=f.output.review.review_id;
  assert.deepEqual(f.output.next_action,{tool:'tripo_get_configuration_review',arguments:{review_id:id,wait_ms:60000},requires_user_action:false});
  const waiting=f.reviews.wait(id,2000);
  transition=new Promise((resolve,reject)=>setTimeout(async()=>{try{
    await f.reviews.action({review_id:id,action:'ready'});
    f.advance(60000);
    await f.reviews.action({review_id:id,action:'confirm',automatic:true});resolve();
  }catch(error){reject(error);}},30));
  const result=await waiting;await transition;
  assert.equal(result.review.status,'submitted');assert.equal(result.task.task_id,id);
  assert.deepEqual(result.next_action,{tool:'tripo_task_wait',arguments:{task_id:id,timeout_seconds:60},requires_user_action:false});
  assert.equal(f.submits(),1);
 }finally{await transition?.catch(()=>{});await f.close();}
});
it('read-only waits time out while unseen without starting the deadline or creating a task',async()=>{
 const f=await fixture();try{
  const id=f.output.review.review_id,before=await f.reviews.doc(id).read();
  const result=await f.reviews.wait(id,50);
  assert.equal(result.review.status,'pending');assert.equal(result.review.deadline_at,null);
  assert.equal(result.next_action.requires_user_action,false);
  assert.deepEqual(await f.reviews.doc(id).read(),before);
  assert.equal(f.submits(),0);assert.equal(f.tasks.size,1);assert.equal(f.scheduled.size,0);
  await assert.rejects(f.reviews.wait(id,60001),error=>error.code==='INVALID_INPUT');
 }finally{await f.close();}
});
it('waiting stops for edits, cancellation and failure instead of dispatching or requesting bypasses',async()=>{
 const f=await fixture();try{
  const id=f.output.review.review_id;
  await f.reviews.action({review_id:id,action:'edit'});
  const edited=await f.reviews.wait(id,60000);
  assert.equal(edited.review.status,'editing');assert.equal(edited.next_action.requires_user_action,true);
  await f.reviews.action({review_id:id,action:'cancel'});
  const canceled=await f.reviews.wait(id,60000);
  assert.equal(canceled.review.status,'canceled');assert.equal(canceled.next_action,null);assert.equal(f.submits(),0);
  await f.reviews.doc(id).update(r=>({...r,status:'failed',error:{code:'TEST_ERROR',message:'actual submit error'}}));
  const failed=await f.reviews.wait(id,60000);
  assert.equal(failed.review.error.code,'TEST_ERROR');assert.equal(failed.next_action,null);assert.equal(f.submits(),0);
 }finally{await f.close();}
});
it('waiting continues through an in-flight submission until its receipt is persisted',async()=>{
 const f=await fixture();let release,submitting;
 const gate=new Promise(resolve=>{release=resolve;});
 const submit=f.runtime.service.submit;f.runtime.service.submit=async(...args)=>{await gate;return submit(...args);};
 try{
  const id=f.output.review.review_id;
  submitting=f.reviews.action({review_id:id,action:'confirm'});
  for(let attempt=0;attempt<100&&(await f.reviews.doc(id).read()).status!=='submitting';attempt++)await new Promise(resolve=>setTimeout(resolve,10));
  const inFlight=await f.reviews.action({review_id:id,action:'get'});
  assert.equal(inFlight.review.status,'submitting');assert.equal(inFlight.next_action.requires_user_action,false);
  const waiting=f.reviews.wait(id,2000);release();
  const result=await waiting;await submitting;
  assert.equal(result.review.status,'submitted');assert.equal(f.submits(),1);
 }finally{release();await submitting?.catch(()=>{});await f.close();}
});
