import assert from 'node:assert/strict';
import {it} from 'node:test';
import {assetCharacterIndex, assetCharacterGroups, characterAssetPage} from '../src/ops/asset-groups.mjs';
import {assetGroups} from '../ui/model.mjs';

it('joins model variants and image outputs to the active account without grouping input references', () => {
  const paimon = {id:'paimon',name:'派蒙'}, traveler = {id:'traveler',name:'旅行者'};
  const task = extra => ({account_fingerprint:'account',status:'succeeded',character_group:paimon,...extra});
  const index = assetCharacterIndex([
    task({remote:{project_id:'cleared'},character_group:null}),
    task({remote:{project_id:'cleared'}}),
    task({remote:{project_ids:['model-a','model-b',null]},result:{models:[{project_id:'model-c'}]},input_summary:{project_id:'input-model'}}),
    task({remote:{asset_id:'image-a'},result:{outputs:[{asset_id:'image-b'}]},input_summary:{asset_id:'input-image'}}),
    task({account_fingerprint:'other',remote:{project_id:'foreign'}}),
    task({status:'staged',input_summary:{project_id:'model-a'},character_group:traveler}),
    task({status:'failed',remote:{project_id:'model-a'},character_group:traveler})
  ],'account');
  for (const id of ['model-a','model-b','model-c']) assert.deepEqual(index.get(`project_id:${id}`),paimon);
  for (const id of ['image-a','image-b']) assert.deepEqual(index.get(`asset_id:${id}`),paimon);
  assert.equal(index.get('project_id:cleared'),null);
  for (const id of ['project_id:input-model','asset_id:input-image','project_id:foreign']) assert.equal(index.has(id),false);
  assert.deepEqual(assetCharacterGroups(index),[{id:'ungrouped',name:'未分组'},paimon]);
});

it('filters sparse character assets before pagination and handles ungrouped and empty results', async () => {
  const assets = Array.from({length:63},(_,i)=>({id:i,character_group:i%3 ? {id:'paimon',name:'派蒙'} : null}));
  const calls=[];
  const options = {annotate:item=>item,fetchPage:async offset=>{
    calls.push(offset);
    return {items:assets.slice(offset,offset+20),next_offset:offset+20 < assets.length ? offset+20 : null,total:assets.length};
  }};
  const first = await characterAssetPage({...options,characterGroupId:'paimon'});
  const second = await characterAssetPage({...options,characterGroupId:'paimon',offset:first.next_offset});
  const third = await characterAssetPage({...options,characterGroupId:'paimon',offset:second.next_offset});
  assert.deepEqual([first.items.length,second.items.length,third.items.length],[20,20,2]);
  assert.equal(third.next_offset,null);
  assert.equal(new Set([...first.items,...second.items,...third.items].map(a=>a.id)).size,42);
  assert.ok(first.items.every(a=>a.character_group?.id==='paimon'));
  const ungrouped = await characterAssetPage({...options,characterGroupId:'ungrouped',offset:20});
  assert.equal(ungrouped.items.length,1);assert.equal(ungrouped.next_offset,null);
  assert.equal((await characterAssetPage({...options,characterGroupId:'missing'})).items.length,0);
  calls.length=0;
  const normal = await characterAssetPage({...options,offset:20});
  assert.deepEqual(calls,[20]);assert.equal(normal.total,63);assert.equal(normal.next_offset,40);
});

it('uses the requested image page size and groups assets with legacy records left ungrouped', async () => {
  const items = [{asset_id:'a',character_group:{id:'paimon',name:'派蒙'}},{asset_id:'b'},{asset_id:'c',character_group:{id:'paimon',name:'派蒙'}}];
  const page = await characterAssetPage({characterGroupId:'paimon',limit:1,offset:1,annotate:a=>a,fetchPage:async offset=>({items:items.slice(offset,offset+1),next_offset:offset+1<items.length?offset+1:null})});
  assert.equal(page.items[0].asset_id,'c');assert.equal(page.next_offset,null);
  const groups=assetGroups(items);
  assert.deepEqual(groups.map(g=>[g.id,g.assets.length]),[['paimon',2],['ungrouped',1]]);
});
