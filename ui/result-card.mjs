import { t as tr, setText, initializeI18n, mountLanguageSelector, setHostLocale, onLocaleChange } from './i18n.mjs';
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { OpenAIExtensions } from '@openai/mcp-extensions/app';
import { mountModel } from './viewer.mjs';
import { mountConfiguration } from './configuration-card.mjs';
import { cardItems, operationGroups, taskContextSummary } from './card-model.mjs';
import { mountQuote } from './quote-card.mjs';
import { parameterRows } from './model.mjs';
const app = new App({name:'Tripo Studio',version:'0.3.7'}, {}, {autoResize:true});
new OpenAIExtensions(app);
const $ = id => document.getElementById(id);
initializeI18n();
mountLanguageSelector($('language'));
setText($('status'), () => tr('等待结果'));
setText($('message'), () => tr('正在处理…'));
let ready = false, latest, epoch = 0, viewers = [], dark = false, configuration, quoteView, reviewPoll, taskPoll, downloadPoll, downloadViews = [], polling = false;
const expandedInputs = new Set();
function attachInput(info, item, current) {
  if (!item.input) return;
  const { prompt, sources, parameters, summary: excerpt } = item.input;
  const key = item.taskId ?? item.title;
  const details = document.createElement('details'), summary = document.createElement('summary');
  const label = document.createElement('span'), snippet = document.createElement('span'), action = document.createElement('span');
  details.className = 'result-input'; details.open = expandedInputs.has(key);
  label.className = 'result-input-label'; snippet.className = 'result-input-excerpt'; action.className = 'result-input-action';
  setText(label, () => tr("生成输入")); setText(snippet, () => excerpt);
  // The visible snippet is a preview; assistive technology gets a short toggle label.
  snippet.setAttribute('aria-hidden', 'true');
  const updateAction = () => setText(action, () => details.open ? tr("收起") : tr("展开"));
  updateAction(); summary.append(label, snippet, action); details.append(summary);
  const body = document.createElement('div'); body.className = 'result-input-body'; details.append(body);
  if (prompt) {
    const heading = document.createElement('h3'), text = document.createElement('p');
    setText(heading, () => tr("描述")); text.className = 'result-input-prompt'; setText(text, () => prompt); body.append(heading, text);
  }
  const previews = [];
  if (sources.length) {
    const strip = document.createElement('div'); strip.className = 'result-input-sources';
    for (const source of sources) {
      const tile = document.createElement('figure'), caption = document.createElement('figcaption');
      const label = document.createElement('span'), name = document.createElement('span');
      setText(label, () => source.label); setText(name, () => source.name); name.title = source.name;
      caption.append(label, name);
      if (source.preview) {
        const picture = document.createElement('div'); picture.className = 'result-input-picture';
        setText(picture, () => tr("正在加载预览…")); tile.append(picture); previews.push({ source, picture });
      }
      tile.append(caption); strip.append(tile);
    }
    body.append(strip);
  }
  if (parameters.length) {
    const heading = document.createElement('h3'), rows = document.createElement('dl');
    setText(heading, () => tr("生成参数")); rows.className = 'result-input-parameters';
    for (const [label, value] of parameters) {
      const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      setText(dt, () => label); setText(dd, () => value); row.append(dt, dd); rows.append(row);
    }
    body.append(heading, rows);
  }
  let loaded = false;
  const load = () => {
    if (loaded || !details.open) return; loaded = true;
    for (const { source, picture } of previews) void call('tripo_ui_preview', source.preview).then(result => {
      if (current !== epoch) return;
      const url = result._meta?.tripo?.preview?.data_url;
      if (!/^data:image\/(webp|png|jpeg);base64,/.test(url ?? '')) throw Error(tr("暂无预览"));
      const image = document.createElement('img'); image.src = url; image.alt = source.label; picture.replaceChildren(image);
    }).catch(() => { if (current === epoch) setText(picture, () => tr("暂无预览")); });
  };
  details.ontoggle = () => {
    if (current !== epoch) return;
    if (details.open) expandedInputs.add(key); else expandedInputs.delete(key);
    updateAction(); load();
  };
  info.append(details); load();
}
function context(ctx) {
  setHostLocale(ctx?.locale);
  if (ctx?.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  const theme = ctx?.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme=theme;applyDocumentTheme(theme); dark = theme === 'dark'; viewers.forEach(viewer => viewer.theme(dark));configuration?.theme(dark);
}
app.onhostcontextchanged = context;
// Configuration copy updates in place through bindings, retaining edits and deadlines.
onLocaleChange(() => { if (ready && latest && !configuration) render(latest); });
const hasArtifactPreview = () => cardItems(latest?.structuredContent).some(item=>item.preview);
app.ontoolinput = () => { if (!hasArtifactPreview()) setText($('status'), () => tr("处理中")); };
app.ontoolresult = result => {
  if (result._meta?.tripo?.presentation === 'data') {
    if (!result.isError && result.structuredContent?.download) {
      for (const view of downloadViews) if (downloadMatches(view.target, result.structuredContent.source)) view.update(result.structuredContent.download);
    }
    return;
  }
  latest = result; if (ready) render(result);
};
app.ontoolcancelled = () => { if(hasArtifactPreview())return;epoch++;configuration?.dispose();quoteView?.dispose();clearTimeout(reviewPoll);clearTimeout(taskPoll);clearTimeout(downloadPoll); viewers.forEach(v=>v.dispose()); viewers=[]; $('items').replaceChildren(); setText($('status'), () => tr("已取消")); setText($('message'), () => tr("调用已取消。")); };
async function call(name, args) {
  const result = await app.callServerTool({name, arguments:args}, {timeout:60000});
  if (result.isError) throw Error(result.structuredContent?.error?.message ?? tr("读取失败"));
  return result;
}
function downloadMatches(target, source = {}) {
  return ['task_id','project_id','asset_id'].some(key => target[key] && target[key] === source[key])
    && (target.output_index ?? 0) === (source.output_index ?? 0)
    && (!source.artifact || !target.artifact || source.artifact === target.artifact);
}
function attachDownload(info, item, current, onSaved) {
  const target=item.downloadTarget, section=document.createElement('div'), saved=document.createElement('div'), message=document.createElement('span'), button=document.createElement('button');
  section.className='saved-artifact';saved.className='saved-summary';message.className='saved-status';message.setAttribute('role','status');setText(button, () => tr("下载到本地"));
  section.append(saved,message,button);info.append(section);
  let savedKey;
  const update=download=>{
    if(current!==epoch || !download?.path)return;
    const key=JSON.stringify(download);if(key===savedKey)return;savedKey=key;
    saved.replaceChildren();setText(message, () => tr("已保存到本地"));message.className='saved-status';setText(button, () => tr("重新下载"));
    const card=cardItems({download})[0],badge=document.createElement('span'),location=document.createElement('span');
    badge.className='meta-pill';location.className='artifact-path';
    setText(badge, () => card.badge);setText(location, () => card.shortFilePath);
    location.title=card.blenderPath ? `${card.path}\n${tr("Blender 文件")}: ${card.blenderPath}` : card.path;
    saved.append(badge);
    if(card.blenderPath){const blender=document.createElement('span');blender.className='meta-pill meta-pill-subtle';setText(blender, () => tr("Blender 文件"));blender.title=card.blenderPath;saved.append(blender);}
    saved.append(location);
    if(card.warning){const warning=document.createElement('p');warning.className='error compact-warning';setText(warning, () => card.warning);saved.append(warning);}
    if(card.preview)onSaved?.(card.preview);
  };
  button.onclick=async()=>{
    button.disabled=true;setText(message, () => tr("正在保存…"));message.className='saved-status';
    try{const result=await call('tripo_download',target);update(result.structuredContent.download);}
    catch(error){if(current===epoch){setText(message, () => error.message);message.className='saved-status error';}}
    finally{button.disabled=false;}
  };
  const view={target,update};downloadViews.push(view);
  update(item.downloads?.filter(d=>(d.output_index ?? 0)===(target.output_index ?? 0) && (!d.artifact || d.artifact===target.artifact)).at(-1));
}
function watchDownloads(current) {
  const views=downloadViews.filter(view=>view.target.task_id);if(!views.length)return;
  downloadPoll=setTimeout(async()=>{
    await Promise.allSettled(views.map(async view=>{
      const result=await call('tripo_get_task',{task_id:view.target.task_id});
      if(current!==epoch)return;
      const downloads=result.structuredContent?.task?.downloads ?? [];
      view.update(downloads.filter(d=>(d.output_index ?? 0)===(view.target.output_index ?? 0) && (!d.artifact || d.artifact===view.target.artifact)).at(-1));
    }));
    if(current===epoch)watchDownloads(current);
  },5000);
}
async function render(result) {
  const current = ++epoch;
  configuration?.dispose(); configuration=null;
  quoteView?.dispose();quoteView=null;
  clearTimeout(reviewPoll);clearTimeout(taskPoll);clearTimeout(downloadPoll);downloadViews=[];
  viewers.forEach(v=>v.dispose()); viewers=[];
  $('items').replaceChildren();
  setText($('status'), () => result.isError ? tr("调用失败") : tr("已返回结果"));
  $('message').classList.toggle('error',!!result.isError);
  setText($('message'), () => result.structuredContent?.project_id ? tr("模型已准备就绪 · 拖动旋转，滚轮缩放") : result.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n') ?? '');
  const data=result.structuredContent ?? {};
  // Old draft cards had no review object. Reopen the same saved configuration
  // in manual mode, without staging another task or starting a countdown.
  if(!result.isError && !data.review && data.task?.status==='staged') {
    try {
      const updated=await call('tripo_ui_review',{review_id:data.task.task_id ?? data.task.draft_id,action:'get'});
      if(current!==epoch)return;
      latest=updated;return render(updated);
    } catch(error) {
      if(current!==epoch)return;
      setText($('message'), () => error.message);
    }
  }
  if(data.review)app.updateModelContext({content:[{type:'text',text:taskContextSummary(data)}]}).catch(()=>{});
  if (!result.isError && data.quote) {
    setText($('message'), () => '');
    quoteView=mountQuote($('items'),data.quote,status=>{setText($('status'), () => status);});return;
  }
  if (!result.isError && Array.isArray(data.operations)) {
    setText($('status'), () => tr("可用功能"));
    setText($('message'), () => tr("共 {0} 项功能 · 具体费用以操作报价为准", { "0": data.operations.length }));
    const catalog=document.createElement('div');catalog.className='operation-catalog';
    if (!data.operations.length) setText(catalog, () => tr("暂无可用功能。"));
    for (const group of operationGroups(data.operations)) {
      const section=document.createElement('section'), heading=document.createElement('h2'), list=document.createElement('ul');
      setText(heading, () => group.title);section.append(heading,list);
      for (const item of group.items) {
        const row=document.createElement('li'), title=document.createElement('span'), credits=document.createElement('span');
        setText(title, () => item.title);credits.className='operation-credits';setText(credits, () => item.credits);
        row.append(title,credits);list.append(row);
      }
      catalog.append(section);
    }
    $('items').append(catalog);return;
  }
  if(data.review && ['pending','editing','submitting'].includes(data.review.status)) {
    setText($('status'), () => data.review.status==='submitting'?tr("提交中"):tr("等待确认"));
    setText($('message'), () => data.review.error?.message ?? '');
    if(data.review.status!=='submitting')configuration=mountConfiguration($('items'),data.review,{
      previewModel:async(project_id,type)=>(await call('tripo_ui_preview',{project_id,type}))._meta?.tripo?.preview,
      renderModel:mountModel,getDark:()=>dark,
      preview:async(slot,review)=>(await call('tripo_ui_review',{review_id:review.review_id,action:'preview',slot}))._meta?.tripo?.preview,
      importImage:async file=>{
        if(file.size>20*1024*1024 || !['image/png','image/jpeg','image/webp'].includes(file.type))throw Error(tr("请选择 20 MB 以内的 PNG、JPG 或 WebP 图片。"));
        const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
        const imported=await call('tripo_ui_import_image',{name:file.name,data_base64:btoa(binary)});return {...imported.structuredContent,preview:imported._meta?.tripo?.preview};
      },
      action:async(action,revision,input)=>{
        const updated=await call('tripo_ui_review',{review_id:data.review.review_id,action,revision,...(input?{input}:{})});
        if(current===epoch){
          latest=updated;
          if(action==='edit'||action==='ready')app.updateModelContext({content:[{type:'text',text:taskContextSummary(updated.structuredContent)}]}).catch(()=>{});
          // Keep the existing fields alive while the user edits.
          if(action==='edit'||action==='ready')configuration?.update(updated.structuredContent.review);
          else render(updated);
        }
        return updated.structuredContent;
      },onError:error=>{setText($('message'), () => error.message);$('message').classList.add('error');}
    });
    function poll(){reviewPoll=setTimeout(async()=>{
      if(current!==epoch || polling)return;polling=true;
      try{
        const updated=await call('tripo_ui_review',{review_id:data.review.review_id,action:'get'});
        if(current!==epoch)return;
        const next=updated.structuredContent.review;
        if(!['pending','editing'].includes(next.status)){latest=updated;render(updated);}
        else if(next.revision!==(latest?.structuredContent?.review?.revision ?? data.review.revision)){latest=updated;render(updated);}
        else {configuration?.update(next);poll();}
      }catch(error){if(current===epoch){setText($('message'), () => error.message);poll();}}
      finally{polling=false;}
    },1500);}
    poll();return;
  }
  if(data.review){
    setText($('status'), () => data.review.status==='canceled'?tr("已取消"):data.review.status==='failed'?tr("提交失败"):tr("已提交"));setText($('message'), () => data.review.error?.message ?? (data.review.status==='canceled'?tr("本次请求已取消。"):tr("任务已提交，可刷新查看结果。")));}
  // Errors can carry a task, but must not fetch a possibly stale output.
  if(data.task && ['queued','running','dispatching','waiting_for_auth'].includes(data.task.status)){
    taskPoll=setTimeout(async()=>{
      try{const updated=await call('tripo_task_sync',{task_id:data.task.task_id});if(current===epoch){latest={...result,structuredContent:{...data,task:updated.structuredContent.task}};render(latest);}}
      catch(error){if(current===epoch)setText($('message'), () => error.message);}
    },5000);
  }
  const items=cardItems(data);
  if (!result.isError && data.task?.status === 'succeeded') {
    setText($('status'), () => tr("已完成"));
    setText($('message'), () => items[0]?.preview?.type === 'model' ? tr("模型已准备就绪 · 拖动旋转，滚轮缩放") : tr("已完成"));
  }
  if (!result.isError && data.download?.path) {
    setText($('status'), () => tr("下载完成"));
    setText($('message'), () => items[0]?.preview?.type==='model' ? tr("模型已保存 · 拖动旋转，滚轮缩放") : '');
  }
  for (const item of items) {
    let refreshPreview;
    const article=document.createElement('article'), info=document.createElement('div'), title=document.createElement('h2');
    info.className='info'; setText(title, () => item.title); title.title=item.title;
    if (item.path) {
      info.classList.add('info-compact');
      const bar=document.createElement('div'), primary=document.createElement('div'), badge=document.createElement('span'), location=document.createElement('span');
      bar.className='info-bar'; primary.className='info-primary'; badge.className='meta-pill'; location.className='artifact-path';
      setText(badge, () => item.badge); primary.append(title, badge);
      if (item.blenderPath) {
        const blender=document.createElement('span'); blender.className='meta-pill meta-pill-subtle';
        setText(blender, () => tr("Blender 文件")); blender.title=item.blenderPath; primary.append(blender);
      }
      setText(location, () => item.shortPath);
      location.title=item.blenderPath ? `${item.path}\n${tr("Blender 文件")}: ${item.blenderPath}` : item.path;
      bar.append(primary, location); info.append(bar);
      if(item.warning){const warning=document.createElement('p');warning.className='error compact-warning';setText(warning, () => item.warning);info.append(warning);}
    } else if (item.downloadTarget && !result.isError && !item.details && !(data.task?.status==='staged' && !data.review)) {
      info.classList.add('info-compact');
      const bar=document.createElement('div'), primary=document.createElement('div');
      bar.className='info-bar'; primary.className='info-primary'; primary.append(title);
      if(item.status && !(items.length === 1 && data.task?.status === 'succeeded')){const state=document.createElement('div');state.className='state';setText(state, () => item.status);primary.append(state);}
      bar.append(primary);
      attachDownload(bar,item,current, preview => {
        // A download can arrive after the first cloud preview failed or started.
        // Keep this same result card and replace its preview with the saved file.
        if(refreshPreview)void refreshPreview(preview);
      });
      info.append(bar);
      if(item.warning){const warning=document.createElement('p');warning.className='error compact-warning';setText(warning, () => item.warning);info.append(warning);}
    } else {
      info.append(title);
      if(item.status){const state=document.createElement('div');state.className='state';setText(state, () => item.status);info.append(state);}
      if(data.task?.status==='staged' && !data.review){
        const details=document.createElement('dl');details.className='download-details';
        for(const [label,value] of parameterRows(data.task)){const row=document.createElement('div'),key=document.createElement('dt'),text=document.createElement('dd');setText(key, () => label);setText(text, () => value);row.append(key,text);details.append(row);}
        info.append(details);
      }
      if(item.details){
        const details=document.createElement('dl');details.className='download-details';
        for(const [label,value] of item.details){const row=document.createElement('div'),key=document.createElement('dt'),text=document.createElement('dd');setText(key, () => label);setText(text, () => value);row.append(key,text);details.append(row);}
        info.append(details);
      }
      if(item.warning){const warning=document.createElement('p');warning.className='error';setText(warning, () => item.warning);info.append(warning);}
      if(item.downloadTarget && !result.isError)attachDownload(info,item,current, preview => {
        if(refreshPreview)void refreshPreview(preview);
      });
      if(item.taskId && !item.downloadTarget){const refresh=document.createElement('button');setText(refresh, () => tr("刷新任务"));refresh.onclick=async()=>{refresh.disabled=true;try{const updated=await call('tripo_task_sync',{task_id:item.taskId});if(current===epoch){latest={...result,structuredContent:{...data,task:updated.structuredContent.task,tasks:undefined}};render(latest);}}catch(e){if(current===epoch)setText($('message'), () => e.message);}finally{refresh.disabled=false;}};info.append(refresh);}
    }
    attachInput(info, item, current);
    article.append(info);$('items').append(article);
    if(!item.preview || result.isError) continue;
    const stage=document.createElement('div');stage.className='preview';setText(stage, () => tr("正在加载预览…"));article.prepend(stage);
    let previewRevision = 0, activeViewer;
    refreshPreview = async (input = item.preview) => {
      const revision = ++previewRevision;
      if(activeViewer){activeViewer.dispose();viewers=viewers.filter(viewer=>viewer!==activeViewer);activeViewer=null;}
      stage.replaceChildren();setText(stage, () => tr("正在加载预览…"));
      try {
        const media=await call('tripo_ui_preview',input);
        if(current!==epoch || revision!==previewRevision) return;
        const preview=media._meta?.tripo?.preview;
        if(!preview?.data_url) throw Error(tr("暂无可用预览"));
        stage.replaceChildren();
        if(['model/gltf-binary','model/fbx'].includes(preview.mime_type)){
          const host=document.createElement('div');host.style.cssText='width:100%;height:100%';stage.append(host);
          const viewer=await mountModel(host,preview.data_url,{dark});
          if(current!==epoch || revision!==previewRevision){viewer.dispose();return;}activeViewer=viewer;viewers.push(viewer);
        }else if(/^data:image\/(webp|png|jpeg);base64,/.test(preview.data_url)){
          const image=document.createElement('img');image.src=preview.data_url;image.alt=item.title;stage.append(image);
        }else throw Error(tr("不支持此预览格式"));
      }catch(e){if(current===epoch && revision===previewRevision){
        const failure=document.createElement('div');failure.className='preview-failure';
        const message=document.createElement('p');message.setAttribute('role','status');setText(message, () => e.message);
        const retry=document.createElement('button');retry.type='button';setText(retry, () => tr('重新加载'));retry.onclick=()=>void refreshPreview(input);
        failure.append(message,retry);stage.replaceChildren(failure);
      }}
    };
    await refreshPreview();
  }
  if(current===epoch)watchDownloads(current);
}
app.onteardown=async()=>{epoch++;configuration?.dispose();quoteView?.dispose();clearTimeout(reviewPoll);clearTimeout(taskPoll);clearTimeout(downloadPoll);viewers.forEach(v=>v.dispose());return {};};
async function start(){try{await app.connect(undefined,{timeout:15000});context(app.getHostContext());ready=true;if(latest)render(latest);}catch(e){setText($('status'), () => tr("连接失败"));setText($('message'), () => e.message);}}
start();
