import assert from 'node:assert/strict';
import { it, describe } from 'node:test';
import { z } from 'zod';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { solidImage } from './helpers/image-fixture.mjs';
import { imageMetadata, decodePixels } from '../src/util/image-processing.mjs';
import { makeRuntime } from './helpers/runtime.mjs';
import { normalizeSettings, modelOperations, syncGeneratedModels } from '../src/ops/modelgen.mjs';
import { postprocessOperations, postprocessSync } from '../src/ops/postops.mjs';
import { imageOperations } from '../src/ops/imagegen.mjs';
import { copyLocalArtifact, localArtifact } from '../src/studio/local-artifacts.mjs';
import { studioExtraOperations } from '../src/ops/studio-extras.mjs';
import { StudioGateway } from '../src/studio/gateway.mjs';
import { OPERATIONS } from '../src/ops/registry.mjs';
import { OPERATION_KINDS } from '../src/constants.mjs';
import { stripUrls } from '../src/ops/service.mjs';
import { stageLocalModelFile, verifySnapshot } from '../src/ops/images.mjs';
const parse=(op,input)=>z.object(op.inputShape).strict().parse(input);

describe('Studio production contracts',()=>{
 it('edits completed Studio images without reupload and retains their lineage',async()=>{
  const op=imageOperations['image.generate'];let uploads=0;const ctx={gateway:{getStudioImageAsset:async(id)=>({asset_id:id,status:'success',output:{data:[{bucket:'b',key:'source-key',image_audit_result:'pass'}]}})},uploader:{upload:async()=>uploads++}};
  const input=parse(op,{model_version:'gpt_image_2.5_sunburst',prompt:'change the color',studio_references:[{asset_id:'source'}]});const built=await op.build(ctx,input,'task');assert.deepEqual(built.payload.image,{bucket:'b',key:'source-key',image_audit_result:'pass',image_source:'generate'});assert.equal(uploads,0);assert.deepEqual(built.metadata.studio_references,[{asset_id:'source',output_index:0}]);
  await assert.rejects(()=>op.build(ctx,parse(op,{model_version:'midjourney',studio_references:[{asset_id:'source'}]}),'task'),/does not accept/);
 });
 it('never marks the wrong animation artifact as a successful result',async()=>{
  const sync=postprocessSync();const task={kind:'model.apply_motion',payload:{motion_asset_id:'wanted'},remote:{operator_id:'op',project_id:'p'}};
  const ctx={gateway:{getProgress:async()=>[{operator_id:'op',project_id:'p',status:'success'}],getProject:async()=>({id:'p',operator:{retarget:[{motion_asset_id:'other',model_url:'https://cdn.tripo3d.ai/wrong.glb'}]}})}};
  await assert.rejects(()=>sync(ctx,task),/not available/);ctx.gateway.getProject=async()=>({id:'p',operator:{retarget:[{motion_asset_id:'wanted',model_url:'https://cdn.tripo3d.ai/right.glb'}]}});assert.match((await sync(ctx,task)).result.animation_model_url,/right/);
 });
 it('keeps a stale export staged before any write boundary',async()=>{
  const {service,gateway,store}=await makeRuntime();gateway.project={id:'p',is_owner:true,operator:{operator_id:'source'}};let writes=0;gateway.submitExport=async()=>{writes++;return {operator_id:'export'};};const staged=await service.prepare('model.export',{project_id:'p',format:'fbx'});gateway.project.operator.operator_id='changed';await assert.rejects(()=>service.submit(staged.task.task_id,{confirmation:staged.confirmation}),/changed/);const task=await store.get(staged.task.task_id);assert.equal(task.status,'staged');assert.equal(task.dispatch_started_at,undefined);assert.equal(writes,0);
 });
 it('copies local artifacts within output roots and refuses overwriting or escaping',async()=>{
  const {config}=await makeRuntime();const file=path.join(config.assetRoot,'source.png');const {mkdir}=await import('node:fs/promises');await mkdir(config.assetRoot,{recursive:true});await writeFile(file,'immutable');const record={result:{textures:[{image_path:file}]}};assert.equal(localArtifact(record,'texture',0),file);assert.throws(()=>localArtifact(record,'texture',1),/no file/);const result=await copyLocalArtifact(config,file,undefined,'copy.png');assert.equal((await readFile(result.path)).toString(),'immutable');await assert.rejects(()=>copyLocalArtifact(config,file,result.path,'copy.png'),/EEXIST/);await assert.rejects(()=>copyLocalArtifact(config,file,path.join(config.dataDir,'escape.png'),'copy.png'),/configured output roots/);
 });
 it('keeps the registry and workflow kinds aligned',()=>assert.deepEqual([...Object.keys(OPERATIONS)].sort(),[...OPERATION_KINDS].sort()));
 it('sends delight independently of PBR and explicit geometry quality',async()=>{
  const op=modelOperations['model.generate'];const built=await op.build({},parse(op,{tier:'high_detail',mode:'text',prompt:'robot',face_limit:50000,geometry_quality:'standard',texture:true,delight:false,pbr:true}),'task');
  assert.equal(built.payload.body.delight,false);assert.equal(built.payload.body.pbr,true);assert.equal(built.payload.body.geometry_quality,'standard');
  assert.throws(()=>normalizeSettings({tier:'high_detail',face_limit:5000,texture:false,delight:true},'text'),/require texture/);
 });
 it('sends Nexus P2 quad variations, preserves P1 limits, rejects mismatched budgets',async()=>{
  const op=modelOperations['model.generate'];const built=await op.build({},parse(op,{tier:'smart_mesh',mode:'text',prompt:'robot',face_limit:5000,amount:2,face_limits:[500,25000]}),'task');
  assert.equal(built.payload.body.model_version,'Nexus-v2.0-20260801');assert.equal(built.payload.body.quad,true);assert.deepEqual(built.payload.body.variations,[{face_limit:500},{face_limit:25000}]);assert.equal('face_limit' in built.payload.body,false);
  assert.throws(()=>normalizeSettings({tier:'smart_mesh',model_version:'Nexus-v1.0-20260214',face_limit:25000},'text'),/face_limit/);
  assert.throws(()=>normalizeSettings({tier:'smart_mesh',model_version:'Nexus-v1.0-20260214',face_limit:5000,quad:true},'text'),/require Smart Mesh P2/);
  assert.throws(()=>normalizeSettings({tier:'smart_mesh',face_limit:5000,amount:4,face_limits:[5000,6000]},'image'),/length/);
 });
 it('tracks distinct variant projects and never substitutes the first model',async()=>{
  const ctx={gateway:{getProgress:async()=>[{operator_id:'a',project_id:'p1',status:'success'},{operator_id:'b',project_id:'p2',status:'running'}],getProject:async(id)=>({id,model_url:`https://cdn.tripo3d.ai/${id}.glb`})}};
  const task={remote:{operator_ids:['a','b'],project_id:'p1',project_ids:['p1','p2']}};let sync=await syncGeneratedModels(ctx,task);assert.equal(sync.status,'running');assert.equal(sync.result.models[0].project_id,'p1');assert.equal(sync.result.models[1].project_id,'p2');
  ctx.gateway.getProgress=async()=>[{operator_id:'a',project_id:'p1',status:'success'},{operator_id:'b',project_id:'p2',status:'success'}];sync=await syncGeneratedModels(ctx,task);assert.equal(sync.status,'succeeded');assert.match(sync.result.models[1].model_url,/p2/);
  ctx.gateway.getProgress=async()=>[{operator_id:'a',project_id:'wrong',status:'success'},{operator_id:'b',project_id:'p2',status:'success'}];await assert.rejects(()=>syncGeneratedModels(ctx,task),/different project/);
 });
 it('uses the observed import field names and chunks batch progress',async()=>{
  const calls=[];const gateway=new StudioGateway({request:async(req,decode)=>{calls.push(req);return decode(req.path.endsWith('progress')?req.body.ids.map(id=>({operator_id:id,status:'running'})):{operator_id:'op',project_id:'p'});}});
  await gateway.submitModelImport({format:'glb',model:{bucket:'b',key:'k'},name:'n',transform_matrix:Array(16).fill(1),use_original_uv:true});assert.equal(calls[0].body.use_original_uv,true);assert.equal(calls[0].body.transform_matrix.length,16);
  const items=await gateway.getProgress(Array.from({length:120},(_,i)=>`op-${i}`));assert.equal(items.length,120);assert.equal(calls.filter(c=>c.path.endsWith('progress')).length,6);
 });
 it('rejects discontinuous multistage paths and supports the observed motion endpoints',async()=>{
  const op=studioExtraOperations['motion.generate'];const input=parse(op,{segments:[{prompt:'walk',duration_seconds:2,waypoints:[[0,0],[1,0]]},{prompt:'turn',duration_seconds:2,waypoints:[[2,0],[3,0]]}]});await assert.rejects(()=>op.build({},input),/connect/);
  const {service,gateway}=await makeRuntime();gateway.submitMotion=async()=>({task_id:'motion-1',status:'queued'});gateway.getMotionTask=async()=>({task_id:'motion-1',status:'success',asset_id:'motion-asset'});gateway.getMotionAsset=async()=>({asset_id:'motion-asset',task_id:'motion-1',motion_url:'https://cdn.tripo3d.ai/motion.glb'});
  const staged=await service.prepare('motion.generate',{segments:[{prompt:'walk',duration_seconds:5}],submit:true});const synced=await service.sync(staged.task.task_id);assert.equal(synced.task.result.motion_asset_id,'motion-asset');assert.equal(synced.task.result.motion_url_available,true);assert.equal(synced.task.status,'succeeded');
 });
 it('uses V3 spec for humanoid rig presets without forcing the legacy version',async()=>{
  const op=postprocessOperations['model.rig'];const ctx={gateway:{getProject:async()=>({id:'p',operator:{is_textured:true}}),precheckRigging:async()=>({riggable:true,rig_type:'biped'})}};
  const built=await op.build(ctx,parse(op,{project_id:'p',skeleton_preset:'mixamo'}));assert.deepEqual(built.payload,{project_id:'p',model_version:'v3.0-20260909',rig_type:'biped',spec:'mixamo'});
  await assert.rejects(()=>op.build(ctx,parse(op,{project_id:'p',model_version:'v1.0-20240301',skeleton_preset:'mixamo'})),/V3/);
  ctx.gateway.precheckRigging=async()=>({riggable:true,rig_type:'quadruped'});await assert.rejects(()=>op.build(ctx,parse(op,{project_id:'p',rigging_type:'humanoid'})),/biped precheck/);const animal=await op.build(ctx,parse(op,{project_id:'p',rigging_type:'other'}));assert.equal(animal.payload.rig_type,'quadruped');assert.equal(animal.payload.spec,undefined);
 });
 it('rechecks UV candidate membership and current operator before applying',async()=>{
  const op=studioExtraOperations['model.uv_apply'];let current='source';let applied=0;let candidates=[{operator_id:'candidate'}];
  const ctx={gateway:{getProject:async()=>({id:'p',operator:{operator_id:current}}),getUvContext:async()=>({project_id:'p',current_operator_id:current,running_task:null,candidates}),applyUv:async()=>{applied++;return {project_id:'p',previous_operator_id:'source',current_operator_id:'candidate'}}}};
  const built=await op.build(ctx,parse(op,{project_id:'p',candidate_operator_id:'candidate'}));current='changed';await assert.rejects(()=>op.beforeSubmit(ctx,built),/changed/);assert.equal(applied,0);current='source';candidates=[];await assert.rejects(()=>op.beforeSubmit(ctx,built),/candidate/);assert.equal(applied,0);
  candidates=[{operator_id:'candidate'}];assert.equal((await op.submitRemote(ctx,built)).operator_id,'candidate');assert.equal(applied,1);
 });
 it('handles instant export without leaking the signed URL through remote or events',async()=>{
  const {service,gateway}=await makeRuntime();gateway.project={id:'p',is_owner:true,operator:{operator_id:'source'}};gateway.submitExport=async()=>({model_url:'https://cdn.tripo3d.ai/export.zip?signature=secret'});
  const staged=await service.prepare('model.export',{project_id:'p',format:'obj',submit:true});assert.equal(staged.paid_request_sent,false);const result=await service.sync(staged.task.task_id);assert.equal(result.task.result.export_url_available,true);const raw=JSON.stringify(await service.get(staged.task.task_id));assert.equal(raw.includes('signature'),false);assert.equal(raw.includes('https://'),false);
  assert.equal(result.task.result.actual_texture_size_verified,false);assert.equal(result.task.result.requested_texture_size,2048);await assert.rejects(()=>service.prepare('model.export',{project_id:'p',format:'fbx',texture_size:8192}),/cannot exceed/);
  assert.deepEqual(stripUrls({cover_images:['https://cdn.tripo3d.ai/x.jpg']}),{cover_images:[{url_available:true}]});
 });
 it('preserves model snapshots through the dispatch provenance check',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'tripo-model-snapshot-'));const file=path.join(dir,'model.obj');await writeFile(file,'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');const config={dataDir:dir};const taskId='00000000-0000-4000-8000-000000000000';const snapshot=await stageLocalModelFile(config,file,{taskId,index:1,label:'m',slot:'model'});assert.equal(await verifySnapshot(config,taskId,snapshot.provenance),snapshot.path);
 });
 it('local brush and crop work without login, upload, or credit consumption',async()=>{
  const {service,gateway,config}=await makeRuntime();const file=path.join(config.dataDir,'input.png');await writeFile(file, await solidImage({width:16,height:16,channels:4,background:{r:0,g:0,b:0,alpha:1}}));
  gateway.requestTemporaryToken=()=>{throw Error('local operation uploaded')};const painted=await service.prepare('local.paint',{image_path:file,strokes:[{points:[[.5,.5]],radius:3,color:[255,0,0]}],submit:true});assert.equal(painted.paid_request_sent,false);const result=await service.sync(painted.task.task_id);const pixels=(await decodePixels(result.task.result.image_path)).data;assert.equal(pixels[(8*16+8)*4],255);const original=(await decodePixels(file)).data;assert.equal(original[(8*16+8)*4],0);
  const crop=await service.prepare('local.crop',{image_path:file,left:2,top:3,width:4,height:5,submit:true});const cropped=await service.sync(crop.task.task_id);const meta=await imageMetadata(cropped.task.result.image_path);assert.equal(meta.width,4);assert.equal(meta.height,5);await assert.rejects(()=>service.prepare('local.crop',{image_path:file,left:15,top:0,width:2,height:1}),/outside/);
 });
 it('does not silently discard unsupported parameters',async()=>{const {service}=await makeRuntime();await assert.rejects(()=>service.prepare('model.segment',{project_id:'proj-1',fake_option:true}),/Unrecognized key/);});
});
