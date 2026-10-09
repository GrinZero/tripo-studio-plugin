// Isolated MCP host: every tool response is simulated; no Studio calls or billing.
import http from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { operationCatalog } from '../../src/ops/registry.mjs';
import { modelQuote } from '../fixtures/model-quote.mjs';
import { fixtureGlb } from '../helpers/glb-fixture.mjs';
import { AssetLibrary } from '../../src/ui/asset-library.mjs';
import sharp from 'sharp';
const root = new URL('../../', import.meta.url), dir = await mkdtemp(path.join(tmpdir(), 'tripo-i18n-host-'));
await build({entryPoints:[new URL('i18n-host.mjs',import.meta.url).pathname],outfile:path.join(dir,'host.js'),bundle:true,format:'esm',platform:'browser'});
const pages = Object.fromEntries(await Promise.all(['workbench','result-card'].map(async name => {
  const html = await readFile(new URL(`ui/${name}.html`,root),'utf8'), script = await readFile(new URL(`dist/${name}.js`,root),'utf8');
  return [name,html.replace(name==='workbench'?'<!-- WORKBENCH_SCRIPT -->':'<!-- CARD_SCRIPT -->',()=>`<script>${script.replace(/<\/script/gi,'<\\/script')}</script>`)];
})));
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=';
const initialInput = {mode:'multiview',tier:'high_detail',model_version:'v3.1-20260211',face_limit:60000,geometry_quality:'standard',texture:true,texture_quality:'detailed',pbr:true,delight:true,generate_parts:false,prompt:'用户提示 日本語',front_image_path:'/assets/正面.png',left_image_path:'/assets/左側.png'};
const schema = {properties:{mode:{enum:['text','image','multiview']},tier:{enum:['high_detail','smart_mesh']},model_version:{enum:['v3.1-20260211','Nexus-v2.0-20260801']},face_limit:{type:'integer'},geometry_quality:{enum:['standard','detailed']},texture:{type:'boolean'},texture_quality:{enum:['standard','detailed','ultra']},pbr:{type:'boolean'},delight:{type:'boolean'},generate_parts:{type:'boolean'},prompt:{type:'string'},front_image_path:{type:'string'},left_image_path:{type:'string'},right_image_path:{type:'string'},back_image_path:{type:'string'},image_path:{type:'string'},t_pose:{type:'boolean'},amount:{type:'integer'}},required:['mode','tier','face_limit']};
let review, calls = [], unknownCosts = false, groupedAssets = false;
const characters = [{id:'paimon',name:'派蒙'},{id:'traveler',name:'旅行者'},{id:'ungrouped',name:'未分组'}];
const models = Array.from({length:45},(_,i)=>({project_id:`model-${i}`,name:`模型 ${i}`,created_at:'2026-10-09T00:00:00Z',visibility:'private',character_group:i===44?null:characters[i%2]}));
const images = Array.from({length:3},(_,i)=>({asset_id:`image-${i}`,input:{prompt:`图片 ${i}`},status:'success',output_count:1,character_group:i===2?null:characters[i]}));
let library,fixtureAccount=0;
const covers = await Promise.all(['#e4a24b','#6b94cc','#83ac91','#b989ac'].map(async color => 'data:image/png;base64,'+(await sharp(Buffer.from(`<svg width="320" height="256" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="256" fill="#eef0f4"/><ellipse cx="160" cy="222" rx="80" ry="12" fill="#d4d8e0"/><path d="M104 202V116Q104 92 128 92H192Q216 92 216 116V202Z" fill="${color}"/><circle cx="160" cy="65" r="38" fill="${color}"/><path d="M118 124H202M160 103V192" stroke="#fff" stroke-opacity=".35" stroke-width="4"/></svg>`)).png().toBuffer()).toString('base64')));
function reset() {
  calls=[];unknownCosts=false;groupedAssets=false;fixtureAccount++;
  const account=`fixture-${fixtureAccount}`;
  library=new AssetLibrary({config:{dataDir:dir},session:{accountFingerprint:async()=>account},store:{list:async()=>groupedAssets?[...models,...images].filter(a=>a.character_group).map(a=>({account_fingerprint:account,status:'succeeded',character_group:a.character_group,remote:a.project_id?{project_id:a.project_id}:{asset_id:a.asset_id}})):[]},gateway:{
    listModels:async({offset})=>{const all=groupedAssets?models:[{project_id:'model',name:'用户模型 日本語',created_at:'2026-10-09T00:00:00Z',visibility:'private'}];return {projects:all.slice(offset,offset+20).map(m=>({id:m.project_id,project_name:m.name,create_time:m.created_at,visibility:m.visibility})),total:all.length};},
    listStudioImageAssets:async(page,size)=>({assets:(groupedAssets?images:[]).slice((page-1)*size,page*size).map(a=>({...a,output:{data:Array.from({length:a.output_count},()=>({}))}}))})
  }});
  review={review_id:'review',revision:0,kind:'model.generate',status:'pending',input:{...initialInput},schema,quote:{estimated_credits:40},deadline_at:null,timeout_seconds:60,sources:[]};
}
reset();
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    const send = data => {res.setHeader('content-type','application/json');res.end(JSON.stringify(data));};
    if (url.pathname==='/') {res.setHeader('content-type','text/html');return res.end(`<!doctype html><meta charset="utf-8">${url.searchParams.has('layout') || url.searchParams.has('assets') ? '<style>body{margin:0}#app{height:100dvh!important;display:block}</style>' : ''}<iframe id="app" style="width:100%;height:1500px;border:0"></iframe><script type="module" src="/host.js"></script>`);}
    if (['/workbench','/card'].includes(url.pathname)) {res.setHeader('content-type','text/html');return res.end(pages[url.pathname==='/card'?'result-card':'workbench']);}
    if (url.pathname==='/host.js') {res.setHeader('content-type','text/javascript');return res.end(await readFile(path.join(dir,'host.js')));}
    if (url.pathname==='/reset') {reset();return send({});}
    if (url.pathname==='/grouped-assets') {reset();groupedAssets=true;return send({});}
    if (url.pathname==='/unknown-quote') {unknownCosts=true;return send({});}
    if (url.pathname==='/stats') return send({calls,review});
    if (url.pathname==='/result') {
      const kind=url.searchParams.get('kind');
      return send({content:[],structuredContent:kind==='quote'?{quote:{...modelQuote,estimate_expires_at:new Date(Date.now()+60000).toISOString()}}:kind==='catalog'?{operations:operationCatalog()}: {review}});
    }
    if (url.pathname==='/rpc') {
      let body='';for await (const chunk of req) body+=chunk;
      const call=JSON.parse(body), args=call.arguments??{};calls.push(call);
      if(call.name==='tripo_auth_status')return send({structuredContent:{session:{authenticated:true}}});
      if(call.name==='tripo_ui_asset_library')return send({structuredContent:await (args.action==='assign'?library.assign(args):library.list(args))});
      if(call.name==='tripo_list_asset_groups')return send({structuredContent:await library.listGroups(args)});
      if(call.name==='tripo_list_group_assets')return send({structuredContent:await library.list(args)});
      if(call.name==='tripo_create_asset_group')return send({structuredContent:await library.createGroup(args)});
      if(call.name==='tripo_set_asset_group')return send({structuredContent:await library.assign(args)});
      if(call.name==='tripo_rename_asset_group')return send({structuredContent:await library.renameGroup(args)});
      if(groupedAssets && ['tripo_list_models','tripo_list_image_assets'].includes(call.name)) {
        const isModels=call.name==='tripo_list_models', offset=isModels?args.offset??0:((args.page_num??1)-1)*20;
        const assets=(isModels?models:images).filter(a=>!args.character_group_id || (a.character_group?.id??'ungrouped')===args.character_group_id);
        return send({structuredContent:{[isModels?'models':'assets']:assets.slice(offset,offset+20),character_groups:characters,total:args.character_group_id?null:assets.length,next_offset:offset+20<assets.length?offset+20:null,has_more:offset+20<assets.length}});
      }
      if(call.name==='tripo_list_models')return send({structuredContent:{models:[{project_id:'model',name:'用户模型 日本語',created_at:'2026-10-09T00:00:00Z',visibility:'private'}],total:1,next_offset:null}});
      if(call.name==='tripo_list_task_groups')return send({structuredContent:{groups:[{id:'character',name:'用户角色 日本語',total:1},{id:'ungrouped',name:'未分组',total:0}]}});
      if(call.name==='tripo_list_tasks')return send({structuredContent:{tasks:[{task_id:'task',kind:'model.generate',status:'staged',input_summary:{prompt:'用户提示 日本語'},created_at:'2026-10-09T00:00:00Z'}],next_offset:null}});
      if(call.name==='tripo_get_task')return send({structuredContent:{task:{task_id:'task',kind:'model.generate',status:'staged',consumes_credits:true,input_summary:{prompt:'用户提示 日本語',face_limit:60000}},events:[]}});
      if(call.name==='tripo_get_model')return send({structuredContent:{project_id:'model',project_name:'用户模型 日本語',capabilities:{is_owner:true},parts:['Head','Body']}});
      if(call.name==='tripo_quote_operation')return send({structuredContent:{quote:{status:unknownCosts?'unknown':'estimated',estimated_credits:unknownCosts?null:40,estimate_expires_at:new Date(Date.now()+60000).toISOString()}}});
      if(call.name==='tripo_ui_preview'||call.name==='tripo_ui_review'&&args.action==='preview')return send({_meta:{tripo:{preview:{data_url:args.type==='model' ? `data:model/gltf-binary;base64,${fixtureGlb().toString('base64')}` : groupedAssets ? covers[(Number((args.project_id??args.asset_id??'0').split('-').at(-1))||0)%covers.length] : image}}}});
      if(call.name==='tripo_ui_review') {
        if(args.action==='ready'&&review.status==='pending'&&review.deadline_at===null)review={...review,deadline_at:Date.now()+60000};
        if(args.action==='edit')review={...review,status:'editing',revision:review.revision+1,deadline_at:null};
        if(args.action==='save') {await new Promise(resolve=>setTimeout(resolve,350));review={...review,input:args.input,status:'pending',revision:review.revision+1,deadline_at:null};}
        if(args.action==='cancel')review={...review,status:'canceled',revision:review.revision+1};
        return send({content:[],structuredContent:{review}});
      }
      return send({structuredContent:{}});
    }
    res.writeHead(404).end();
  } catch(error) {res.end(JSON.stringify({isError:true,structuredContent:{error:{message:error.message}}}));}
});
const port = Number(process.env.TRIPO_TEST_PORT ?? 43911);
server.listen(port,'127.0.0.1',()=>console.log(`I18n mock host: http://127.0.0.1:${port}`));
process.on('SIGTERM',async()=>{server.close();await rm(dir,{recursive:true,force:true});process.exit();});
