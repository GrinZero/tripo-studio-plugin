import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {mkdtemp,mkdir,readFile,rm,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {generationInput,quoteCurrent,artifactFor} from '../ui/model.mjs';
import {createWorkbenchMedia,readPreviewUrl,validatePreviewGlb} from '../src/ui/media.mjs';
import {fixtureGlb} from './helpers/glb-fixture.mjs';
import {makeConfig,makeRuntime} from './helpers/runtime.mjs';

describe('workbench input and pricing boundary',()=>{
 const base={mode:'text',tier:'high_detail',faces:60000,prompt:'ceramic fox',geometry:'standard',texture:true,textureQuality:'detailed',pbr:true,delight:true};
 it('sends only compatible settings, explicit geometry quality and staged writes',()=>{
  const input=generationInput(base);assert.equal(input.submit,false);assert.equal(input.geometry_quality,'standard');assert.equal(input.texture_quality,'detailed');assert.equal(input.prompt,'ceramic fox');
  const smart=generationInput({...base,tier:'smart_mesh',faces:10000,quad:true,amount:4});assert.equal(smart.amount,4);assert.equal(smart.model_version,'Nexus-v2.0-20260801');assert.ok(!Object.hasOwn(smart,'geometry_quality'));assert.ok(!Object.hasOwn(smart,'texture'));assert.ok(!Object.hasOwn(smart,'pbr'));
  const geometry=generationInput({...base,texture:false});assert.ok(!Object.hasOwn(geometry,'texture_quality'));assert.ok(!Object.hasOwn(geometry,'delight'));
 });
 it('does not confuse multiple independent inputs with multiview',()=>{
  assert.throws(()=>generationInput({...base,mode:'multiview',images:{front:{file_path:'/front.png'}}}),/至少/);
  const input=generationInput({...base,mode:'multiview',images:{front:{file_path:'/front.png'},back:{file_path:'/back.png'}}});assert.equal(input.mode,'multiview');assert.equal(input.front_image_path,'/front.png');assert.equal(input.back_image_path,'/back.png');assert.ok(!Object.hasOwn(input,'image_paths'));assert.ok(!Object.hasOwn(input,'prompt'));
 });
 it('rejects missing input, incompatible face counts, unknown and expired quotes',()=>{
  assert.throws(()=>generationInput({...base,mode:'image',images:{}}),/参考图片/);assert.throws(()=>generationInput({...base,faces:60000,quad:true}),/50,000/);
  assert.equal(quoteCurrent({status:'unknown',estimated_credits:null}),false);assert.equal(quoteCurrent({status:'estimated',estimated_credits:10,estimate_expires_at:'2000-01-01'}),false);assert.equal(quoteCurrent({status:'estimated',estimated_credits:0,estimate_expires_at:'2099-01-01'}),true);
  assert.equal(artifactFor({kind:'local.crop'}),'image');assert.equal(artifactFor({kind:'local.render'}),'render');assert.equal(artifactFor({kind:'motion.generate'}),'motion');
 });
});
describe('workbench media isolation',()=>{
 it('previews the selected completed model output and recorded operator rather than the first/current project',async t=>{
  const calls=[];
  const task={kind:'model.generate',status:'succeeded',account_fingerprint:'account',remote:{project_id:'first',operator_id:'old'},result:{models:[{project_id:'first',operator_id:'one',status:'succeeded'},{project_id:'second',operator_id:'two',status:'succeeded'}]}};
  const media=createWorkbenchMedia({config:{},session:{accountFingerprint:async()=> 'account'},store:{get:async()=>task},gateway:{getProject:async(...args)=>{calls.push(args);return {id:args[0],model_url:'https://cdn.tripo3d.ai/selected.glb'};}}});
  t.mock.method(globalThis,'fetch',async()=>new Response(fixtureGlb()));
  assert.equal((await media.preview({task_id:'task',type:'model',output_index:1})).mime_type,'model/gltf-binary');
  assert.deepEqual(calls,[['second','two']]);
  await assert.rejects(media.preview({task_id:'task',type:'model',output_index:2}),/所选模型/);
 });
 it('previews exact saved model/image files within output roots without remote requests',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'tripo-download-preview-'));const config=makeConfig(dir);
  const output=path.join(dir,'exports');config.outputRoots=[output];await mkdir(output);
  try{
   const media=createWorkbenchMedia({config});
   const model=path.join(output,'saved.glb');await writeFile(model,fixtureGlb());
   const preview=await media.preview({local_path:model,type:'model'});
   assert.equal(preview.mime_type,'model/gltf-binary');
   assert.ok(validatePreviewGlb(Buffer.from(preview.data_url.split(',')[1],'base64')));
   const image=path.join(output,'second.png');await writeFile(image,await sharp({create:{width:13,height:7,channels:3,background:'#aabbcc'}}).png().toBuffer());
   assert.equal((await media.preview({local_path:image,type:'image'})).width,13);
   await assert.rejects(media.preview({local_path:model,project_id:'another',type:'model'}),/请选择一个/);
   await assert.rejects(media.preview({local_path:'relative.glb',type:'model'}),/绝对路径/);
   const outside=path.join(dir,'outside.glb');await writeFile(outside,fixtureGlb());
   await assert.rejects(media.preview({local_path:outside,type:'model'}),/素材目录/);
   const link=path.join(output,'link.glb');await symlink(outside,link);
   await assert.rejects(media.preview({local_path:link,type:'model'}),/素材目录/);
   const large=path.join(output,'large.png');await writeFile(large,Buffer.alloc(20*1024*1024+1));
   await assert.rejects(media.preview({local_path:large,type:'image'}),/大小限制/);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 it('imports valid images locally, uses opaque handles, and refuses non-raster input',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'tripo-ui-media-'));const config=makeConfig(dir);await mkdir(config.assetRoot);
  try{
   const media=createWorkbenchMedia({config});const bytes=await sharp({create:{width:32,height:24,channels:3,background:'#cc7755'}}).png().toBuffer();
   const image=await media.importImage({name:'../../input.png',data_base64:bytes.toString('base64')});assert.equal(image.name,'input.png');assert.equal(image.width,32);assert.ok(image.file_path.startsWith(path.join(config.assetRoot,'ui-inputs')));assert.ok(image.preview.data_url.startsWith('data:image/webp;base64,'));assert.ok((await readFile(image.file_path)).length>0);
   const preview=await media.preview({input_id:image.input_id,type:'image'});assert.equal(preview.width,32);assert.equal(preview.height,24);
   await assert.rejects(media.importImage({name:'fake.png',data_base64:Buffer.from('<svg/>').toString('base64')}));
   await assert.rejects(media.preview({project_id:'a',input_id:image.input_id}),/请选择一个/);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 it('checks every redirect and bounds streamed bodies',async()=>{
  await assert.rejects(readPreviewUrl('https://cdn.tripo3d.ai/a',100,async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}})),/HTTPS/);
  await assert.rejects(readPreviewUrl('https://cdn.tripo3d.ai/a',2,async()=>new Response('abcd')),/大小限制/);
  const bytes=await readPreviewUrl('https://cdn.tripo3d.ai/a',10,async()=>new Response('abc'));assert.equal(bytes.toString(),'abc');
 });
 it('refuses corrupt and externally-referenced GLB files before browser parsing',()=>{
  assert.ok(validatePreviewGlb(fixtureGlb()));assert.throws(()=>validatePreviewGlb(Buffer.from('fake')));
  const original=fixtureGlb();const length=original.readUInt32LE(12);const doc=JSON.parse(original.subarray(20,20+length).toString().trim());doc.images=[{uri:'https://example.com/private.png'}];let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const header=Buffer.from(original.subarray(0,20));const tail=original.subarray(20+length);header.writeUInt32LE(20+json.length+tail.length,8);header.writeUInt32LE(json.length,12);assert.throws(()=>validatePreviewGlb(Buffer.concat([header,json,tail])),/外部资源/);
 });
});
describe('task page boundaries',()=>{
 it('paginates after applying status groups and keeps deterministic offsets',async()=>{
  const {config,store,service}=await makeRuntime();
  try{
   for(let i=0;i<7;i++)await store.create({task_id:crypto.randomUUID(),kind:'model.remesh',status:i%2?'running':'succeeded',created_at:new Date().toISOString(),snapshots:[],input_summary:{},remote:null,consumes_credits:true});
   const first=await service.list({limit:2,statuses:['succeeded']});assert.equal(first.tasks.length,2);assert.equal(first.next_offset,2);assert.ok(first.tasks.every(t=>t.status==='succeeded'));
   const second=await service.list({limit:2,offset:first.next_offset,statuses:['succeeded']});assert.equal(second.tasks.length,2);assert.equal(second.next_offset,null);assert.ok(!first.tasks.some(t=>second.tasks.some(s=>s.task_id===t.task_id)));
  }finally{await rm(config.dataDir,{recursive:true,force:true});}
 });
});
