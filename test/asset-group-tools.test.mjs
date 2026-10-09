import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { registerAssetGroupTools } from '../src/ops/asset-group-tools.mjs';
import { AssetLibrary } from '../src/ui/asset-library.mjs';
import { fail } from '../src/mcp/result.mjs';

it('executes the agent asset-group lifecycle through MCP and shares persisted state with the workbench',async t=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'tripo-agent-groups-'));
  t.after(()=>rm(dataDir,{recursive:true,force:true}));
  let account='account';
  const calls=[];
  const runtime={config:{dataDir},session:{accountFingerprint:async()=>account},store:{list:async()=>[]},gateway:{
    listModels:async({offset})=>{calls.push('listModels');return {projects:offset?[]:[{id:'model-a',project_name:'A'},{id:'model-b',project_name:'B'}],total:2};},
    listStudioImageAssets:async()=>{calls.push('listImages');return {assets:[{asset_id:'image-a',input:{prompt:'Reference'},output:{data:[{}]}}]};}
  }};
  const library=new AssetLibrary(runtime),server=new McpServer({name:'asset-group-test',version:'1'});
  registerAssetGroupTools((name,config,handler)=>registerAppTool(server,name,{...config,_meta:{ui:{visibility:['model','app']}}},async input=>{try{return await handler(input);}catch(error){return fail(error);}}),library);
  const client=new Client({name:'agent',version:'1'}),[clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport),client.connect(clientTransport)]);
  t.after(async()=>{await client.close();await server.close();});
  const call=async(name,args)=>{
    const result=await client.callTool({name,arguments:args});
    assert.notEqual(result.isError,true,JSON.stringify(result));
    return result.structuredContent;
  };
  const registered=await client.listTools();
  assert.equal(registered.tools.length,5);
  for(const tool of registered.tools){assert.deepEqual(tool._meta.ui.visibility,['model','app']);assert.equal(tool._meta.ui.resourceUri,undefined);}
  const created=await call('tripo_create_asset_group',{name:'Agent group',assets:[{project_id:'model-a'},{asset_id:'image-a'}]});
  const groupId=created.group.id;
  assert.equal(created.assigned,2);assert.equal(created.paid_request_sent,false);
  const groups=await call('tripo_list_asset_groups',{});
  assert.deepEqual(groups.groups,[{id:groupId,name:'Agent group',model_count:1,image_count:1,total:2}]);
  const first=await call('tripo_list_group_assets',{group_id:groupId,limit:1});
  const second=await call('tripo_list_group_assets',{group_id:groupId,offset:first.next_offset,limit:1});
  assert.equal(first.total,2);assert.equal(first.assets.length,1);assert.equal(second.assets.length,1);
  assert.equal(new Set([...first.assets,...second.assets].map(a=>a.project_id??a.asset_id)).size,2);
  const empty=await call('tripo_create_asset_group',{name:'Empty'});
  assert.equal(empty.assigned,0);
  await call('tripo_set_asset_group',{group_id:empty.group.id,assets:[{project_id:'model-a'},{project_id:'model-b'}]});
  const renamed=await call('tripo_rename_asset_group',{group_id:empty.group.id,name:'Renamed by agent'});
  assert.equal(renamed.group.id,empty.group.id);
  const workbench=new AssetLibrary(runtime);
  const card=(await workbench.list()).entries.find(e=>e.group_id===empty.group.id);
  assert.equal(card.name,'Renamed by agent');assert.equal(card.count,2);
  const conflict=await client.callTool({name:'tripo_rename_asset_group',arguments:{group_id:empty.group.id,name:' agent   group '}});
  assert.equal(conflict.isError,true);assert.equal(conflict.structuredContent.error.code,'GROUP_NAME_CONFLICT');
  const before=await library.groupStore.read(account);
  const invalid=await client.callTool({name:'tripo_set_asset_group',arguments:{group_id:groupId,assets:[{project_id:'model-a'},{asset_id:'unknown'}]}});
  assert.equal(invalid.isError,true);assert.deepEqual(await library.groupStore.read(account),before);
  const malformed=await client.callTool({name:'tripo_set_asset_group',arguments:{group_id:groupId,assets:[{project_id:'model-a',asset_id:'image-a'}]}});
  assert.equal(malformed.isError,true);
  await call('tripo_set_asset_group',{group_id:null,assets:[{project_id:'model-a'},{project_id:'model-b'}]});
  assert.equal((await call('tripo_list_group_assets',{group_id:empty.group.id})).total,0);
  assert.equal((await call('tripo_list_group_assets',{group_id:'ungrouped',type:'models'})).total,2);
  account='other';
  assert.equal((await call('tripo_list_asset_groups',{})).total,0);
  const foreign=await client.callTool({name:'tripo_set_asset_group',arguments:{group_id:groupId,assets:[{project_id:'model-a'}]}});
  assert.equal(foreign.isError,true);
  assert.deepEqual(await library.groupStore.read('other'),{groups:{},assignments:{}});
  assert.ok(calls.every(name=>name.startsWith('list')),'management must never issue paid or remote write calls');
});
