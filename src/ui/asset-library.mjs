import { AssetGroupStore, assetKey, applyAssetAssignments } from '../store/asset-groups.mjs';
import { assetCharacterIndex } from '../ops/asset-groups.mjs';
import { TripoError } from '../errors.mjs';
import { modelGenerationMetadata } from '../studio/model-metadata.mjs';

export function modelCard(asset) {
  return {...modelGenerationMetadata(asset),project_id:asset.id,name:asset.project_name ?? asset.biz_info?.short_description ?? asset.id,
    created_at:asset.create_time ?? null,visibility:asset.visibility ?? null,source_type:asset.type ?? null,
    running:asset.running_operator != null,is_owner:asset.is_owner === true,
    thumbnail_available:Boolean(asset.cover_image?.[0] || asset.cover_image_object?.[0]?.url)};
}
export function imageCard(asset) {
  return {asset_id:asset.asset_id,created_at:asset.create_time ?? null,type:asset.type,status:asset.status,
    input:{prompt:asset.input.prompt ?? asset.input.prompt_text ?? null},output_count:asset.output.data.length};
}

// Aggregate the actual library before paginating its visible entries. A group
// occupies one slot and its members never leak back into the root grid.
export function libraryEntries(assets, groupId) {
  const groups = new Map(), loose = [];
  for (const asset of assets) {
    const group = asset.character_group;
    if (!group) { loose.push(asset); continue; }
    if (!groups.has(group.id)) groups.set(group.id,{entry_type:'group',group_id:group.id,name:group.name,count:0,covers:[],created_at:asset.created_at});
    const entry = groups.get(group.id);
    entry.count++;
    if (entry.covers.length < 4) entry.covers.push(asset);
    if ((Date.parse(asset.created_at)||0) > (Date.parse(entry.created_at)||0)) entry.created_at=asset.created_at;
  }
  const summaries=[...groups.values()];
  const entries=groupId ? (groupId==='ungrouped'?loose:assets.filter(a=>a.character_group?.id===groupId)).map(a=>({...a,entry_type:'asset'})) : [...summaries,...loose.map(a=>({...a,entry_type:'asset'}))];
  return {entries,groups:summaries};
}

export class AssetLibrary {
  constructor({config,gateway,session,store,media}) {
    Object.assign(this,{gateway,session,store,media});
    this.groupStore=new AssetGroupStore(config.dataDir);
    this.cache=new Map();
  }
  async catalog(account,type,filter,refresh=false) {
    const key=JSON.stringify([account,type,filter]);
    const cached=this.cache.get(key);
    if (!refresh && cached && cached.expires>Date.now()) return cached.promise;
    const promise=(async()=>{
      const assets=[], seen=new Set();
      let offset=0,pageNum=1;
      for (;;) {
        const page=type==='models' ? await this.gateway.listModels({assetScope:'mine',filter,offset}) : await this.gateway.listStudioImageAssets(pageNum,100);
        const raw=type==='models'?page.projects:page.assets;
        if(type==='models')this.media?.rememberProjects(raw);
        let added=0;
        for(const item of raw) {
          const card=type==='models'?modelCard(item):imageCard(item),id=assetKey(card);
          if(!seen.has(id)){seen.add(id);assets.push(card);added++;}
        }
        offset+=raw.length;pageNum++;
        if (!raw.length || !added || (type==='models'?offset>=page.total:raw.length<100)) break;
      }
      return assets;
    })();
    const entry={promise,expires:Date.now()+30000};this.cache.set(key,entry);
    promise.catch(()=>{if(this.cache.get(key)===entry)this.cache.delete(key);});
    return promise;
  }
  async context(type,filter='all',refresh=false) {
    const account=await this.session.accountFingerprint();
    const catalog=type==='all' ? Promise.all([this.catalog(account,'models',filter,refresh),this.catalog(account,'images','all',refresh)]).then(pages=>pages.flat()) : this.catalog(account,type,filter,refresh);
    const [assets,records,saved]=await Promise.all([catalog,this.store.list({limit:5000}),this.groupStore.read(account)]);
    const sourceIndex=assetCharacterIndex(records,account);
    const sourceGroups=[...sourceIndex.values()].filter(Boolean);
    const index=applyAssetAssignments(sourceIndex,saved);
    const annotated=assets.map(a=>({...a,character_group:index.get(assetKey(a)) ?? null}));
    await this.assertAccount(account);
    return {account,assets:annotated,saved,index,sourceGroups};
  }
  async identities() {
    const account=await this.session.accountFingerprint();
    const [records,saved]=await Promise.all([this.store.list({limit:5000}),this.groupStore.read(account)]);
    await this.assertAccount(account);
    const sourceIndex=assetCharacterIndex(records,account);
    return {account,saved,index:applyAssetAssignments(sourceIndex,saved),sourceGroups:[...sourceIndex.values()].filter(Boolean)};
  }
  knownGroups({index,saved,sourceGroups=[]}) {
    const known=new Map();
    for(const group of sourceGroups)known.set(group.id,group);
    for(const group of index.values())if(group)known.set(group.id,group);
    for(const group of Object.values(saved.groups))known.set(group.id,group);
    return [...known.values()];
  }
  async assertAccount(account) {
    if(await this.session.accountFingerprint()!==account)throw new TripoError('PLAN_MISMATCH','The active account changed. Refresh the library before grouping assets.');
  }
  async listGroups({offset=0,limit=100,search='',include_empty=true,refresh=false}={}) {
    const context=await this.context('all','all',refresh);
    const known=new Map(this.knownGroups(context).map(g=>[g.id,{id:g.id,name:g.name,model_count:0,image_count:0,total:0}]));
    for(const asset of context.assets) {
      if(!asset.character_group)continue;
      const group=known.get(asset.character_group.id);
      group[asset.project_id?'model_count':'image_count']++;
      group.total++;
    }
    const query=search.trim().toLocaleLowerCase();
    const groups=[...known.values()].filter(g=>(include_empty||g.total>0)&&g.name.toLocaleLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name));
    return {groups:groups.slice(offset,offset+limit),total:groups.length,offset,next_offset:offset+limit<groups.length?offset+limit:null};
  }
  async list({type='models',filter='all',group_id,offset=0,limit=20,search='',sort='recent',refresh=false}={}) {
    const context=await this.context(type,filter,refresh),{assets}=context;
    const {entries,groups}=libraryEntries(assets,group_id);
    const known=new Map(groups.map(g=>[g.group_id,{id:g.group_id,name:g.name,count:g.count}]));
    for(const group of this.knownGroups(context))if(!known.has(group.id))known.set(group.id,{id:group.id,name:group.name,count:0});
    if(group_id && group_id!=='ungrouped' && !known.has(group_id))throw new TripoError('INVALID_INPUT','The selected group no longer exists in this account. Refresh the library.');
    let filtered=entries;
    if(search.trim()) {
      const query=search.trim().toLocaleLowerCase();
      filtered=entries.filter(e=>`${e.name ?? e.input?.prompt ?? e.type ?? ''} ${e.character_group?.name ?? ''}`.toLocaleLowerCase().includes(query) || e.entry_type==='group' && assets.some(a=>a.character_group?.id===e.group_id && `${a.name ?? a.input?.prompt ?? ''}`.toLocaleLowerCase().includes(query)));
    }
    filtered=[...filtered].sort((a,b)=>sort==='name'?String(a.name ?? a.input?.prompt ?? a.type).localeCompare(String(b.name ?? b.input?.prompt ?? b.type)):(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0));
    return {entries:filtered.slice(offset,offset+limit),groups:[...known.values()],group:group_id?known.get(group_id) ?? null:null,
      total:filtered.length,asset_count:assets.length,next_offset:offset+limit<filtered.length?offset+limit:null,offset};
  }
  async assign({type='all',assets,name,group_id},{allowEmpty=false}={}) {
    if(name!==undefined && group_id!==undefined)throw new TripoError('INVALID_INPUT','Specify a name to create a group, or a group_id to change membership, not both.');
    if(!Array.isArray(assets) || (!assets.length && !(allowEmpty && name!==undefined)))throw new TripoError('INVALID_INPUT','Select at least one asset.');
    const context=assets.length ? await this.context(type,'all',true) : await this.identities();
    const allowed=new Set((context.assets??[]).map(assetKey));
    if(assets.some(a=>Boolean(a.project_id)===Boolean(a.asset_id) || !allowed.has(assetKey(a)) || (type==='models'?!a.project_id:type==='images'?!a.asset_id:false)))throw new TripoError('INVALID_INPUT','Some selected assets are no longer in this account’s library. Refresh and select them again.');
    const unique=[...new Map(assets.map(a=>[assetKey(a),a])).values()];
    const known=this.knownGroups(context);
    let group=null;
    if(group_id) {
      group=known.find(g=>g.id===group_id);
      if(!group)throw new TripoError('INVALID_INPUT','The selected group no longer exists. Refresh the library.');
    }
    await this.assertAccount(context.account);
    const result=await this.groupStore.assign(context.account,unique,{name,group,knownGroups:known});
    return {group:result,assigned:unique.length,paid_request_sent:false};
  }
  async createGroup({name,assets=[]}) {
    return this.assign({name,assets},{allowEmpty:true});
  }
  async renameGroup({group_id,name}) {
    const context=await this.identities(),known=this.knownGroups(context);
    const group=known.find(g=>g.id===group_id);
    if(!group)throw new TripoError('INVALID_INPUT','The selected group no longer exists in this account. Refresh the library.');
    await this.assertAccount(context.account);
    return {group:await this.groupStore.rename(context.account,group,name,known),paid_request_sent:false};
  }
}
