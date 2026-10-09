import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile, mkdir } from 'node:fs/promises';
import { solidImage } from './helpers/image-fixture.mjs';
import { imageMetadata } from '../src/util/image-processing.mjs';
import { zipSync, unzipSync } from 'fflate';
import { normalizeExport, inspectGlbTextures, sourceTextureInfo, prepareExportDownload } from '../src/studio/export-resolution.mjs';
import { makeRuntime } from './helpers/runtime.mjs';
import { fixtureGlb } from './helpers/glb-fixture.mjs';

async function image(width=2048,height=2048) { return solidImage({width,height,channels:4,background:{r:200,g:90,b:30,alpha:0.4}}); }
async function texturedGlb(size=2048) {
  const base=fixtureGlb(),n=base.readUInt32LE(12),doc=JSON.parse(base.subarray(20,20+n).toString().trim()),bin=base.subarray(28+n),texture=await image(size,size);
  const pad=Buffer.alloc(Math.ceil(texture.length/4)*4);texture.copy(pad);
  doc.images=[{bufferView:doc.bufferViews.length,mimeType:'image/png',name:'basecolor'}];doc.textures=[{source:0}];doc.materials[0].pbrMetallicRoughness.baseColorTexture={index:0};
  doc.bufferViews.push({buffer:0,byteOffset:bin.length,byteLength:texture.length});doc.buffers[0].byteLength=bin.length+pad.length;
  const j=Buffer.from(JSON.stringify(doc)),p=Buffer.alloc(Math.ceil(j.length/4)*4,32);j.copy(p);
  const out=Buffer.alloc(28+p.length+bin.length+pad.length);out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(p.length,12);out.writeUInt32LE(0x4e4f534a,16);p.copy(out,20);out.writeUInt32LE(bin.length+pad.length,20+p.length);out.writeUInt32LE(0x004e4942,24+p.length);bin.copy(out,28+p.length);pad.copy(out,28+p.length+bin.length);
  return {bytes:out,geometry:bin,doc};
}
describe('export resolution',()=>{
 it('resizes ZIP textures, preserves alpha, filenames, FBX and animation bytes, and leaves input intact',async()=>{
  const texture=await image(),mesh=Buffer.from('frozen FBX geometry skeleton animation'),mtl=Buffer.from('map_Kd part/texture.png');
  const source=Buffer.from(zipSync({'model.fbx':mesh,'part/texture.png':texture,'model.mtl':mtl})),before=Buffer.from(source);
  const out=await normalizeExport(source,{textureSize:1024,format:'fbx',expectTextures:true}),files=unzipSync(out.bytes);
  assert.deepEqual(source,before);assert.deepEqual(Buffer.from(files['model.fbx']),mesh);assert.deepEqual(Buffer.from(files['model.mtl']),mtl);
  const m=await imageMetadata(files['part/texture.png']);assert.equal(m.width,1024);assert.equal(m.height,1024);assert.equal(m.hasAlpha,true);assert.equal(out.verification.actual_texture_size_verified,true);assert.equal(out.verification.resolution_method,'local_downsample');
  const repeated=await normalizeExport(source,{textureSize:1024,format:'fbx',expectTextures:true});assert.deepEqual(repeated.bytes,out.bytes);
 });
 it('passes matching files byte-for-byte and never enlarges smaller/non-square textures',async()=>{
  const src=Buffer.from(zipSync({'small.png':await image(256,128)}));
  const out=await normalizeExport(src,{textureSize:1024,format:'obj',expectTextures:true});assert.deepEqual(out.bytes,src);assert.equal(out.textures[0].width,256);
  const wide=await normalizeExport(Buffer.from(zipSync({'wide.png':await image(2048,1024)})),{textureSize:512,format:'obj'});assert.equal(wide.textures[0].width,512);assert.equal(wide.textures[0].height,256);
 });
 it('resizes embedded GLB textures without changing accessors, meshes, nodes or existing binary data',async()=>{
  const {bytes,geometry,doc}=await texturedGlb();const out=await normalizeExport(bytes,{textureSize:1024,format:'glb',expectTextures:true});
  const n=out.bytes.readUInt32LE(12),actual=JSON.parse(out.bytes.subarray(20,20+n).toString().trim());for(const key of ['accessors','meshes','nodes','scenes'])assert.deepEqual(actual[key],doc[key]);
  assert.deepEqual(out.bytes.subarray(28+n,28+n+geometry.length),geometry);assert.deepEqual((await inspectGlbTextures(out.bytes)).map(t=>[t.width,t.height]),[[1024,1024]]);
 });
 it('preserves meshopt virtual buffers and compressed geometry while resizing only images',async()=>{
  const {bytes}=await texturedGlb(),n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n).toString().trim()),bin=bytes.subarray(28+n);
  doc.buffers.push({byteLength:16384,extensions:{EXT_meshopt_compression:{fallback:true}}});doc.extensionsRequired=['EXT_meshopt_compression'];
  const j=Buffer.from(JSON.stringify(doc)),p=Buffer.alloc(Math.ceil(j.length/4)*4,32);j.copy(p);const b=Buffer.alloc(28+p.length+bin.length);b.write('glTF');b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(p.length,12);b.writeUInt32LE(0x4e4f534a,16);p.copy(b,20);b.writeUInt32LE(bin.length,20+p.length);b.writeUInt32LE(0x004e4942,24+p.length);bin.copy(b,28+p.length);
  const out=await normalizeExport(b,{textureSize:1024,format:'glb',expectTextures:true}),m=out.bytes.readUInt32LE(12),result=JSON.parse(out.bytes.subarray(20,20+m).toString().trim());assert.deepEqual(result.buffers[1],doc.buffers[1]);assert.deepEqual(out.bytes.subarray(28+m,28+m+bin.length),bin);assert.equal((await inspectGlbTextures(out.bytes))[0].width,1024);
 });
 it('rejects unsafe archives and uninspectable embedded textures, and keeps USDZ alignment intact',async()=>{
  await assert.rejects(async()=>normalizeExport(Buffer.from(zipSync({'../escape.png':await image(16,16)})),{textureSize:1024,format:'obj'}),/Unsafe/);
  await assert.rejects(()=>normalizeExport(Buffer.from('embedded fbx'),{textureSize:1024,format:'fbx',expectTextures:true}),/no inspectable/);
  await assert.rejects(async()=>normalizeExport(Buffer.from(zipSync({'image.png':await image()})),{textureSize:1024,format:'usdz'}),/aligned USDZ writer/);
  const noTexture=await normalizeExport(Buffer.from('STL'),{textureSize:1024,format:'stl',expectTextures:true});assert.equal(noTexture.verification.resolution_status,'not_applicable');assert.equal(noTexture.verification.actual_texture_size_verified,false);
 });
 it('allows native 4K uploads even when Studio flags incorrectly label them 2K',async()=>{
  const rt=await makeRuntime(),source=await texturedGlb(4096),prior=globalThis.fetch;
  try {globalThis.fetch=async()=>new Response(source.bytes);rt.gateway.project={id:'p',is_owner:true,model_url:'https://cdn.tripo3d.ai/source.glb',operator:{operator_id:'source',is_hd_textured:false}};const staged=await rt.service.prepare('model.export',{project_id:'p',format:'fbx',texture_size:4096});assert.equal(staged.task.metadata.source_texture_size,4096);assert.equal(staged.task.metadata.source_texture_size_verified,true);await assert.rejects(()=>rt.service.prepare('model.export',{project_id:'p',format:'fbx',texture_size:8192}),/cannot exceed/);}
  finally {globalThis.fetch=prior;}
 });
 it('uses actual source images over incorrect service quality flags and processes the frozen export download',async()=>{
  const runtime=await makeRuntime(),source=await texturedGlb(),native=Buffer.from(zipSync({'model.fbx':Buffer.from('same skeleton'),'texture.png':await image()}));
  await mkdir(runtime.config.assetRoot,{recursive:true});const prior=globalThis.fetch;
  try {
   globalThis.fetch=async url=>new Response(String(url).includes('source.glb')?source.bytes:native);
   const info=await sourceTextureInfo(runtime,{model_url:'https://cdn.tripo3d.ai/source.glb',operator:{is_hd_textured:true}},'source');assert.equal(info.source_texture_size,2048);assert.equal(info.source_texture_size_verified,true);globalThis.fetch=async()=>{throw Error('cached source should not be downloaded again');};assert.deepEqual(await sourceTextureInfo(runtime,{model_url:'https://cdn.tripo3d.ai/source.glb',operator:{is_hd_textured:true}},'source'),info);globalThis.fetch=async()=>new Response(native);
   let requested;runtime.gateway.getExportDownload=async(op,name)=>{requested={op,name};return {model_url:'https://cdn.tripo3d.ai/frozen.zip?signature=secret'};};
   const resolved=await prepareExportDownload(runtime,{task_id:'test-export',payload:{name:'checked',texture_size:1024},remote:{operator_id:'frozen-export'},result:{format:'fbx'},metadata:{source_texture_count:1}});
   assert.deepEqual(requested,{op:'frozen-export',name:'checked'});assert.equal(resolved.defaultName,'checked.zip');assert.equal(resolved.verification.actual_texture_size_verified,true);assert.deepEqual(await readFile(resolved.verification.source_path),native);
   const files=unzipSync(await readFile(resolved.localPath));assert.equal((await imageMetadata(files['texture.png'])).width,1024);assert.deepEqual(Buffer.from(files['model.fbx']),Buffer.from('same skeleton'));
  } finally {globalThis.fetch=prior;}
 });
});
