import assert from 'node:assert/strict';
import { it } from 'node:test';
import { rm } from 'node:fs/promises';
import { makeRuntime } from './helpers/runtime.mjs';
import { parameterRows } from '../ui/model.mjs';

it('rejects texture controls on Smart Mesh generation before creating a paid task', async () => {
  const { service, gateway, config, store } = await makeRuntime();
  try {
    for (const extra of [{texture:true},{texture:false},{pbr:true},{pbr:false},{delight:true},{delight:false},{texture_quality:'detailed'},{texture_alignment:'original_image'}]) {
      await assert.rejects(service.prepare('model.generate', {
        tier:'smart_mesh', mode:'text', face_limit:5000, prompt:'crane', ...extra
      }), /Smart Mesh.*texture/i);
    }
    assert.equal((await store.list()).length, 0);
    assert.equal(gateway.calls.length, 0);
  } finally { await rm(config.dataDir, {recursive:true,force:true}); }
});

it('reports only applicable Smart Mesh generation settings and keeps later texturing independent', async () => {
  const { service, gateway, config, store } = await makeRuntime();
  try {
    const staged = await service.prepare('model.generate', {tier:'smart_mesh',mode:'text',face_limit:5000,prompt:'crane'});
    const task = await store.get(staged.task.task_id);
    for (const key of ['texture','pbr','delight','texture_quality','texture_alignment']) {
      assert.ok(!Object.hasOwn(task.settings,key), `${key} is inapplicable during Smart Mesh generation`);
      assert.ok(!Object.hasOwn(task.payload.body,key));
    }
    const legacy = {...staged.task,effective_settings:{...staged.task.effective_settings,texture:false,pbr:false},input_summary:{...staged.task.input_summary,delight:true,texture_quality:'detailed'}};
    assert.ok(!parameterRows(legacy).some(([label])=>['生成贴图','PBR 材质','去光','贴图质量'].includes(label)));
    gateway.project.operator = {is_nexus_mesh:true};
    const textured = await service.prepare('texture.generate', {project_id:'proj-1',mode:'text',prompt:'ivory feathers',quality:'detailed',delight:false,alignment:'geometry'});
    const payload = (await store.get(textured.task.task_id)).payload;
    assert.equal(payload.texture_quality,'detailed');
    assert.equal(payload.delight,false);
    assert.equal(payload.texture_alignment,'geometry');
    assert.equal(payload.project_id,'proj-1');
  } finally { await rm(config.dataDir, {recursive:true,force:true}); }
});
