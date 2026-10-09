import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeRuntime } from './helpers/runtime.mjs';
import { characterGroup, labeledCharacter, resolveCharacterGroup } from '../src/ops/task-groups.mjs';
import { TaskStore } from '../src/store/tasks.mjs';
import { taskGroups } from '../ui/model.mjs';

async function groupingRuntime() { const runtime = await makeRuntime(); runtime.gateway.getProject = async id => { runtime.gateway.calls.push(['getProject',id]); return {...runtime.gateway.project,id}; }; return runtime; }

describe('character task grouping',()=>{
  it('keeps role metadata out of paid payloads and preserves it through submit/sync/restart',async()=>{
    const {service,store,gateway,config}=await groupingRuntime();
    const prepared=await service.prepare('model.segment',{project_id:'proj-1',character_name:'派蒙'});
    const raw=await store.get(prepared.task.task_id);
    assert.equal(raw.character_group.name,'派蒙');
    assert.equal(raw.character_group.assigned_by,'explicit');
    assert.equal('character_name' in raw.payload,false);
    assert.equal('character_name' in raw.input_summary,false);
    await service.submit(raw.task_id,{confirmation:raw.confirmation});
    assert.equal((await service.sync(raw.task_id)).task.character_group.id,raw.character_group.id);
    assert.equal((await new TaskStore(config.dataDir).get(raw.task_id)).character_group.name,'派蒙');
    assert.ok(!JSON.stringify(gateway.calls).includes('派蒙'));
  });
  it('inherits from a parent, exact project, Studio image, motion and downloaded local file',async()=>{
    const {service,store,session}=await groupingRuntime();
    const source=(await service.prepare('model.segment',{project_id:'proj-1',character_name:'派蒙'})).task;
    await store.update(source.task_id,t=>{t.result={project_id:'proj-1',asset_id:'img-1',motion_asset_id:'motion-1'};t.downloads=[{path:'/tmp/paimon.glb',blender_path:'/tmp/paimon.decoded.glb'}];return t;});
    const follow=(await service.prepare('texture.pbr',{project_id:'proj-1'})).task;
    assert.equal(follow.character_group.id,source.character_group.id);
    assert.equal(follow.parent_task_id,source.task_id);
    const byParent=(await service.prepare('model.segment',{project_id:'proj-2',parent_task_id:source.task_id})).task;
    assert.equal(byParent.character_group.assigned_by,'inherited');
    const account=await session.accountFingerprint();
    for(const input of [{studio_references:[{asset_id:'img-1'}]},{motion_asset_id:'motion-1'},{model_path:'/tmp/paimon.glb'},{model_path:'/tmp/paimon.decoded.glb'}]) {
      const grouped=await resolveCharacterGroup(store,input,account);
      assert.equal(grouped.group.id,source.character_group.id);
    }
    assert.equal((await resolveCharacterGroup(store,{model_path:'/tmp/paimon.glb'},'local')).group.id,source.character_group.id);
    assert.equal((await resolveCharacterGroup(store,{model_path:'/tmp/paimon.glb'},'local',{name:'派蒙'})).group.id,source.character_group.id);
    assert.equal((await resolveCharacterGroup(store,{},'local',{name:'派蒙',parentTaskId:source.task_id})).group.id,source.character_group.id);
    assert.equal((await service.setCharacter(source.task_id,'派蒙')).task.character_group.id,source.character_group.id);
  });
  it('only infers labeled single-character names; unknown or mixed subjects remain ungrouped',()=>{
    assert.equal(labeledCharacter({prompt:'角色：派蒙，白色衣服'}),'派蒙');
    assert.equal(labeledCharacter({prompt:'Character: Alice\nFull body'}),'Alice');
    for(const prompt of ['白色衣服的小精灵','角色：派蒙、旅行者，合照','character: Alice & Bob']) assert.equal(labeledCharacter({prompt}),null);
    assert.equal(characterGroup(' ＰＡＩＭＯＮ ','account').id,characterGroup('paimon','account').id);
    assert.notEqual(characterGroup('paimon','account').id,characterGroup('paimon','another-account').id);
  });
  it('refuses cross-account inheritance and leaves conflicting sources ungrouped',async()=>{
    const {service,store,session}=await groupingRuntime();
    const a=(await service.prepare('model.segment',{project_id:'proj-a',character_name:'派蒙'})).task;
    const b=(await service.prepare('model.segment',{project_id:'proj-b',character_name:'旅行者'})).task;
    for(const t of [a,b]) await store.update(t.task_id,r=>{r.result={project_id:t.input_summary.project_id};return r;});
    const ambiguous=await resolveCharacterGroup(store,{sources:[{project_id:'proj-a'},{project_id:'proj-b'}]},await session.accountFingerprint());
    assert.equal(ambiguous.group,null);assert.match(ambiguous.warning,/multiple/);
    await assert.rejects(()=>resolveCharacterGroup(store,{},'different',{parentTaskId:a.task_id}),e=>e.code==='PLAN_MISMATCH');
    assert.equal((await resolveCharacterGroup(store,{project_id:'proj-a'},'different')).group,null);
  });
  it('corrects grouping without changing frozen hashes, settings, confirmation or existing descendants',async()=>{
    const {service,store}=await groupingRuntime();
    const a=(await service.prepare('model.segment',{project_id:'proj-1',character_name:'派蒙'})).task;
    const child=(await service.prepare('texture.pbr',{project_id:'proj-1',parent_task_id:a.task_id})).task;
    const before=await store.get(a.task_id);
    const edited=(await service.setCharacter(a.task_id,'旅行者')).task;
    assert.equal(edited.character_group.assigned_by,'manual');
    const after=await store.get(a.task_id);
    for(const field of ['request_hash','confirmation','payload','settings','status','dispatch_state']) assert.deepEqual(after[field],before[field]);
    assert.equal((await service.get(child.task_id)).task.character_group.name,'派蒙');
    assert.equal((await service.prepare('model.segment',{project_id:'proj-next',parent_task_id:a.task_id})).task.character_group.name,'旅行者');
    await service.setCharacter(a.task_id,null);
    assert.equal((await service.prepare('model.segment',{project_id:'proj-empty',parent_task_id:a.task_id})).task.character_group,null);
    assert.equal((await service.get(a.task_id)).events.at(-1).type,'task.character_changed');
  });
  it('does not create or silently move a duplicate paid task when its role differs',async()=>{
    const {service,store}=await groupingRuntime();
    const a=(await service.prepare('model.segment',{project_id:'proj-1',character_name:'派蒙'})).task;
    assert.equal((await service.prepare('model.segment',{project_id:'proj-1',character_name:'派蒙'})).task.task_id,a.task_id);
    await assert.rejects(()=>service.prepare('model.segment',{project_id:'proj-1',character_name:'旅行者'}),e=>e.code==='TASK_GROUP_CONFLICT');
    assert.equal((await store.list()).length,1);
    await assert.rejects(()=>service.prepare('model.segment',{project_id:'proj-1',character_name:'bad\nname'}));
  });
  it('counts all retained pages and filters characters before pagination, including legacy tasks',async()=>{
    const {service,store}=await groupingRuntime();
    for(let i=0;i<24;i++) {
      const prepared=await service.prepare('model.segment',{project_id:`proj-${i}`,character_name:i%2?'派蒙':'旅行者'});
      if(i===0) await store.update(prepared.task.task_id,t=>{delete t.character_group;t.status='succeeded';return t;});
    }
    const grouped=await service.listGroups();
    assert.equal(grouped.total,24);
    const paimon=grouped.groups.find(g=>g.name==='派蒙');assert.equal(paimon.total,12);
    assert.equal(grouped.groups.find(g=>g.id==='ungrouped').total,1);
    const page=await service.list({character_group_id:paimon.id,limit:5,offset:5});
    assert.equal(page.next_offset,10);assert.equal(page.tasks.length,5);
    assert.ok(page.tasks.every(t=>t.character_group.id===paimon.id));
    assert.equal((await service.listGroups({statuses:['succeeded']})).total,1);
    const legacy=(await service.list({character_group_id:'ungrouped'})).tasks;
    assert.equal(taskGroups(legacy)[0].name,'未分组');
    assert.equal(taskGroups(page.tasks)[0].tasks.length,5);
  });
});
