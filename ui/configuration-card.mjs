import { t as tr, localizedMap, setText, setAttributeText } from './i18n.mjs';
import { KINDS, PARAM_LABELS } from './model.mjs';
export const LABELS = localizedMap({ ...PARAM_LABELS, tier:'生成类型', mode:'输入方式', model_version:'模型版本', geometry_quality:'超清几何', texture_quality:'贴图分辨率', generate_parts:'分件生成', quad:'四边形', t_pose:'T Pose', character_name:'角色名称', front_image_path:'正面', left_image_path:'左侧', back_image_path:'背面', right_image_path:'右侧', image_path:'参考图片', image_paths:'批量图片', studio_image_asset_id:'Studio 图片', studio_multiview_asset_id:'Studio 多视图', project_id:'源模型', parent_task_id:'上游任务', output_index:'输出编号', allow_sensitive:'允许敏感输入', enable_image_autofix:'自动修复图片' });
export const VALUES = localizedMap({high_detail:'高精度 · H3.1',smart_mesh:'Smart Mesh',standard:'标准',detailed:'精细',ultra:'超清',text:'文字',image:'图片',multiview:'四视图',batch:'独立批量',studio_image:'Studio 图片',studio_multiview:'Studio 多视图',private:'私有',public:'公开',shareable:'可分享'});
const order=['mode','tier','model_version','face_limit','geometry_quality','texture','texture_quality','delight','pbr','quad','generate_parts','amount','prompt','t_pose','visibility','front_image_path','left_image_path','back_image_path','right_image_path'];
export function fieldsFor(review) {
  const properties=review.schema.properties;
  const defaults=review.kind==='model.generate' ? ['prompt','geometry_quality','texture','texture_quality','delight','pbr','quad','generate_parts','amount','t_pose','image_path','image_paths','front_image_path','left_image_path','back_image_path','right_image_path','studio_image_asset_id','studio_multiview_asset_id'] : [];
  const keys=[...new Set([...Object.keys(review.input),...defaults])].filter(key=>properties[key] && !['submit','parent_task_id'].includes(key));
  return keys.sort((a,b)=>(order.indexOf(a)<0?100:order.indexOf(a))-(order.indexOf(b)<0?100:order.indexOf(b))).map(key=>({key,schema:properties[key],value:review.input[key]}));
}
export function optionsFor(schema) {
  return schema.enum ?? (schema.anyOf?.every(item=>item.const!==undefined) ? schema.anyOf.map(item=>item.const) : null);
}
export function readConfiguration(form,review) {
  const input={...review.input};
  for(const node of form.querySelectorAll('[data-field]')){
    const key=node.dataset.field;
    if(node.closest('label')?.hidden){delete input[key];continue;}
    if(node.dataset.unset==='true' && !node.dataset.touched)continue;
    if(node.type==='checkbox')input[key]=node.checked;
    else if(node.value===''){delete input[key];}
    else if(node.dataset.valueType==='boolean')input[key]=node.value==='true';
    else if(node.dataset.valueType==='number')input[key]=Number(node.value);
    else if(node.dataset.valueType==='json')input[key]=JSON.parse(node.value);
    else input[key]=node.value;
  }
  // These settings do not apply when textures are disabled.
  if(input.texture===false)for(const key of ['texture_quality','delight','pbr','texture_alignment'])delete input[key];
  if(input.tier==='smart_mesh')for(const key of ['geometry_quality','texture','texture_quality','delight','pbr','generate_parts','smart_poly','enable_image_autofix','segmentation_granularity','texture_alignment'])delete input[key];
  return input;
}
export function mountConfiguration(root,review,{action,onError,preview,importImage}) {
  const form=document.createElement('form');form.className='configuration';form.noValidate=false;
  const heading=document.createElement('h2');form.append(heading);
  const intro=document.createElement('p');intro.className='config-intro';form.append(intro);
  const hero=document.createElement('div');hero.className='source-strip';form.append(hero);
  const grid=document.createElement('div');grid.className='configuration-controls';form.append(grid);
  function section(title){const el=document.createElement('section');el.className='config-section';const h=document.createElement('h3');setText(h, () => tr(title));el.append(h);grid.append(el);return el;}
  const generation=section('生成配置'),generationGrid=document.createElement('div');generationGrid.className='settings-grid';generation.append(generationGrid);
  const textures=section('贴图设置'),textureGrid=document.createElement('div'),textureSwitches=document.createElement('div');textureGrid.className='settings-grid texture-grid';textureSwitches.className='texture-switches';textures.append(textureGrid);textureGrid.append(textureSwitches);
  const more=document.createElement('details');more.className='more-config';const summary=document.createElement('summary');setText(summary, () => tr("更多配置"));more.append(summary);const advanced=document.createElement('div');advanced.className='advanced-grid';more.append(advanced);grid.append(more);
  const sourceFields=new Set(['front_image_path','left_image_path','back_image_path','right_image_path','image_path','image_paths','studio_image_asset_id','studio_multiview_asset_id']);
  for(const field of fieldsFor(review)){
    const label=document.createElement('label');label.className='config-field';
    const caption=document.createElement('span');setText(caption, () => LABELS[field.key] ?? field.key);label.append(caption);
    let node;const options=optionsFor(field.schema);
    const valueType=field.schema.type ?? (typeof field.value==='object' ? 'object' : typeof field.value);
    if(options){node=document.createElement('select');if(field.value===undefined){const empty=document.createElement('option');empty.value='';setText(empty, () => tr("自动"));node.append(empty);}for(const value of options){const option=document.createElement('option');option.value=value;setText(option, () => field.key==='texture_quality'?({standard:'2K',detailed:'4K',ultra:'8K'}[value]??value):field.key==='geometry_quality'?({standard:tr("关闭 · 标准几何"),detailed:tr("开启 · 精细几何")}[value]??value):(field.key==='model_version'?({'v3.1-20260211':'H3.1','v3.0-20250812':'H3.0','v2.5-20250123':'H2.5','Nexus-v2.0-20260801':'Smart Mesh P2','Nexus-v1.0-20260214':'Smart Mesh P1'}[value]??value):VALUES[value]??value));node.append(option);}node.value=field.value ?? '';if(options.every(value=>typeof value==='number'))node.dataset.valueType='number';}
    else if(field.key==='generate_parts' && review.kind==='model.generate'){node=document.createElement('select');for(const [value,text] of [['false','完整模型'],['true','分件模型']]){const opt=document.createElement('option');opt.value=value;setText(opt, () => tr(text));node.append(opt);}node.value=String(field.value??false);node.dataset.valueType='boolean';setText(caption, () => tr("输出方式"));}
    else if(valueType==='boolean'){node=document.createElement('input');node.type='checkbox';node.checked=field.value===true;label.classList.add('toggle-field');}
    else if(['object','array'].includes(valueType)){node=document.createElement('textarea');node.value=field.value===undefined?'':JSON.stringify(field.value,null,2);node.dataset.valueType='json';label.classList.add('wide');}
    else {node=document.createElement(field.key==='prompt'?'textarea':'input');if(node.tagName==='INPUT'){node.type=['integer','number'].includes(valueType)?'number':'text';if(node.type==='number'){node.dataset.valueType='number';node.step=valueType==='integer'?'1':'any';if(field.schema.minimum!==undefined)node.min=field.schema.minimum;if(field.schema.maximum!==undefined)node.max=field.schema.maximum;}}node.value=field.value??'';if(field.key==='prompt')label.classList.add('wide');}
    node.dataset.field=field.key;node.dataset.unset=String(field.value===undefined);node.required=review.schema.required?.includes(field.key) ?? false;
    node.addEventListener('input',()=>{pause();node.dataset.touched='true';save.hidden=false;confirm.hidden=true;confirm.disabled=true;setText(notice, () => tr("配置已修改"));setText(helper, () => tr("保存后更新报价与倒计时"));});
    label.append(node);
    if(review.kind==='model.generate' && ['model_version','face_limit','geometry_quality','generate_parts'].includes(field.key))generationGrid.append(label);
    else if(review.kind==='model.generate' && field.key==='texture_quality')textureGrid.prepend(label);
    else if(review.kind==='model.generate' && ['delight','pbr'].includes(field.key))textureSwitches.append(label);
    else if(review.kind==='model.generate' && field.key==='texture'){label.classList.add('texture-enable');textures.prepend(label);}
    else {advanced.append(label);if(sourceFields.has(field.key))label.classList.add('source-input');}
    if(review.kind==='model.generate' && field.key==='geometry_quality'){
      node.className='control-proxy';node.tabIndex=-1;node.setAttribute('aria-hidden','true');node.required=false;
      const control=document.createElement('span');control.className='geometry-control';
      const toggle=document.createElement('input');toggle.type='checkbox';toggle.className='switch';toggle.dataset.i18nAriaLabel='超清几何';toggle.setAttribute('aria-label',tr("超清几何"));toggle.checked=field.value==='detailed';
      const copy=document.createElement('span');copy.className='control-copy';setText(copy, () => toggle.checked?tr("精细几何"):tr("标准几何"));
      toggle.addEventListener('change',()=>{node.value=toggle.checked?'detailed':'standard';setText(copy, () => toggle.checked?tr("精细几何"):tr("标准几何"));node.dispatchEvent(new Event('input',{bubbles:true}));});control.append(toggle,copy);label.append(control);
    }
    if(field.key==='texture_quality'){
      node.className='control-proxy';node.tabIndex=-1;node.setAttribute('aria-hidden','true');node.required=false;
      const segments=document.createElement('div');segments.className='segments';segments.setAttribute('role','group');segments.dataset.i18nAriaLabel='贴图分辨率';segments.setAttribute('aria-label',tr("贴图分辨率"));
      for(const [value,text] of [['standard','2K'],['detailed','4K'],['ultra','8K']]){const option=document.createElement('button');option.type='button';setText(option, () => text);option.classList.toggle('selected',field.value===value);option.setAttribute('aria-pressed',String(field.value===value));option.onclick=()=>{node.value=value;for(const button of segments.children){button.classList.toggle('selected',button===option);button.setAttribute('aria-pressed',String(button===option));}node.dispatchEvent(new Event('input',{bubbles:true}));};segments.append(option);}label.append(segments);
    }
    if(node.type==='checkbox'){node.classList.add('switch');node.setAttribute('role','switch');}

  }
  if(review.kind!=='model.generate'){generation.hidden=true;textures.hidden=true;setText(summary, () => tr("任务配置"));more.open=true;}
  const footer=document.createElement('div');footer.className='config-footer';form.append(footer);
  const actionRow=document.createElement('div');actionRow.className='config-action-row';footer.append(actionRow);
  const cost=document.createElement('div');cost.className='config-cost';
  const costMain=document.createElement('div');costMain.className='cost-main';const costCaption=document.createElement('span');setText(costCaption, () => tr("预计费用"));costMain.append(costCaption);
  const amount=document.createElement('strong');setText(amount, () => Number.isFinite(review.quote?.estimated_credits)?review.quote.estimated_credits:tr("待确认"));costMain.append(amount);
  if(Number.isFinite(review.quote?.estimated_credits)){const unit=document.createElement('span');setText(unit, () => tr("积分"));costMain.append(unit);}
  const billing=document.createElement('small');setText(billing, () => tr("最终以服务扣费为准"));cost.append(costMain,billing);actionRow.append(cost);
  const buttons=document.createElement('div');buttons.className='config-actions';actionRow.append(buttons);
  const cancel=document.createElement('button');cancel.type='button';setText(cancel, () => tr("取消"));
  const save=document.createElement('button');save.type='submit';save.className='primary';setText(save, () => tr("保存并更新报价"));save.hidden=review.status!=='editing';
  const confirm=document.createElement('button');confirm.type='button';confirm.className='primary';setText(confirm, () => review.kind==='model.generate'?tr("确认并生成  →"):tr("确认并提交  →"));confirm.disabled=review.status!=='pending';confirm.hidden=review.status==='editing';buttons.append(cancel,save,confirm);
  const countdown=document.createElement('div');countdown.className='countdown';footer.append(countdown);
  const clock=document.createElement('span');clock.className='clock-icon';setText(clock, () => '◷');clock.setAttribute('aria-hidden','true');
  const notice=document.createElement('span');notice.className='config-notice';notice.setAttribute('role','status');
  const helper=document.createElement('span');helper.className='countdown-helper';setText(helper, () => tr("修改配置会暂停计时"));countdown.append(clock,notice,helper);
  const track=document.createElement('div');track.className='countdown-track';const progress=document.createElement('span');track.append(progress);footer.append(track);
  let current=review,editingRequest,working=false,disposed=false,saving=false;
  function busy(value){working=value;cancel.disabled=value;save.disabled=value;confirm.disabled=value||current.status!=='pending';}
  function freeze(value){form.querySelectorAll('input,select,textarea,.segments button,.source-replace').forEach(node=>node.disabled=value);}
  async function run(name,input){
    busy(true);if(name!=='edit')freeze(true);
    if(name==='save'){
      saving=true;setText(save, () => tr("正在保存并更新报价…"));form.setAttribute('aria-busy','true');
      setText(notice, () => tr("正在保存配置并更新报价…"));setText(helper, () => tr("准备输入素材与查询费用中，完成后重新计时"));
    }
    try{const result=await action(name,current.revision,input);current=result.review;return result;}
    catch(e){if(name==='save'&&!disposed){setText(notice, () => tr("保存失败，请重试"));setText(helper, () => tr("自动提交已暂停"));}onError(e);throw e;}
    finally{if(name==='save'){saving=false;if(!disposed){setText(save, () => tr("保存并更新报价"));form.removeAttribute('aria-busy');}}if(!disposed){busy(false);freeze(false);tick();}}
  }
  function pause(){
    if(current.status!=='pending'||editingRequest)return;
    // Pause on focus, before the first edit; persist the pause on the server.
    current={...current,status:'editing'};save.hidden=false;confirm.hidden=true;confirm.disabled=true;setText(notice, () => tr("编辑中"));setText(helper, () => tr("自动提交已暂停"));
    editingRequest=run('edit').catch(()=>null).finally(()=>{editingRequest=null;});
  }
  const node=key=>grid.querySelector(`[data-field="${key}"]`);
  function updateTitle(){
    const values={...review.input,mode:node('mode')?.value??review.input.mode,tier:node('tier')?.value??review.input.tier};
    setText(heading, () => review.kind==='model.generate'?((node('tier')?.value??review.input.tier)==='smart_mesh'?tr("Smart Mesh 模型生成"):tr("高精度模型生成")):(KINDS[review.kind]??tr("任务配置")));
    setText(intro, () => review.kind==='model.generate'?tr("{0}输入 · {1}", { "0": VALUES[node('mode')?.value??review.input.mode]??tr("素材"), "1": (node('mode')?.value??review.input.mode)==='batch'?tr("每张图片独立生成模型"):(node('generate_parts')?.value==='true'?tr("分件模型"):tr("1 个完整模型")) }):tr("检查本次设置，确认后开始处理。"));
  }
  if(review.kind==='model.generate'){
    const node=key=>grid.querySelector(`[data-field="${key}"]`);
    const sources={text:['prompt','t_pose'],image:['image_path'],multiview:['front_image_path','left_image_path','back_image_path','right_image_path'],batch:['image_paths'],studio_image:['studio_image_asset_id','output_index'],studio_multiview:['studio_multiview_asset_id']};
    const sourceKeys=[...new Set(Object.values(sources).flat())];
    function visibility(){
      const mode=node('mode')?.value,tier=node('tier')?.value,texture=node('texture')?.checked;
      for(const key of sourceKeys)if(node(key))node(key).closest('label').hidden=!(sources[mode]??[]).includes(key);
      for(const key of ['geometry_quality','texture','texture_quality','delight','pbr','generate_parts'])if(node(key))node(key).closest('label').hidden=tier==='smart_mesh'||(key==='geometry_quality'&&node('model_version')?.value!=='v3.1-20260211')||(!texture&&['texture_quality','delight','pbr'].includes(key));
      textures.hidden=tier==='smart_mesh';
      if(node('amount'))node('amount').closest('label').hidden=tier!=='smart_mesh';
      if(node('model_version'))for(const option of node('model_version').options)option.hidden=tier==='smart_mesh'?!option.value.startsWith('Nexus'):option.value.startsWith('Nexus');
    }
    node('tier')?.addEventListener('change',()=>{const version=node('model_version');if(version){version.value=node('tier').value==='smart_mesh'?'Nexus-v2.0-20260801':'v3.1-20260211';version.dataset.touched='true';}visibility();updateTitle();});
    node('model_version')?.addEventListener('change',visibility);node('mode')?.addEventListener('change',()=>{visibility();updateTitle();hydrateSources();});node('generate_parts')?.addEventListener('change',updateTitle);node('texture')?.addEventListener('change',visibility);visibility();
  }
  async function pauseBeforeChange(){pause();await editingRequest;if(current.status!=='editing')throw Error(tr("未能暂停提交，请重试。"));}
  let sourceEpoch=0;
  function hydrateSources(){
    const stamp=++sourceEpoch;observers.forEach(observer=>observer.disconnect());observers.length=0;hero.replaceChildren();
    const mode=node('mode')?.value??review.input.mode;
    const slots=mode==='text'?[]:['multiview','studio_multiview'].includes(mode)?[['front',tr("正面"),'front_image_path'],['left',tr("左侧"),'left_image_path'],['back',tr("背面"),'back_image_path'],['right',tr("右侧"),'right_image_path']]:['image','studio_image'].includes(mode)?[['image',tr("参考图片"),'image_path']]:mode==='batch'?(review.sources??[]).slice(0,4).map(s=>[s.slot,s.name,'image_paths']):(review.sources??[]).slice(0,4).map(s=>[s.slot,s.name,null]);
    hero.hidden=slots.length===0;
    hero.classList.toggle('single-source',slots.length===1);
    for(const [slot,name,key] of slots){
      const localizedName=()=>['multiview','studio_multiview'].includes(mode)?tr(({front:'正面',left:'左侧',back:'背面',right:'右侧'})[slot]):['image','studio_image'].includes(mode)?tr('参考图片'):name;
      const tile=document.createElement('div');tile.className='source-tile';const picture=document.createElement('div');picture.className='source-picture';setText(picture, () => tr("加载中"));const caption=document.createElement('span');caption.className='source-caption';setText(caption, localizedName);tile.append(picture,caption);hero.append(tile);let replaced=false,replace;
      if(preview)preview(slot,review).then(data=>{if(disposed||replaced||stamp!==sourceEpoch)return;if(!/^data:image\/(webp|png|jpeg);base64,/.test(data?.data_url??''))throw Error(tr("暂无预览"));const image=document.createElement('img');image.src=data.data_url;setAttributeText(image,'alt',localizedName);picture.replaceChildren(image,...(replace?[replace]:[]));}).catch(()=>{if(!disposed&&stamp===sourceEpoch)setText(picture, () => tr("暂无预览"));});else setText(picture, () => tr("暂无预览"));
      if(key && key!=='image_paths' && !mode.startsWith('studio_') && importImage){
        replace=document.createElement('button');replace.type='button';replace.className='source-replace';setText(replace, () => '↥');setAttributeText(replace,'aria-label',()=>tr("替换{0}图片", { "0": localizedName() }));setAttributeText(replace,'title',()=>tr("替换{0}图片", { "0": localizedName() }));
        const picker=document.createElement('input');picker.type='file';picker.accept='image/png,image/jpeg,image/webp';picker.hidden=true;
        replace.onclick=async()=>{try{await pauseBeforeChange();picker.click();}catch(e){onError(e);}};
        picker.onchange=async()=>{const file=picker.files?.[0];if(!file)return;try{await pauseBeforeChange();busy(true);const imported=await importImage(file);if(disposed)return;replaced=true;const target=node(key);target.value=imported.file_path;target.dispatchEvent(new Event('input',{bubbles:true}));const image=document.createElement('img');image.src=imported.preview.data_url;setAttributeText(image,'alt',localizedName);picture.replaceChildren(image,...(replace?[replace]:[]));}catch(e){onError(e);}finally{if(!disposed)busy(false);picker.value='';}};
        picture.append(replace);tile.append(picker);
        // Preserve the replace control when the thumbnail resolves.
        if(preview)picture.dataset.replace='true';
        const observer=new MutationObserver(()=>{if(!picture.contains(replace))picture.append(replace);});observer.observe(picture,{childList:true});observers.push(observer);
      }
    }
  }
  const observers=[];updateTitle();hydrateSources();
  grid.addEventListener('focusin',event=>{if(event.target.matches('input,select,textarea,.segments button'))pause();});
  form.onsubmit=async event=>{event.preventDefault();if(working||disposed)return;await editingRequest;if(disposed)return;try{await run('save',readConfiguration(form,current));}catch{}};
  confirm.onclick=async()=>{if(!working)try{await run('confirm');}catch{}};
  cancel.onclick=async()=>{if(!working)try{await editingRequest;await run('cancel');}catch{}};
  function tick(){if(disposed||saving)return;if(current.status==='pending'){const seconds=Math.max(0,Math.ceil((current.deadline_at-Date.now())/1000));setText(notice, () => seconds?tr("{0} 秒后自动提交", { "0": seconds }):tr("正在自动提交…"));progress.style.transform=`scaleX(${seconds/(current.timeout_seconds??60)})`;}else if(current.status==='editing'){progress.style.transform='scaleX(0)';}
    if(current.status==='editing'){if(!notice.textContent)setText(notice, () => tr("编辑中"));setText(helper, () => tr("自动提交已暂停"));}}
  tick();const timer=setInterval(tick,250);root.append(form);
  const close=document.getElementById('closeCard');if(close){close.hidden=false;close.onclick=()=>cancel.click();}
  return {dispose(){disposed=true;clearInterval(timer);observers.forEach(observer=>observer.disconnect());if(close){close.hidden=true;close.onclick=null;}},update(record){if(record.revision<current.revision || current.status==='editing'&&record.status==='pending'&&record.revision===current.revision)return;current=record;confirm.disabled=working||record.status!=='pending';}};
}
