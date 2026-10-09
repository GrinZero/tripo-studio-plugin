import assert from 'node:assert/strict';
import {it} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {AssetLibrary} from '../src/ui/asset-library.mjs';
import {AssetGroupStore} from '../src/store/asset-groups.mjs';

async function fixture(t) {
  const dataDir=await mkdtemp(path.join(tmpdir(),'tripo-asset-library-'));
  t.after(()=>rm(dataDir,{recursive:true,force:true}));
  let account='account';
  const projects=Array.from({length:45},(_,i)=>({id:`model-${i}`,project_name:`Model ${i}`,create_time:'2026-10-09T00:00:00Z',is_owner:true}));
  const images=[{asset_id:'image',input:{prompt:'Reference'},output:{data:[{}]},status:'success'}];
  const calls=[];
  const records=projects.slice(0,44).map((p,i)=>({account_fingerprint:'account',status:'succeeded',remote:{project_id:p.id},character_group:{id:i%2?'traveler':'paimon',name:i%2?'旅行者':'派蒙'}}));
  const runtime={config:{dataDir},session:{accountFingerprint:async()=>account},store:{list:async()=>records},gateway:{
    listModels:async({offset})=>{calls.push(['models',offset]);return {projects:projects.slice(offset,offset+20),total:projects.length};},
    listStudioImageAssets:async(page,size)=>{calls.push(['images',page]);return {assets:images.slice((page-1)*size,page*size)};}
  }};
  return {runtime,records,library:new AssetLibrary(runtime),calls,switchAccount:value=>{account=value;}};
}

it('collapses all pages into exact-count group cards and pages only members inside a group',async t=>{
  const {library,calls}=await fixture(t);
  const root=await library.list();
  assert.equal(root.total,3);assert.equal(root.asset_count,45);assert.equal(root.next_offset,null);
  const group=root.entries.find(e=>e.group_id==='paimon');
  assert.equal(group.count,22);assert.equal(group.covers.length,4);
  assert.deepEqual(root.entries.filter(e=>e.entry_type==='asset').map(e=>e.project_id),['model-44']);
  assert.deepEqual(calls,[['models',0],['models',20],['models',40]]);
  const first=await library.list({group_id:'paimon'}),last=await library.list({group_id:'paimon',offset:20});
  assert.equal(first.entries.length,20);assert.equal(first.total,22);assert.equal(first.next_offset,20);
  assert.equal(last.entries.length,2);assert.equal(last.next_offset,null);
  assert.equal(new Set([...first.entries,...last.entries].map(e=>e.project_id)).size,22);
  assert.equal(calls.length,3,'paging should reuse the remote snapshot');
  const search=await library.list({search:'Model 40'});
  assert.equal(search.entries.length,1);assert.equal(search.entries[0].group_id,'paimon');
});

it('persists bulk grouping of old assets, moves members, clears empty cards, and survives restart',async t=>{
  const {runtime,library}=await fixture(t);
  const created=await library.assign({assets:[{project_id:'model-0'},{project_id:'model-44'}],name:'机械设计'});
  assert.equal(created.assigned,2);assert.equal(created.paid_request_sent,false);
  const restarted=new AssetLibrary(runtime),root=await restarted.list();
  const card=root.entries.find(e=>e.group_id===created.group.id);
  assert.equal(card.count,2);assert.ok(!root.entries.some(e=>['model-0','model-44'].includes(e.project_id)));
  const joined=await restarted.assign({assets:[{project_id:'model-2'}],group_id:created.group.id});
  assert.equal(joined.group.id,created.group.id);
  assert.equal((await restarted.list({group_id:created.group.id})).total,3);
  await restarted.assign({assets:[{project_id:'model-0'},{project_id:'model-2'},{project_id:'model-44'}]});
  const after=await restarted.list();
  assert.ok(!after.entries.some(e=>e.group_id===created.group.id),'empty groups must not occupy a library card');
  assert.ok(after.entries.some(e=>e.project_id==='model-0' && !e.character_group),'removed assets must not revive inherited membership');
});

it('groups images into an existing model identity, isolates accounts, and rejects invalid selections before writing',async t=>{
  const {runtime,library,switchAccount}=await fixture(t);
  const imageRoot=await library.list({type:'images'});
  assert.ok(imageRoot.groups.some(g=>g.id==='paimon'));
  await library.assign({type:'images',assets:[{asset_id:'image'}],group_id:'paimon'});
  const images=await library.list({type:'images'});
  assert.equal(images.entries[0].entry_type,'group');assert.equal(images.entries[0].count,1);
  await assert.rejects(library.assign({assets:[{project_id:'unknown'}],name:'Invalid'}),/no longer/);
  await assert.rejects(library.assign({type:'models',assets:[{asset_id:'image'}],name:'Invalid'}),/no longer/);
  await assert.rejects(library.assign({assets:[{project_id:'model-44'}],group_id:'missing'}),/no longer/);
  switchAccount('other');
  const other=await library.list({type:'images'});
  assert.equal(other.entries[0].entry_type,'asset');assert.equal(other.groups.length,0);
  assert.deepEqual(await new AssetGroupStore(runtime.config.dataDir).read('other'),{groups:{},assignments:{}});
});

it('serializes concurrent manual assignments without dropping either group',async t=>{
  const {runtime}=await fixture(t);
  const one=new AssetGroupStore(runtime.config.dataDir),two=new AssetGroupStore(runtime.config.dataDir);
  await Promise.all([one.assign('account',[{project_id:'a'}],{name:'Group A'}),two.assign('account',[{project_id:'b'}],{name:'Group B'})]);
  const state=await one.read('account');
  assert.equal(Object.keys(state.assignments).length,2);assert.equal(Object.keys(state.groups).length,2);
});

it('renames automatic identity across models, images and future outputs without changing task roles',async t=>{
  const {runtime,records,library}=await fixture(t);
  const original=structuredClone(records);
  await library.assign({assets:[{asset_id:'image'}],group_id:'paimon'});
  const renamed=await library.renameGroup({group_id:'paimon',name:'  派蒙 · 角色资产  '});
  assert.equal(renamed.group.id,'paimon');assert.equal(renamed.group.name,'派蒙 · 角色资产');
  const root=await library.listGroups();
  assert.deepEqual(root.groups.find(g=>g.id==='paimon'),{id:'paimon',name:'派蒙 · 角色资产',model_count:22,image_count:1,total:23});
  assert.equal((await library.list({type:'images'})).entries[0].name,'派蒙 · 角色资产');
  assert.deepEqual(records,original,'renaming assets must not edit task roles');
  records.unshift({account_fingerprint:'account',status:'succeeded',remote:{project_id:'model-44'},character_group:{id:'paimon',name:'派蒙'}});
  const reopened=new AssetLibrary(runtime);
  assert.equal((await reopened.list({group_id:'paimon'})).total,23);
  assert.equal((await reopened.list()).entries.find(g=>g.group_id==='paimon').name,'派蒙 · 角色资产');
  await assert.rejects(reopened.renameGroup({group_id:'paimon',name:'旅行者'}),/already uses/);
});

it('keeps empty identities available, supports mixed selection atomically and separates names from stable ids',async t=>{
  const {runtime,library,calls}=await fixture(t);
  const empty=await library.createGroup({name:' Ａ  Design '});
  assert.equal(calls.length,0,'empty creation should not fetch remote assets');
  assert.equal(empty.assigned,0);
  assert.equal((await library.createGroup({name:'a design'})).group.id,empty.group.id);
  await library.assign({group_id:empty.group.id,assets:[{project_id:'model-44'},{asset_id:'image'},{asset_id:'image'}]});
  const mixed=await library.list({type:'all',group_id:empty.group.id});
  assert.equal(mixed.total,2);assert.equal(mixed.entries.length,2);
  await library.renameGroup({group_id:empty.group.id,name:'Renamed'});
  const fresh=await library.createGroup({name:'A Design'});
  assert.notEqual(fresh.group.id,empty.group.id,'old names must not redirect to renamed groups');
  const before=await library.groupStore.read('account');
  await assert.rejects(library.assign({group_id:fresh.group.id,assets:[{project_id:'model-44'},{asset_id:'unknown'}]}),/no longer/);
  assert.deepEqual(await library.groupStore.read('account'),before,'invalid batch must not partly move members');
  await library.assign({group_id:null,assets:[{project_id:'model-44'},{asset_id:'image'}]});
  assert.ok(!(await new AssetLibrary(runtime).list()).entries.some(e=>e.group_id===empty.group.id));
  const allPaimon=(await library.list({group_id:'paimon',limit:100})).entries.map(a=>({project_id:a.project_id}));
  await library.assign({assets:allPaimon,group_id:null});
  assert.equal((await library.list({group_id:'paimon'})).total,0,'removing the last automatic member should still allow the empty member page');
  assert.ok((await library.listGroups()).groups.some(g=>g.id==='paimon'&&g.total===0));
  assert.ok(!(await library.listGroups({include_empty:false})).groups.some(g=>g.id==='paimon'));
});

it('does not revert a concurrent rename when assigning with a previously resolved group',async t=>{
  const {runtime,library}=await fixture(t);
  const created=await library.createGroup({name:'Original'});
  await library.renameGroup({group_id:created.group.id,name:'New name'});
  const staleWriter=new AssetGroupStore(runtime.config.dataDir);
  await staleWriter.assign('account',[{project_id:'model-44'}],{group:created.group,knownGroups:[created.group]});
  assert.equal((await library.list()).entries.find(g=>g.group_id===created.group.id).name,'New name');
});

it('rejects reads and mutations when the active account changes during catalog traversal',async t=>{
  const {runtime,library,switchAccount}=await fixture(t);
  const read=runtime.gateway.listModels;
  runtime.gateway.listModels=async args=>{const result=await read(args);switchAccount('other');return result;};
  await assert.rejects(library.createGroup({name:'Unsafe',assets:[{project_id:'model-44'}]}),/account changed/);
  assert.deepEqual(await library.groupStore.read('account'),{groups:{},assignments:{}});
  assert.deepEqual(await library.groupStore.read('other'),{groups:{},assignments:{}});
});
