import path from 'node:path';
import { convertImage } from '../util/image-processing.mjs';
import { verifySnapshot } from '../ops/images.mjs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import { JsonDocument } from '../store/jsondoc.mjs';
import { FileLock } from '../store/lock.mjs';
import { getOperation } from '../ops/registry.mjs';
import { taskContextShape } from '../ops/task-groups.mjs';
import { TripoError, errorSnapshot } from '../errors.mjs';

const idPattern = /^[0-9a-f-]{36}$/i;
const editableStates = new Set(['pending','editing']);
export class ConfigurationReviews {
  constructor(runtime, { timeoutMs = 60000, now = Date.now, schedule = setTimeout, unschedule = clearTimeout } = {}) {
    this.runtime=runtime;this.dir=path.join(runtime.config.dataDir,'reviews');
    this.lock=new FileLock(path.join(runtime.config.dataDir,'locks'));
    this.timeoutMs=timeoutMs;this.now=now;this.schedule=schedule;this.unschedule=unschedule;this.timers=new Map();
  }
  doc(id) { if(!idPattern.test(id))throw new TripoError('INVALID_INPUT','Invalid configuration card id.');return new JsonDocument(path.join(this.dir,`${id}.json`)); }
  schema(kind) { return z.object({...getOperation(kind).inputShape,...taskContextShape}).strict(); }
  async owned(record) {
    if(!record)throw new TripoError('PLAN_NOT_FOUND','Configuration card does not exist.');
    const fingerprint=getOperation(record.kind).category==='local' ? 'local' : await this.runtime.session.accountFingerprint();
    if(record.account_fingerprint!==fingerprint)throw new TripoError('PLAN_MISMATCH','Configuration card belongs to another account.');
    return record;
  }
  stop(id) { if(this.timers.has(id)){this.unschedule(this.timers.get(id));this.timers.delete(id);} }
  arm(record) {
    this.stop(record.review_id);
    if(record.status!=='pending'||!Number.isFinite(record.deadline_at))return;
    const timer=this.schedule(()=>{this.timers.delete(record.review_id);this.action({review_id:record.review_id,action:'confirm',automatic:true}).catch(async error=>{await this.doc(record.review_id).update(r=>r.status==='pending'?{...r,status:'failed',deadline_at:null,error:errorSnapshot(error),revision:r.revision+1}:r).catch(()=>{});});},Math.max(0,record.deadline_at-this.now()));
    timer?.unref?.();this.timers.set(record.review_id,timer);
  }
  close() { for(const id of this.timers.keys())this.stop(id); }
  preupload(record) {
    if(getOperation(record.kind).category==='local')return;
    // Background optimization only: never block the card, saving or the clock.
    this.runtime.service.preupload?.(record.task_id).catch(()=>{});
  }
  async recover() {
    const files=await readdir(this.dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
    for(const file of files.filter(f=>f.endsWith('.json'))){
      const record=await new JsonDocument(path.join(this.dir,file)).read();
      // A recovered process has no evidence that the card is still displayed.
      // Require a new app visibility acknowledgement before restarting the window.
      if(record.status==='pending')await this.doc(record.review_id).update(r=>r.status==='pending'?{...r,deadline_at:null,revision:r.revision+1}:r);
      // A process may have died after dispatch. Read the durable task; never retry the write.
      if(record.status==='submitting' && !this.processAlive(record.submitting_pid))await this.doc(record.review_id).update(r=>({...r,status:'failed',error:{code:'SUBMISSION_INTERRUPTED',message:'提交被中断，请查看任务状态；不会自动重试。'}}));
    }
  }
  processAlive(pid) { if(!pid)return false;try{process.kill(pid,0);return true;}catch{return false;} }
  async preview(reviewId,slot) {
    const record=await this.owned(await this.doc(reviewId).read());
    const task=await this.runtime.store.get(record.task_id);
    const snapshot=task.snapshots?.find(s=>s.slot===slot && ['png','jpeg','jpg','webp'].includes(s.format));
    if(!snapshot){const source=task.metadata?.studio_inputs?.find(s=>s.slot===slot);if(source && this.runtime.media)return this.runtime.media.preview({asset_id:source.asset_id,output_index:source.output_index,type:'image'});}
    if(!snapshot)throw new TripoError('PREVIEW_UNAVAILABLE','此视图暂时没有图片。');
    const file=await verifySnapshot(this.runtime.config,task.task_id,snapshot);
    if((await stat(file)).size>20*1024*1024)throw new TripoError('PREVIEW_UNAVAILABLE','输入图片超过预览大小限制。');
    const bytes=await convertImage(await readFile(file), { autoOrient: true, maxSize: 640, format: 'webp', quality: 85 });
    return {mime_type:'image/webp',data_url:`data:image/webp;base64,${bytes.toString('base64')}`,bytes:bytes.length};
  }
  async output(record) {
    const {task}=await this.runtime.service.get(record.task_id);
    if(editableStates.has(record.status) && task.status!=='staged') {
      record=await this.doc(record.review_id).update(r=>({...r,status:task.status==='canceled'?'canceled':task.status==='expired'?'failed':'submitted',deadline_at:null,revision:r.revision+1}));
      this.stop(record.review_id);
    }
    // The local draft handle is useful for editing, but is not a submitted task.
    const visibleTask={...task};
    if(!task.remote && task.dispatch_state!=='submitted' && task.status!=='outcome_unknown') {
      visibleTask.draft_id=record.task_id;
      delete visibleTask.task_id;
    }
    return {review:{review_id:record.review_id,kind:record.kind,status:record.status,revision:record.revision,
      deadline_at:record.deadline_at,timeout_seconds:this.timeoutMs/1000,input:record.input,
      sources:[...(task.snapshots?.filter(s=>['png','jpeg','jpg','webp'].includes(s.format)).map(s=>({slot:s.slot,name:s.source_name,label:s.label})) ?? []),...(task.metadata?.studio_inputs?.map(s=>({slot:s.slot,name:s.slot,label:s.slot})) ?? [])],
      schema:z.toJSONSchema(this.schema(record.kind),{io:'input',unrepresentable:'any'}),quote:task.cost_estimate,error:record.error ?? null},task:visibleTask};
  }
  async create(kind,input,prepared) {
    const id=prepared.task.task_id;
    const record=await this.lock.withLock(`review-${id}`,async()=>{
      const old=await this.doc(id).read();if(old)return this.owned(old);
      const parsed=this.schema(kind).parse({...input,submit:false});
      // Expose the actual normalized defaults, while keeping only schema-supported keys.
      for(const [key,value] of Object.entries(prepared.task.effective_settings ?? {}))
        if(key in this.schema(kind).shape && parsed[key]===undefined && value!==undefined)parsed[key]=value;
      const r={review_id:id,task_id:id,kind,input:parsed,account_fingerprint:prepared.task.account_fingerprint,
        status:'pending',revision:0,deadline_at:null};
      await this.doc(id).write(r);return r;
    });
    this.arm(record);return {...prepared,...await this.output(record)};
  }
  async action({review_id,action,revision,input,automatic=false}) {
    let dispatch;
    const record=await this.lock.withLock(`review-${review_id}`,async()=>{
      let r=await this.owned(await this.doc(review_id).read());
      if(action==='get')return r;
      if(automatic && (r.status!=='pending'||!Number.isFinite(r.deadline_at)||r.deadline_at>this.now())){this.arm(r);return r;}
      if(revision!==undefined && revision!==r.revision)throw new TripoError('PLAN_MISMATCH','配置已更新，请刷新卡片。');
      if(!editableStates.has(r.status))return r;
      if(action==='ready') {
        // App-only acknowledgement: repeated polls/renders must not extend the deadline.
        if(r.status!=='pending'||Number.isFinite(r.deadline_at))return r;
        r.deadline_at=this.now()+this.timeoutMs;
        // Starting the clock must not invalidate a simultaneous focus/edit action.
        await this.doc(review_id).write(r);this.arm(r);return r;
      }
      else if(action==='edit') {r.status='editing';r.deadline_at=null;}
      else if(action==='cancel') {await this.runtime.service.cancel(r.task_id);r.status='canceled';r.deadline_at=null;}
      else if(action==='save') {
        if(r.status!=='editing')throw new TripoError('STAGING_REQUIRED','先暂停倒计时，再修改配置。');
        const parsed=this.schema(r.kind).parse({...input,submit:false});
        const prepared=await this.runtime.service.prepare(r.kind,parsed,{draftId:r.task_id});
        if(prepared.task.status!=='staged')throw new TripoError('STAGING_REQUIRED','相同配置的任务已提交，请查看已有任务。');
        if(prepared.deduplicated && this.runtime.pricing && this.runtime.store){
          const frozen=await this.runtime.store.get(prepared.task.task_id);
          const quote=await this.runtime.pricing.quote(r.kind,{}, {task:frozen,offline:true});
          await this.runtime.store.update(frozen.task_id,task=>({...task,cost_estimate:quote}));
        }
        if(prepared.task.task_id!==r.task_id)await this.runtime.service.cancel(r.task_id);
        r={...r,input:parsed,task_id:prepared.task.task_id,status:'pending',deadline_at:null,error:null};
      } else if(action==='confirm') {
        if(r.status==='editing')throw new TripoError('STAGING_REQUIRED','请先保存配置并更新报价。');
        const {task}=await this.runtime.service.get(r.task_id);
        if(task.status!=='staged'){r.status='submitted';r.deadline_at=null;}
        else {
          // Never auto-submit using an expired quote or silently accept a changed price.
          const quote=task.cost_estimate;
          if(quote?.estimate_expires_at && Date.parse(quote.estimate_expires_at)<=this.now()){
            r.status='editing';r.deadline_at=null;r.error={code:'QUOTE_EXPIRED',message:'报价已过期，请保存配置更新报价后继续。'};
          } else {r.status='submitting';r.submitting_pid=process.pid;r.deadline_at=null;dispatch={task_id:r.task_id,confirmation:task.confirmation,requestHash:task.request_hash};}
        }
      } else throw new TripoError('INVALID_INPUT','Unknown configuration action.');
      r.revision++;await this.doc(review_id).write(r);this.arm(r);return r;
    });
    if(dispatch){
      try {
        await this.runtime.service.submit(dispatch.task_id,{confirmation:dispatch.confirmation,requestHash:dispatch.requestHash});
        await this.doc(review_id).update(r=>({...r,status:'submitted',revision:r.revision+1,error:null}));
      } catch(error){await this.doc(review_id).update(r=>({...r,status:'failed',revision:r.revision+1,error:errorSnapshot(error)}));}
      return this.output(await this.doc(review_id).read());
    }
    if(action==='ready' && editableStates.has(record.status))this.preupload(record);
    if(action==='save' && record.status==='pending')this.preupload(record);
    return this.output(record);
  }
}
