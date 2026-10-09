import assert from 'node:assert/strict';
import { it } from 'node:test';
import { access,writeFile,readFile } from 'node:fs/promises';
import path from 'node:path';
import { solidImage } from './helpers/image-fixture.mjs';
import { imageMetadata, decodePixels } from '../src/util/image-processing.mjs';
import { makeRuntime } from './helpers/runtime.mjs';
import { fixtureGlb } from './helpers/glb-fixture.mjs';
const executable=process.env.TRIPO_BLENDER_EXECUTABLE??(process.platform==='darwin'?'/Applications/Blender.app/Contents/MacOS/Blender':null);
let available=false;if(executable)try{await access(executable);available=true;}catch{}
it('real Blender viewport, part merge/split, and projection preserve UVs and mask occlusion',{skip:!available,timeout:180000},async()=>{
 const {service,config}=await makeRuntime();config.blenderExecutable=executable;
 const model=path.join(config.dataDir,'fixture.glb');await writeFile(model,fixtureGlb());
 const run=async(kind,input)=>{const staged=await service.prepare(kind,{...input,submit:true});return (await service.sync(staged.task.task_id)).task.result;};
 const inspect=await run('local.inspect_parts',{model_path:model});assert.deepEqual(inspect.parts.map(p=>p.name).sort(),['Back','Front']);assert.ok(inspect.parts.every(p=>p.has_uv));assert.ok(inspect.parts.every(p=>p.uv_utilization.fraction===1 && p.uv_utilization.estimated));
 const render=await run('local.render',{model_path:model,view:'front',viewport_width:64,viewport_height:64});const image=await imageMetadata(render.render_image_path);assert.equal(image.width,128);assert.equal(image.height,128);assert.equal(render.camera_matrix.length,16);
 const merged=await run('local.edit_parts',{model_path:model,edits:[{action:'merge',part_names:['Front','Back'],name:'Merged'}]});assert.equal(merged.parts.length,1);assert.equal(merged.parts[0].triangle_count,4);assert.equal(merged.parts[0].name,'Merged');
 const split=await run('local.edit_parts',{model_path:model,edits:[{action:'split',part_names:['Front'],face_indices:[0],name:'SelectedFace'}]});assert.equal(split.parts.length,3);assert.equal(split.parts.find(p=>p.name==='SelectedFace').triangle_count,1);
 const hidden=await run('local.edit_parts',{model_path:model,edits:[{action:'hide',part_names:['Front']}]});const visible=await run('local.inspect_parts',{model_path:hidden.model_path});assert.deepEqual(visible.parts.map(p=>p.name),['Back']);
 const deleted=await run('local.edit_parts',{model_path:model,edits:[{action:'delete',part_names:['Back']}]});assert.deepEqual(deleted.parts.map(p=>p.name),['Front']);
 const blue=path.join(config.dataDir,'blue.webp');await writeFile(blue, await solidImage({width:128,height:128,channels:4,background:{r:0,g:0,b:255,alpha:1}}, {format:'webp',lossless:true}));
 const baked=await run('local.project_texture',{model_path:model,image_path:blue,camera_matrix:render.camera_matrix,viewport_width:64,viewport_height:64,resolution:512,strength:1});assert.equal(baked.textures.length,2);
 const pixel=async(name)=>{const texture=baked.textures.find(p=>p.part_name===name);return [...(await decodePixels(texture.image_path, {crop:{left:256,top:256,width:1,height:1},channels:3})).data];};
 const front=await pixel('Front');const back=await pixel('Back');assert.ok(front[2]>200&&front[0]<30,`front projection incorrect: ${front}`);assert.ok(back[1]>200&&back[2]<30,`occluded back was modified: ${back}`);
 assert.deepEqual(await readFile(model),fixtureGlb());
});
