import { t as tr, th, getLocale, formatNumber, setText, initializeI18n, mountLanguageSelector, setHostLocale, onLocaleChange } from './i18n.mjs';
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { OpenAIExtensions } from '@openai/mcp-extensions/app';
import { HostInfoTransport, isCodexHost } from './host-layout.mjs';
import { mountModel } from './viewer.mjs';
import { STATUS, KINDS, ACTIVE, taskProject, taskTitle, artifactFor, quoteCurrent, generationInput, parameterRows, modelBadge } from './model.mjs';

const $ = id => document.getElementById(id);
initializeI18n();
mountLanguageSelector($('language'));
setText($('sessionStatus'), () => tr('连接中'));
setText($('confirmTitle'), () => tr('确认提交'));
setText($('confirmCancel'), () => tr('返回修改'));
setText($('confirmSubmit'), () => tr('确认提交'));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const paths = {
  cube: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  search: 'm21 21-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',
  // Lucide refresh-cw and sun; license and sources: design/icons/README.md.
  refresh: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5',
  sun: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  plus: 'M12 5v14M5 12h14',
  left: 'm15 5-7 7 7 7',
  right: 'm9 5 7 7-7 7',
  image: 'M3 3h18v18H3zM3 17l5-6 4 4 3-3 6 6M15 7h.01',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  list: 'M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01',
  fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',
  check: 'm5 12 4 4 10-10',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
  sparkles: 'm12 3-1.9 5.7a2 2 0 0 1-1.4 1.4L3 12l5.7 1.9a2 2 0 0 1 1.4 1.4L12 21l1.9-5.7a2 2 0 0 1 1.4-1.4L21 12l-5.7-1.9a2 2 0 0 1-1.4-1.4L12 3z',
  layers: 'm12 2 10 5-10 5L2 7zm0 9 10 5-10 5-10-5zm0 9 10 5-10 5-10-5z',
  coins: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'
};

const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${name === 'sun' ? '<circle cx="12" cy="12" r="4"/>' : ''}<path d="${paths[name] ?? paths.cube}"/></svg>`;
const button = (label, action, cls = '', data = '', disabled = false) => `<button class="${cls}" data-action="${action}" ${data} ${disabled ? 'disabled' : ''}>${label}</button>`;
const empty = (title, copy, action = '') => `<div class="empty">${icon('cube')}<h2>${esc(title)}</h2><p>${esc(copy)}</p>${action}</div>`;
const status = s => `<span class="status ${s === 'succeeded' ? 'ok' : ['failed','canceled','expired'].includes(s) ? 'err' : s === 'staged' || ACTIVE.includes(s) || s === 'outcome_unknown' ? 'wait' : ''}">${esc(STATUS[s] ?? s ?? tr("未知状态"))}</span>`;
const date = value => value ? new Date(value).toLocaleString(getLocale(), { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
const kv = rows => `<dl class="kv">${rows.map(([k,v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
const select = (id, options, value) => `<select id="${id}" name="${id}" ${({assetType:tr("资产类别"),assetFilter:tr("模型类型"),assetSort:tr("本页排序")})[id] ? `aria-label="${({assetType:tr("资产类别"),assetFilter:tr("模型类型"),assetSort:tr("本页排序")})[id]}"` : ''}>${options.map(([v,label]) => `<option value="${v}" ${String(value) === String(v) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
const field = (label, content, note = '', id = '') => `<div class="field"><label ${id ? `for="${id}"` : ''}>${esc(label)}</label>${content}${note ? `<div class="field-note muted small" style="margin-top:5px">${esc(note)}</div>` : ''}</div>`;
const check = (id, label, value) => `<label class="switch-row" for="${id}"><span>${esc(label)}</span><input id="${id}" type="checkbox" class="switch" ${value ? 'checked' : ''}></label>`;

const state = {
  ready: false,
  authed: false,
  accountFingerprint: null,
  credits: null,
  creditsLoading: false,
  view: 'assets',
  assetType: 'models',
  assetFilter: 'all',
  assetGroup: 'all',
  assetGroups: [],
  libraryEntries: [],
  activeGroup: null,
  selectedAssets: new Map(),
  layout: 'grid',
  models: [],
  images: [],
  assetOffset: 0,
  assetNext: null,
  total: 0,
  assetSearch: '',
  assetSort: 'recent',
  selected: null,
  detail: null,
  detailBusy: false,
  assetLoading: false,
  assetError: '',
  tasks: [],
  groups: [],
  taskFilter: 'all',
  taskOffset: 0,
  taskNext: null,
  taskSearch: '',
  taskLoading: false,
  taskError: '',
  taskId: null,
  taskDetail: null,
  taskDetailLoading: false,
  history: [],
  op: 'remesh',
  opForm: { faces: 10000, quad: true, smartPoly: false, prompt: '', quality: 'detailed', rigType: 'other', skeleton: 'mixamo', format: 'glb', textureSize: 4096 },
  quote: null,
  quoteKey: null,
  quoteBusy: false,
  quoteError: '',
  busy: false,
  importing: false,
  openInput: { view: 'assets' },
  form: { mode: 'image', tier: 'high_detail', faces: 60000, geometry: 'standard', texture: true, textureQuality: 'detailed', pbr: true, delight: true, quad: false, amount: 1, visibility: 'private', characterName: '', prompt: '', tPose: false, images: {} }
};

let assetSearchTimer;
let hostTheme, theme = 'system', viewer, viewEpoch = 0, assetEpoch = 0, taskEpoch = 0, detailEpoch = 0, quoteEpoch = 0, quoteTimer, toastTimer, selectionSlot = 'front';
try { theme = localStorage.getItem('tripo.theme') || 'system'; } catch {}
const app = new App({ name: 'Tripo Studio', version: '0.3.4' }, {}, { autoResize: true });
new OpenAIExtensions(app);

let hostInfo, layoutContext = {};
function syncHostLayout(ctx) {
  layoutContext = { ...layoutContext, ...ctx };
  document.documentElement.dataset.host = isCodexHost(layoutContext, hostInfo ?? app.getHostVersion(), navigator.userAgent) ? 'codex' : 'other';
}

function isDark() {
  return theme === 'dark' || theme === 'system' && (hostTheme ? hostTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
}

function applyTheme() {
  const dark = isDark();
  // Keep the palette, native controls and renderer on one resolved theme.
  applyDocumentTheme(dark ? 'dark' : 'light');
  viewer?.theme(dark);
  try { localStorage.setItem('tripo.theme', theme); } catch {}
}

function hostContext(ctx) {
  syncHostLayout(ctx);
  if (ctx?.safeAreaInsets) {
    const bottom = ctx.safeAreaInsets.bottom;
    if (Number.isFinite(bottom) && bottom >= 0) document.documentElement.style.setProperty('--host-safe-bottom', `${bottom}px`);
    else document.documentElement.style.removeProperty('--host-safe-bottom');
  }
  const dimensions = ctx?.containerDimensions;
  if (dimensions) {
    const height = dimensions.height ?? dimensions.maxHeight;
    if (Number.isFinite(height) && height > 0) document.documentElement.style.setProperty('--workbench-height', `${height}px`);
    else document.documentElement.style.removeProperty('--workbench-height');
  }
  setHostLocale(ctx?.locale);
  if (ctx?.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx?.theme) hostTheme = ctx.theme;
  applyTheme();
}
app.onhostcontextchanged = hostContext;
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (theme === 'system' && !hostTheme) applyTheme();
});

function receiveOpenInput(input) {
  state.openInput = { ...state.openInput, ...input };
  const route = JSON.stringify([state.openInput.view, state.openInput.project_id, state.openInput.task_id]);
  if (!state.hostInputSeen && state.userNavigated) state.route = route;
  state.hostInputSeen = true;
  if (state.ready) openInput().catch(e => toast(e.message, true));
}
app.ontoolinput = ({ arguments: input }) => receiveOpenInput(input);
app.ontoolresult = ({ structuredContent: input }) => { if (input) receiveOpenInput(input); };
app.ontoolcancelled = () => showConnection(tr("打开请求已取消，请重新打开工作台。"));

async function call(name, args = {}, timeout = 300000) {
  const result = await app.callServerTool({ name, arguments: args }, { timeout });
  if (result.isError) {
    const error = Error(result.structuredContent?.error?.message ?? result.content?.find(c => c.type === 'text')?.text ?? tr("操作失败，请重试。"));
    error.task = result.structuredContent?.task;
    throw error;
  }
  return result;
}

async function data(name, args, timeout) {
  return (await call(name, args, timeout)).structuredContent ?? {};
}

function toast(message, error = false) {
  setText($('toast'), () => message);
  $('toast').classList.remove('hidden');
  $('toast').classList.toggle('error', error);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 6000);
}

function showConnection(message) {
  setText($('connection'), () => message);
  $('connection').classList.remove('hidden');
}

async function authStatus() {
  const result = await data('tripo_auth_status');
  if (state.accountFingerprint !== result.account_fingerprint) state.credits = null;
  state.accountFingerprint = result.account_fingerprint;
  state.authed = result.session?.authenticated === true;
  setText($('sessionStatus'), () => state.authed ? tr("已登录 Studio") : tr("未登录"));
  $('sessionStatus').className = `status ${state.authed ? 'ok' : ''}`;
  $('authNotice').classList.toggle('hidden', state.authed);
  void refreshCredits();
}

let paymentEpoch = 0;
async function refreshCredits() {
  const epoch = ++paymentEpoch;
  $('creditBalance').classList.toggle('hidden', !state.authed);
  if (!state.authed) {
    state.credits = null;
    state.creditsLoading = false;
    return;
  }
  state.creditsLoading = true;
  setText($('creditAmount'), () => state.credits !== null ? formatNumber(state.credits) : state.creditsLoading ? tr("加载中…") : tr("暂不可用"));
  try {
    const { payment } = await data('tripo_get_payment', {}, 15000);
    if (epoch !== paymentEpoch) return;
    const amount = payment?.wallet?.total_credit;
    state.credits = typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? amount : null;
  } catch {
    if (epoch !== paymentEpoch) return;
    state.credits = null;
  } finally {
    if (epoch === paymentEpoch) {
      state.creditsLoading = false;
      setText($('creditAmount'), () => state.credits !== null ? formatNumber(state.credits) : tr("暂不可用"));
    }
  }
}

function disposeViewer() {
  viewer?.dispose();
  viewer = null;
}

let renderedPage;
function setMain(html) {
  disposeViewer();
  document.body.classList.toggle('asset-detail-page', state.view === 'assets' && !!state.detail);
  $('main').innerHTML = html;
  const page = `${state.view}:${state.view === 'assets' ? state.detail?.project_id ?? `${state.assetType}:${state.assetGroup}:${state.assetOffset}` : ''}`;
  if (renderedPage !== page) {
    $('main').scrollTop = 0;
    window.scrollTo(0, 0);
    renderedPage = page;
  }
}

// Capture inputs before changing locale, then redraw without fetching or restaging.
let pendingTaskCharacter, dialogRefresh;
onLocaleChange(() => {
  if (state.view === 'create') captureCreate();
  else if (state.detail) captureOperation();
  pendingTaskCharacter = $('taskCharacter')?.value;
}, true);
onLocaleChange(() => {
  if (state.view === 'create') renderCreate();
  else if (state.view === 'tasks') {
    renderTasks();
    if ($('taskCharacter') && pendingTaskCharacter !== undefined) $('taskCharacter').value = pendingTaskCharacter;
  } else if (state.detail) renderAssetDetail();
  else renderAssets();
  if ($('confirmDialog').open) dialogRefresh?.();
});

function setDialogBody(render) {
  const update = preserve => {
    const inputs = preserve ? [...$('confirmBody').querySelectorAll('input,select,textarea')].map(node => ({ id: node.id, value: node.value, checked: node.checked })) : [];
    $('confirmBody').innerHTML = render();
    for (const input of inputs) {
      const node = $(input.id);
      if (node) { node.value = input.value; if (node.type === 'checkbox') node.checked = input.checked; }
    }
    if ($('unknownCost')) $('unknownCost').onchange = event => $('confirmSubmit').disabled = !event.target.checked;
  };
  dialogRefresh = () => update(true);
  update(false);
}

function pageButtons(offset, next, previousAction, nextAction, divisor = 20) {
  return `<div class="pagination">${button(icon('left'), previousAction, 'icon-button', `aria-label="${th("上一页")}"`, offset === 0)}<span class="small mono">${th("第 {0} 页", { "0": Math.floor(offset / divisor) + 1 })}</span>${button(icon('right'), nextAction, 'icon-button', `aria-label="${th("下一页")}"`, next === null)}<span class="muted small">${th("每页 20 项")}</span></div>`;
}

// Bounded lazy previews
const previews = new Map(), previewQueue = [];
let previewActive = 0;
function preview(args) {
  const key = JSON.stringify(args);
  if (!previews.has(key)) {
    const promise = new Promise((resolve, reject) => { previewQueue.push({ args, resolve, reject }); drainPreviews(); });
    previews.set(key, promise);
    promise.catch(() => previews.delete(key));
    while (previews.size > 85) previews.delete(previews.keys().next().value);
  }
  return previews.get(key);
}

function drainPreviews() {
  while (previewActive < 3 && previewQueue.length) {
    const { args, resolve, reject } = previewQueue.shift();
    previewActive++;
    call('tripo_ui_preview', args).then(r => {
      const p = r._meta?.tripo?.preview;
      if (!p?.data_url) throw Error(tr("宿主未提供预览数据。"));
      resolve(p);
    }).catch(reject).finally(() => {
      previewActive--;
      drainPreviews();
    });
  }
}

function previewPlaceholder(args, cls = 'asset-picture') {
  return `<div class="${cls}" data-preview="${esc(JSON.stringify(args))}">${icon(args.asset_id || args.input_id ? 'image' : 'cube')}</div>`;
}

function hydratePreviews() {
  document.querySelectorAll('[data-preview]').forEach(node => {
    const args = JSON.parse(node.dataset.preview);
    delete node.dataset.preview;
    preview(args).then(p => {
      if (node.isConnected) node.innerHTML = `<img src="${p.data_url}" alt="${th("预览")}" loading="lazy">`;
    }).catch(() => {
      if (node.isConnected && node.classList.contains('asset-picture')) node.innerHTML += `<span class="small muted" style="position:absolute;bottom:10px">${th("暂无缩略图")}</span>`;
    });
  });
}

// ==========================================================================
// Assets Module
// ==========================================================================
async function loadAssets(reset = false, refresh = false) {
  clearTimeout(assetSearchTimer);
  if (reset) state.assetOffset = 0;
  const epoch = ++assetEpoch;
  const focused = document.activeElement?.id === 'assetSearch', position = $('assetSearch')?.selectionStart;
  const restoreSearch = () => { if (focused) { $('assetSearch')?.focus(); $('assetSearch')?.setSelectionRange(position, position); } };
  state.assetLoading = true;
  state.assetError = '';
  renderAssets(); restoreSearch();
  try {
    const result = await data('tripo_ui_asset_library', {
      action:'list',type:state.assetType,filter:state.assetFilter,offset:state.assetOffset,
      ...(state.assetGroup !== 'all' ? {group_id:state.assetGroup} : {}),
      search:state.assetSearch,sort:state.assetSort,refresh
    });
    if (epoch !== assetEpoch) return;
    state.libraryEntries = result.entries ?? [];
    state.activeGroup = result.group;
    state.assetGroups = result.groups ?? [];
    state.total = result.total ?? 0;
    state.assetNext = result.next_offset ?? null;
    const assets = state.libraryEntries.filter(e => e.entry_type === 'asset');
    if (state.assetType === 'models') state.models = assets; else state.images = assets;
  } catch (e) {
    if (epoch === assetEpoch) state.assetError = e.message;
  }
  if (epoch !== assetEpoch) return;
  state.assetLoading = false;
  if (state.view === 'assets' && !state.detail) { renderAssets(); restoreSearch(); }
}

function renderAssetCard(m) {
  const isModels = state.assetType === 'models';
  const id = m.project_id ?? m.asset_id, args = isModels ? {project_id:id} : {asset_id:id};
  const isSelected = state.selectedAssets.has(id);
  const title = m.name ?? m.input?.prompt ?? KINDS[`image.${m.type}`] ?? m.type;
  const badge = isModels ? modelBadge(m) : {label:tr('图片'),className:'badge-gray'};
  const smart = badge.smart;
  return `<article class="asset-card">
    <button class="asset-open ${isSelected ? 'selected' : ''}" data-action="selectAsset" data-id="${esc(id)}" aria-pressed="${isSelected}" aria-label="${th("选择 {0}", {"0":esc(title)})}">
      <div class="asset-picture-wrap">
        ${previewPlaceholder(args)}
        <div class="card-badges"><span class="card-badge ${badge.className}">${esc(badge.label)}</span>${m.running ? `<span class="card-badge badge-wait">${th("处理中")}</span>` : ''}</div>
        <span class="card-select-indicator ${isSelected ? 'active' : ''}">${icon('check')}</span>
      </div>
      <div class="asset-caption">
        <div class="asset-name" title="${esc(title)}">${esc(title)}</div>
        <div class="asset-meta-row"><span class="muted small">${isModels ? [smart ? tr("四边面拓扑") : tr("标准网格"),m.visibility === 'private' ? tr("私有") : tr("公开")].join(' · ') : tr("{0} 张输出 · {1}", {"0":m.output_count,"1":m.status === 'success' ? tr("已完成") : m.status})}</span></div>
      </div>
    </button>
    ${button(tr("查看详情"), 'assetDetail', 'asset-detail-link', `data-id="${esc(id)}"`)}
  </article>`;
}

function renderGroupCard(group) {
  const args = asset => asset.project_id ? {project_id:asset.project_id} : {asset_id:asset.asset_id};
  return `<article class="asset-card group-card">
    <button class="asset-open" data-action="openGroup" data-id="${esc(group.group_id)}" aria-label="${th("打开分组 {0}", {"0":esc(group.name)})}">
      <div class="asset-picture-wrap group-cover">
        <div class="group-preview-grid ${group.covers.length === 1 ? 'single' : ''}">${group.covers.map(asset => `<div class="group-preview-tile">${previewPlaceholder(args(asset))}</div>`).join('')}</div>
        <div class="card-badges"><span class="card-badge badge-orange">${icon('layers')}${th("分组")}</span></div>
        <span class="group-cover-count">${formatNumber(group.count)}</span>
      </div>
      <div class="asset-caption"><div class="asset-name" title="${esc(group.name)}">${esc(group.name)}</div>
        <div class="asset-meta-row"><span class="muted small">${state.assetType === 'models' ? tr("{0} 个模型", {"0":group.count}) : tr("{0} 个图片资产", {"0":group.count})}</span><span class="group-enter">${th("查看分组")}${icon('right')}</span></div>
      </div>
    </button>
  </article>`;
}

function renderAssets() {
  const isModels = state.assetType === 'models', inside = state.assetGroup !== 'all';
  const items = state.libraryEntries;
  setMain(`
    ${inside ? `<div class="breadcrumb">${button(icon('left'), 'groupsBack', 'icon-button', `aria-label="${th("返回资产")}"`)}<span class="muted">${th("我的资产")}</span><span class="muted">/</span><strong>${esc(state.activeGroup?.name ?? '')}</strong></div>` : ''}
    <div class="row spread page-title">
      <div class="page-heading"><div class="row" style="gap:10px;align-items:center"><h1>${inside ? esc(state.activeGroup?.name ?? tr("分组")) : isModels ? tr("3D 资产库") : tr("图片资产库")}</h1><span class="asset-count">${inside ? tr("{0} 个资产", {"0":state.total}) : tr("{0} 项", {"0":state.total})}</span></div>
        <p class="muted small">${inside ? tr("分组内的全部资产，可预览、下载或继续处理。") : tr("分组显示为一张卡片，点击查看组内资产。")}</p>
      </div>
      <div class="page-title-actions">${inside && state.activeGroup ? button(tr("重命名分组"),'renameAssetGroup','secondary','',state.busy) : ''}${button(icon('plus') + tr("创建新模型"), 'create', 'primary', '', !state.ready)}</div>
    </div>
    <div class="toolbar">
      <div class="search">${icon('search')}<input id="assetSearch" maxlength="1000" placeholder="${th("搜索资产或分组")}" aria-label="${th("搜索资产或分组")}" value="${esc(state.assetSearch)}">${state.assetSearch ? button('×', 'clearAssetSearch', 'search-clear-btn') : ''}</div>
      <div class="toolbar-filters"><div class="segment type-segment"><button class="${isModels ? 'active' : ''}" data-action="setAssetType" data-type="models">${th("3D 模型")}</button><button class="${!isModels ? 'active' : ''}" data-action="setAssetType" data-type="images">${th("2D 图片")}</button></div>
        ${isModels ? select('assetFilter', [['all', tr("全部类型")],['rigged', tr("已绑定骨骼")],['smart_mesh','Smart Mesh'],['textured',tr("有贴图")],['untextured',tr("无贴图")]], state.assetFilter) : ''}
        ${select('assetSort', [['recent',tr("最新创建")],['name',tr("按名称排序")]],state.assetSort)}
        <div class="segment view-segment">${button(icon('grid'),'grid',state.layout === 'grid' ? 'active' : '',`aria-label="${th("网格显示")}" aria-pressed="${state.layout === 'grid'}"`)}${button(icon('list'),'list',state.layout === 'list' ? 'active' : '',`aria-label="${th("列表显示")}" aria-pressed="${state.layout === 'list'}"`)}</div>
      </div>
    </div>
    <div class="asset-summary selection-hint"><span>${th("点击卡片即可多选，点击查看详情打开资产。")}</span>${button(tr("全选本页"),'selectPageAssets','text-button','',!items.some(e=>e.entry_type==='asset')||state.assetLoading)}</div>
    ${state.assetLoading ? '<div class="loading-grid">' + Array(6).fill('<div class="skeleton"></div>').join('') + '</div>' : state.assetError ? empty(tr("资产读取失败"),state.assetError,button(tr("重新读取"),'assetsReload','secondary')) : items.length ? `<div class="asset-grid ${state.layout === 'list' ? 'list' : ''}">${items.map(e=>e.entry_type==='group'?renderGroupCard(e):renderAssetCard(e)).join('')}</div>` : empty(tr("未找到匹配的资产"),inside ? tr("此分组在当前类别下暂无资产。") : tr("试试输入其他关键词，或清除搜索条件。"),state.assetSearch ? button(tr("清除搜索条件"),'clearAssetSearch','secondary') : inside ? button(tr("返回资产"),'groupsBack','secondary') : button(icon('plus')+tr("创建模型"),'create','primary'))}
    ${pageButtons(state.assetOffset,state.assetNext,'assetsPrev','assetsNext')}
    ${selectedBar()}`);
  hydratePreviews();
}

function selectedBar() {
  const count = state.selectedAssets.size;
  if (!count) return '';
  const single = count === 1 ? [...state.selectedAssets.values()][0] : null;
  const singleId = single?.project_id ?? single?.asset_id;
  return `<div class="selectionbar multi-selectionbar"><div class="selection-info grow"><h3>${th("已选择 {0} 项资产", {"0":count})}</h3></div><div class="selection-actions">${button(tr("清空选择"),'clearSelection','text-button')}${single ? button(tr("查看详情"),'assetDetail','secondary',`data-id="${esc(singleId)}"`) : ''}${state.assetGroup !== 'all' ? button(tr("移出分组"),'removeFromGroup','secondary','',state.busy) : ''}${button(tr("加入已有分组"),'joinAssetGroup','secondary','',!state.assetGroups.length||state.busy)}${button(tr("创建分组"),'createAssetGroup','primary','',state.busy)}</div></div>`;
}

function clearAssetSelection() {
  state.selected = null;
  state.selectedAssets.clear();
}
function toggleAssetSelection(id) {
  const asset = (state.assetType === 'models' ? state.models : state.images).find(a=>(a.project_id??a.asset_id)===id);
  if (!asset) return;
  if (state.selectedAssets.has(id)) state.selectedAssets.delete(id);
  else if (state.selectedAssets.size < 500) state.selectedAssets.set(id,asset.project_id ? {project_id:id} : {asset_id:id});
  else toast(tr("最多选择 500 项资产。"),true);
}

$('confirmBody').addEventListener('input', e => { if(e.target.id === 'assetGroupName') $('confirmSubmit').disabled = !e.target.value.trim(); });

async function groupSelection(create) {
  const selected = [...state.selectedAssets.values()], type = state.assetType;
  if (!selected.length) return;
  setText($('confirmTitle'),()=>create ? tr("创建分组") : tr("加入已有分组"));
  setDialogBody(()=>`<div class="asset-group-form">${field(create ? tr("分组名称") : tr("选择分组"),create ? `<input id="assetGroupName" maxlength="80" placeholder="${th("例如：派蒙、机甲设计…")}">` : select('assetGroupTarget',state.assetGroups.map(g=>[g.id,g.name]),state.assetGroups[0]?.id),'',create ? 'assetGroupName' : 'assetGroupTarget')}<p class="field-note muted small">${th("所选 {0} 项资产将收进这个分组。", {"0":selected.length})}</p></div>`);
  setText($('confirmSubmit'),()=>create ? tr("创建分组") : tr("加入分组"));
  $('confirmSubmit').disabled = create;

  const target = await new Promise(resolve=>{
    const finish=value=>{ $('confirmDialog').close();resolve(value); };
    $('confirmCancel').onclick=()=>finish(null);
    $('confirmDialog').oncancel=e=>{e.preventDefault();finish(null);};
    $('confirmSubmit').onclick=()=>finish(create ? {name:$('assetGroupName').value.trim()} : {group_id:$('assetGroupTarget').value});
    $('confirmDialog').showModal();
    if(create)$('assetGroupName').focus();
  });
  setText($('confirmSubmit'),()=>tr("确认提交"));
  if (!target) return;
  state.busy = true;
  renderAssets();
  try {
    const result = await data('tripo_ui_asset_library',{action:'assign',type,assets:selected,...target});
    clearAssetSelection();state.assetGroup='all';state.assetSearch='';
    toast(tr("已将 {0} 项资产加入「{1}」。", {"0":result.assigned,"1":result.group.name}));
    if(state.view==='assets'&&!state.detail)await loadAssets(true);
  } finally {state.busy=false;if(state.view==='assets'&&!state.detail)renderAssets();}
}

async function removeSelectedFromGroup() {
  if (!state.selectedAssets.size) return;
  state.busy=true;
  try {
    await data('tripo_ui_asset_library',{action:'assign',type:state.assetType,assets:[...state.selectedAssets.values()]});
    clearAssetSelection();
    toast(tr("所选资产已移出分组。"));
    if(state.view==='assets'&&!state.detail)await loadAssets(true);
  } finally {state.busy=false;if(state.view==='assets'&&!state.detail)renderAssets();}
}

async function renameAssetGroup() {
  const group=state.activeGroup;
  if(!group)return;
  setText($('confirmTitle'),()=>tr("重命名分组"));
  setDialogBody(()=>`<div class="asset-group-form">${field(tr("分组名称"),`<input id="assetGroupName" maxlength="80" value="${esc(group.name)}">`,'','assetGroupName')}</div>`);
  setText($('confirmSubmit'),()=>tr("保存名称"));
  $('confirmSubmit').disabled=false;
  const name=await new Promise(resolve=>{
    const finish=value=>{$('confirmDialog').close();resolve(value);};
    $('confirmCancel').onclick=()=>finish(null);
    $('confirmDialog').oncancel=e=>{e.preventDefault();finish(null);};
    $('confirmSubmit').onclick=()=>finish($('assetGroupName').value.trim());
    $('confirmDialog').showModal();$('assetGroupName').focus();$('assetGroupName').select();
  });
  setText($('confirmSubmit'),()=>tr("确认提交"));
  if(!name)return;
  state.busy=true;renderAssets();
  try {
    await data('tripo_rename_asset_group',{group_id:group.id,name});
    toast(tr("分组名称已更新。"));
    if(state.view==='assets'&&!state.detail)await loadAssets();
  } finally {state.busy=false;if(state.view==='assets'&&!state.detail)renderAssets();}
}

async function openAsset(projectId) {
  state.selectedAssets.clear();
  if (state.detail?.project_id !== projectId) state.opForm.parts = undefined;
  const epoch = ++detailEpoch;
  state.view = 'assets';
  updateTabs();
  state.selected = projectId;
  state.detailBusy = true;
  state.detail = { project_id: projectId, project_name: state.models.find(m => m.project_id === projectId)?.name };
  state.history = [];
  clearQuote();
  renderAssetDetail();
  try {
    const [detail, tasks] = await Promise.all([
      data('tripo_get_model', { project_id: projectId, include: ['capabilities', 'operator_detail'] }),
      data('tripo_list_tasks', { limit: 200 })
    ]);
    if (epoch !== detailEpoch) return;
    state.detail = detail;
    state.detail.parts = Array.isArray(detail.parts) ? detail.parts : detail.parts?.part_names ?? [];
    state.history = (tasks.tasks ?? []).filter(t => taskProject(t) === projectId);
  } catch (e) {
    if (epoch === detailEpoch) state.detail.error = e.message;
  }
  if (epoch !== detailEpoch || state.view !== 'assets') return;
  state.detailBusy = false;
  renderAssetDetail();
  scheduleQuote();
}

function renderAssetDetail() {
  const m = state.detail, caps = m.capabilities ?? {}, source = state.history[0];
  setMain(`
  <div class="breadcrumb">
    ${button(icon('left'), 'assetsBack', 'icon-button', `aria-label="${th("返回资产")}"`)}
    <span class="muted">${th("我的资产")}</span>
    <span class="muted">/</span>
    <strong class="grow asset-title-crumb" title="${esc(m.project_name ?? tr("模型详情"))}">${esc(m.project_name ?? tr("模型详情"))}</strong>
    ${caps.remote_status ? `<span class="badge-accent">${esc(caps.remote_status)}</span>` : ''}
    ${button(icon('download') + tr("导出模型"), 'export', 'secondary', '', state.detailBusy)}
  </div>
  ${m.error ? `<div class="error-card"><strong>${th("模型详情读取失败")}</strong><p>${esc(m.error)}</p>${button(tr("重新读取"), 'assetDetail', 'secondary', `data-id="${esc(m.project_id)}"`)}</div>` : ''}
  <div class="detail-layout">
    <section class="viewer-section">
      <div id="modelViewport" class="viewport">
        ${previewPlaceholder({ project_id: m.project_id }, 'viewport-cover')}
        <div class="viewport-tools">
          ${button(tr("材质视图"), 'material', 'tool-pill active')}
          ${button(tr("线框模式"), 'wireframe', 'tool-pill')}
          ${button(icon('fit'), 'fit', 'icon-button fit-btn', `aria-label="${th("重置视角")}" title="${th("重置视角")}"`)}
        </div>
        <div id="viewerMessage" class="viewer-fallback">
          <span class="busy"></span>
          <p>${th("正在读取 3D 模型预览…")}</p>
        </div>
        <div class="axis">${th("Y-UP · 3D 空间")}</div>
        <div id="viewerMeta" class="viewport-meta">GLB</div>
      </div>
      <details class="source-record">
        <summary>${th("来源与历史任务")}</summary>
        <div class="source-record-body">
        <div class="row spread">
          ${source ? `<span class="small muted">${date(source.updated_at ?? source.created_at)}</span>` : ''}
          ${button(tr("在任务中心查看"), 'projectTasks', 'text-button')}
        </div>
        ${state.history.length ? `
        <div class="source-chain">
          ${state.history.slice(0, 4).reverse().map(t => button(`${status(t.status)} <span>${esc(KINDS[t.kind] ?? t.kind)}</span>`, 'task', 'chain-node', `data-id="${t.task_id}"`)).join('<span class="chain-arrow">→</span>')}
        </div>
        <p class="field-note muted small">${th("显示当前工作台记录的处理链路。3D 视口呈现 Studio 最新版本。")}</p>` : `<p class="field-note muted small">${th("当前项目尚无本地工作台任务记录。")}</p>`}
        </div>
      </details>
    </section>
    <aside class="inspector">
      <div class="inspector-header">
        <h2>${th("二次处理")}</h2>
        <span class="muted small">${th("重拓扑 / 贴图重绘 / 自动绑定")}</span>
      </div>
      <div class="op-tabs">
        ${['remesh', 'texture', 'rig'].map(op => button({ remesh: tr("重拓扑 Remesh"), texture: tr("重新贴图 Texture"), rig: tr("骨骼绑定 Rig") }[op], 'operation', op === state.op ? 'active' : '', `data-op="${op}"`)).join('')}
      </div>
      ${state.detailBusy ? `<div class="empty"><span class="busy"></span> ${th("正在读取模型部件结构…")}</div>` : renderOperation()}
    </aside>
  </div>`);
  hydratePreviews();
  if (!state.detailBusy && !m.error) loadViewer(m.project_id);
}

async function loadViewer(projectId) {
  const node = $('modelViewport'), message = $('viewerMessage');
  try {
    const p = await preview({ project_id: projectId, type: 'model' });
    if (!node.isConnected) return;
    if (state.detail?.project_id === projectId && p.part_names?.length) {
      captureOperation();
      state.detail.parts = p.part_names;
      const inspector = document.querySelector('.inspector');
      if (inspector) {
        inspector.innerHTML = inspector.querySelector('.inspector-header').outerHTML + inspector.querySelector('.op-tabs').outerHTML + renderOperation();
        scheduleQuote();
      }
    }
    const mounted = await mountModel(node, p.data_url, { dark: isDark() });
    if (!node.isConnected) { mounted.dispose(); return; }
    disposeViewer();
    viewer = mounted;
    node.querySelector('.viewport-cover')?.remove();
    message?.classList.add('hidden');
    setText($('viewerMeta'), () => tr("{0} 面 · GLB", { "0": formatNumber(mounted.triangles) }));
  } catch (e) {
    if (message?.isConnected) message.innerHTML = `<p>${esc(e.message)}</p>${button(tr("重新加载"), 'reloadViewer', 'secondary')}`;
  }
}

function renderOperation() {
  const f = state.opForm, detail = state.detail;
  let content = '';
  if (state.op === 'remesh') {
    content = `
    <div class="field">
      <div class="row spread label-row">
        <label for="opFaces">${th("目标面数")}</label>
        <span class="mono muted small">${th("{0} 面", { "0": formatNumber(f.faces) })}</span>
      </div>
      <input id="opFaces" type="number" min="500" max="${f.smartPoly ? f.quad ? 10000 : 20000 : f.quad ? 50000 : 150000}" step="500" value="${f.faces}">
    </div>
    <div class="field">
      <label for="opQuad">${th("网格拓扑类型")}</label>
      ${select('opQuad', [['true', tr("四边形网格（Quad - 推荐动画）")], ['false', tr("三角形网格（Triangle - 游戏渲染）")]], f.quad)}
    </div>
    <div class="setting-card-mini">
      <label class="switch-row" for="opSmart">
        <div class="switch-info">
          <span>${th("Smart Poly 智能拓扑")}</span>
          <span class="dim small">${th("按特征曲率自适应保留边缘锐利细节")}</span>
        </div>
        <input id="opSmart" type="checkbox" class="switch" ${f.smartPoly ? 'checked' : ''}>
      </label>
    </div>`;
  }
  if (state.op === 'texture') {
    content = `
    <div class="field">
      <label for="opPrompt">${th("贴图纹理描述")}</label>
      <textarea id="opPrompt" maxlength="1000" placeholder="${th("详尽描述材质质感、配色与表面微观细节。例如：做旧金属装甲，边缘掉漆生锈，金黄色局部反光")}">${esc(f.prompt)}</textarea>
    </div>
    <div class="field">
      <label for="opQuality">${th("贴图分辨率")}</label>
      ${select('opQuality', [['standard', tr("2K 标准")], ['detailed', tr("4K 高清")], ['ultra', tr("8K 超高清")]], f.quality)}
    </div>`;
  }
  if (['remesh', 'texture'].includes(state.op)) {
    const parts = detail.parts ?? [];
    content += `
    <div class="field">
      <span class="field-label" style="font-weight:600;font-size:13px;display:block;margin-bottom:6px">${th("选择处理部件")}</span>
      ${parts.length ? `<div id="opParts" class="parts-checklist">${parts.map((p, index) => {
        const name = typeof p === 'string' ? p : p.name;
        const isChecked = state.opForm.parts ? state.opForm.parts.includes(name) : true;
        return `
        <label class="part-pill ${isChecked ? 'active' : ''}">
          <input type="checkbox" name="part" value="${esc(name)}" ${isChecked ? 'checked' : ''}>
          <span>${esc(/^tripo_node_|^[0-9a-f]{8}-/i.test(name) ? tr("部件 {0}", { "0": index + 1 }) : name)}</span>
        </label>`;
      }).join('')}</div>` : `<p class="field-note muted small">${th("该模型为单一整体，无需选择部件。")}</p>`}
    </div>`;
  }
  if (state.op === 'rig') {
    content = `
    <div class="field">
      <label for="opRigType">${th("绑定骨骼类型")}</label>
      ${select('opRigType', [['other', tr("动物 / 道具 / 多足生物")], ['humanoid', tr("标准双足人形角色")]], f.rigType)}
    </div>
    ${f.rigType === 'humanoid' ? `
    <div class="field">
      <label for="opSkeleton">${th("目标骨架预设")}</label>
      ${select('opSkeleton', [['actorcore', tr("ActorCore 标准")], ['mixamo', tr("Mixamo 动画兼容")], ['unreal', tr("Unreal Engine 骨架")], ['vrm', tr("VRM 虚拟主播")], ['unity', 'Unity Humanoid']], f.skeleton)}
    </div>` : ''}
    <p class="field-note muted small">${th("基于 Rig V3 深度学习算法，提交前自动执行几何姿态与拓扑分析。")}</p>`;
  }
  const blocked = detail.capabilities?.is_owner === false || ['remesh'].includes(state.op) && detail.capabilities?.is_rigged === true || ['rig'].includes(state.op) && detail.capabilities?.is_textured === false;
  return `
  <div class="operation-form-body">
    ${content}
    ${blocked ? `<div class="alert-box error">${th("该模型当前状态不支持此操作（可能未贴图或已绑定骨骼）。")}</div>` : ''}
    <div id="quoteArea">${quoteMarkup()}</div>
    <div class="op-actions-row">
      ${button(tr("保存处理草稿"), 'stageOperation', 'secondary wide', '', blocked || state.busy || !!detail.error)}
      ${button(tr("确认并立即处理"), 'process', 'primary wide action-hero', '', blocked || state.busy || !!detail.error || state.quoteBusy)}
    </div>
    <p class="field-note muted small" style="text-align:center">${th("提交前将弹出窗口复核冻结参数与预估费用")}</p>
  </div>`;
}

function operationRequest() {
  const f = state.opForm, project_id = state.detail?.project_id;
  if (!project_id) throw Error(tr("请先选择模型。"));
  const parts = f.parts ?? (state.detail.parts ?? []).map(p => typeof p === 'string' ? p : p.name);
  if (state.op === 'remesh') {
    const max = f.smartPoly ? f.quad ? 10000 : 20000 : f.quad ? 50000 : 150000;
    if (!Number.isInteger(Number(f.faces)) || f.faces < 500 || f.faces > max) throw Error(tr("目标面数范围为 500–{0}。", { "0": formatNumber(max) }));
    if (!parts.length) throw Error(tr("请至少选择一个分件。"));
    return { kind: 'model.remesh', tool: 'tripo_remesh_model', input: { project_id, part_name_list: parts, face_limit: Number(f.faces), quad: f.quad, smart_poly: f.smartPoly, submit: false } };
  }
  if (state.op === 'texture') {
    if (!parts.length) throw Error(tr("请至少选择一个分件。"));
    if (!f.prompt.trim()) throw Error(tr("请输入贴图描述。"));
    return { kind: 'texture.generate', tool: 'tripo_generate_texture', input: { project_id, part_names: parts, mode: 'text', prompt: f.prompt.trim(), quality: f.quality, alignment: 'original_image', delight: true, submit: false } };
  }
  return { kind: 'model.rig', tool: 'tripo_rig_model', input: { project_id, model_version: 'v3.0-20260909', rigging_type: f.rigType, ...(f.rigType === 'humanoid' ? { skeleton_preset: f.skeleton } : {}), submit: false } };
}

function captureOperation() {
  const f = state.opForm;
  if ($('opFaces')) f.faces = Number($('opFaces').value);
  if ($('opQuad')) f.quad = $('opQuad').value === 'true';
  if ($('opSmart')) f.smartPoly = $('opSmart').checked;
  if ($('opPrompt')) f.prompt = $('opPrompt').value;
  if ($('opQuality')) f.quality = $('opQuality').value;
  if ($('opRigType')) f.rigType = $('opRigType').value;
  if ($('opSkeleton')) f.skeleton = $('opSkeleton').value;
  if ($('opParts')) f.parts = [...$('opParts').querySelectorAll('input:checked')].map(n => n.value);
}

function characterNames() {
  return `<datalist id="characterNames">${[...new Set(state.groups.filter(g => g.id !== 'ungrouped').map(g => g.name))].map(name => `<option value="${esc(name)}"></option>`).join('')}</datalist>`;
}

// ==========================================================================
// Tasks Module
// ==========================================================================
async function loadTasks(reset = false) {
  if (reset) state.taskOffset = 0;
  const epoch = ++taskEpoch;
  state.taskLoading = true;
  state.taskError = '';
  renderTasks();
  try {
    const statuses = state.taskFilter === 'active' ? ACTIVE : state.taskFilter === 'failed' ? ['failed', 'outcome_unknown', 'expired'] : state.taskFilter === 'draft' ? ['staged'] : state.taskFilter === 'done' ? ['succeeded'] : undefined;
    const filters = statuses ? { statuses } : {};
    const result = await data('tripo_list_tasks', {limit:20,offset:state.taskOffset,...filters});
    if (epoch !== taskEpoch) return;
    state.tasks = result.tasks ?? [];
    state.taskNext = result.next_offset ?? null;
  } catch (e) {
    if (epoch === taskEpoch) state.taskError = e.message;
  }
  if (epoch !== taskEpoch) return;
  state.taskLoading = false;
  if (state.view === 'tasks') {
    renderTasks();
    if (!state.taskId && state.tasks[0]) selectTask(state.tasks[0].task_id);
  }
}

function renderTasks() {
  const items = state.tasks.filter(t => !state.taskSearch || `${t.character_group?.name ?? tr("未分组")} ${taskTitle(t, state.models)}`.toLowerCase().includes(state.taskSearch.toLowerCase()));
  setMain(`
  <div class="row spread page-title">
    <div class="page-heading">
      <div class="row" style="gap:10px; align-items:center">
        <h1>${th("任务中心")}</h1>
        <span class="asset-count">${th("{0} 个任务", { "0": items.length })}</span>
      </div>
      <p class="muted small">${th("查看 3D 生成、贴图重绘及骨骼绑定的进度、参数冻结记录与事件轨迹")}</p>
    </div>
    ${button(icon('refresh') + tr("刷新任务"), 'tasksReload', 'secondary')}
  </div>
  <div class="tasks-layout">
    <section class="task-master">
      <div class="task-filters-card">
        <div class="search">
          ${icon('search')}
          <input id="taskSearch" placeholder="${th("搜索任务名称、ID…")}" aria-label="${th("搜索本页任务")}" value="${esc(state.taskSearch)}">
          ${state.taskSearch ? button('×', 'clearTaskSearch', 'search-clear-btn') : ''}
        </div>
        <div class="task-status-pills">
          ${[['all', tr("全部")], ['active', tr("处理中")], ['done', tr("已完成")], ['failed', tr("失败")], ['draft', tr("草稿")]].map(([key, label]) => `
          <button class="status-filter-pill ${state.taskFilter === key ? 'active' : ''}" data-action="taskFilter" data-filter="${key}">
            ${key === 'active' ? '<span class="pulse-dot"></span>' : ''}${label}
          </button>`).join('')}
        </div>
      </div>
      ${state.taskLoading ? `<div class="empty"><span class="busy"></span> ${th("读取任务列表中…")}</div>` : state.taskError ? empty(tr("任务读取失败"), state.taskError, button(tr("重新读取"), 'tasksReload', 'secondary')) : items.length ? `<div class="task-list">
          ${items.map(t => {
            const isSelected = t.task_id === state.taskId;
            return `
            <button class="task-row ${isSelected ? 'selected' : ''}" data-action="task" data-id="${t.task_id}">
              <div class="task-thumb-wrap">
                ${previewPlaceholder({ task_id: t.task_id }, 'task-thumb')}
              </div>
              <div class="task-copy">
                <strong>${esc(taskTitle(t, state.models))}</strong>
                <span class="task-kind-tag">${esc(KINDS[t.kind] ?? t.kind)}</span>
              </div>
              <div class="task-state">
                ${status(t.status)}
                <span class="small muted date-tag">${date(t.created_at)}</span>
              </div>
            </button>`;
          }).join('')}
        </div>` : empty(tr("暂无相关任务"), state.taskSearch ? tr("换个搜索关键词试试。") : tr("创建或处理模型后，所有操作进度将记录在此。"), button(icon('plus') + tr("创建模型"), 'create', 'primary'))}
      ${pageButtons(state.taskOffset, state.taskNext, 'tasksPrev', 'tasksNext')}
    </section>
    <section id="taskDetail" class="task-detail">
      ${renderTaskDetail()}
    </section>
  </div>`);
  hydratePreviews();
}

async function selectTask(taskId) {
  const epoch = ++detailEpoch;
  state.taskId = taskId;
  state.taskDetailLoading = true;
  state.taskDetail = null;
  if (state.view !== 'tasks') { state.view = 'tasks'; updateTabs(); loadTasks(); } else renderTasks();
  try {
    const result = await data('tripo_get_task', { task_id: taskId, include_events: true });
    if (epoch !== detailEpoch) return;
    state.taskDetail = result;
  } catch (e) {
    if (epoch !== detailEpoch) return;
    state.taskDetail = { error: e.message };
  }
  if (epoch !== detailEpoch) return;
  state.taskDetailLoading = false;
  if (state.view === 'tasks') renderTasks();
}

function renderTaskDetail() {
  if (state.taskDetailLoading) return `<div class="empty"><span class="busy"></span> ${th("正在读取任务完整详情…")}</div>`;
  if (!state.taskDetail) return empty(tr("选择左侧任务"), tr("查看模型输出、冻结参数、来源素材及事件生命周期轨迹。"));
  if (state.taskDetail.error) return empty(tr("任务详情读取失败"), state.taskDetail.error, button(tr("重新读取"), 'task', 'secondary', `data-id="${esc(state.taskId)}"`));
  const { task: t, events = [] } = state.taskDetail, projectId = taskProject(t);
  const previewable = t.status === 'succeeded' || !!projectId;
  const eventLabels = { 'task.character_changed': tr("角色分组已修改"), 'task.staged': tr("已保存草稿"), 'dispatch.begin': tr("开始提交"), 'dispatch.submitted': tr("已提交"), 'remote.succeeded': tr("处理完成"), 'remote.running': tr("处理中"), 'remote.queued': tr("已排队"), 'remote.failed': tr("处理失败"), 'task.canceled': tr("草稿已取消"), 'task.expired': tr("草稿已过期"), 'download.completed': tr("下载完成"), 'task.reconciled': tr("状态已核实"), 'dispatch.outcome_unknown': tr("提交结果待核实"), 'dispatch.rejected': tr("请求被拒绝"), 'recovery.outcome_unknown': tr("提交结果待核实"), 'task.waiting_for_auth': tr("等待登录") };

  return `
  <div class="task-detail-card">
    <div class="task-detail-header row spread">
      <div>
        <h2>${esc(taskTitle(t, state.models))}</h2>
        <span class="dim small mono">${th("任务 ID: {0}", { "0": esc(t.task_id) })}</span>
      </div>
      <div class="row" style="gap:10px; align-items:center">
        ${status(t.status)}
      </div>
    </div>
    <div class="character-editor-box">
      <div class="character-editor">
        <div class="field" style="margin:0; flex:1">
          <label for="taskCharacter">${th("角色归属")}</label>
          <input id="taskCharacter" maxlength="80" list="characterNames" value="${esc(t.character_group?.name ?? '')}" placeholder="${th("未分组（输入角色名称）")}">
        </div>
        ${button(tr("保存角色"), 'setCharacter', 'secondary', `data-id="${t.task_id}"`, state.busy)}
      </div>
      ${characterNames()}
      <p class="field-note muted small" style="margin-top:4px">${t.character_group?.assigned_by === 'inherited' ? tr("已沿用来源任务的角色分组。") : t.character_group?.assigned_by === 'inferred' ? tr("从描述中的角色名自动归组。") : t.character_group ? tr("后续二次处理将沿用此角色分组。") : tr("填写角色名可归组；留空并保存可移到未分组。")}</p>
    </div>
    ${previewable ? `
    <div class="task-viewport-wrap">
      <div class="viewport">${previewPlaceholder({ task_id: t.task_id, type: 'image' }, 'task-preview')}</div>
    </div>` : empty(t.status === 'staged' ? tr("参数已保存为草稿") : t.status === 'canceled' ? tr("草稿已取消") : t.status === 'failed' ? tr("未生成可用输出") : tr("处理中，暂无预览"), t.status === 'staged' ? tr("提交前可在此核对冻结参数与预估费用。") : t.status === 'canceled' ? tr("这份草稿已标记取消，不会提交扣费。") : t.status === 'failed' ? tr("任务处理遇到异常，请查看下方报错。") : tr("任务完成后，结果将实时显示在此。"))}
    ${t.error ? `<div class="error-card"><strong>${t.status === 'outcome_unknown' ? tr("提交结果待核实") : tr("处理失败")}</strong><p>${esc(t.error.message)}</p>${t.status === 'outcome_unknown' ? `<p class="muted">${th("请在 Studio 确认，避免重复扣费。")}</p>` : ''}</div>` : ''}
    ${t.warnings?.length ? `<details class="warnings-details"><summary>${th("任务提示（{0}）", { "0": t.warnings.length })}</summary>${t.warnings.map(w => `<p class="field-note">${esc(w)}</p>`).join('')}</details>` : ''}
    <div class="task-actions-row">
      ${projectId ? button(tr("查看关联资产"), 'assetDetail', 'secondary', `data-id="${esc(projectId)}"`) : ''}
      ${t.status === 'succeeded' ? button(icon('download') + tr("下载模型文件"), 'taskDownload', 'primary', `data-id="${t.task_id}"`, state.busy) : ''}
      ${t.status === 'staged' ? button(tr("确认并提交"), 'submitDraft', 'primary', `data-id="${t.task_id}"`, state.busy) + button(tr("取消草稿"), 'cancelDraft', 'secondary', `data-id="${t.task_id}"`, state.busy) : ACTIVE.includes(t.status) ? button(icon('refresh') + tr("同步最新状态"), 'syncTask', 'secondary', `data-id="${t.task_id}"`, state.busy) : ''}
    </div>
    <div class="section-divider"></div>
    <h3>${th("本次冻结参数")}</h3>
    ${kv(parameterRows(t))}
    <div class="section-divider"></div>
    <h3>${th("生命周期轨迹")}</h3>
    <ol class="timeline">
      ${events.map(e => `<li><div class="timeline-dot"></div><div class="timeline-content"><strong>${esc(eventLabels[e.type] ?? KINDS[e.type] ?? e.type)}</strong><span>${date(e.at)}</span></div></li>`).join('') || `<li><div class="timeline-dot"></div><div class="timeline-content">${th("暂无事件记录")}</div></li>`}
    </ol>
    <div class="section-divider"></div>
    <h3>${th("输入来源快照")}</h3>
    ${t.snapshots?.length ? kv(t.snapshots.map(s => [({ image: tr("源图片"), front: tr("正面"), left: tr("左侧"), back: tr("背面"), right: tr("右侧"), model: tr("源模型"), reference: tr("参考图片") })[s.slot] ?? s.slot, s.source_name ?? s.label])) : `<p class="field-note muted small">${th("没有本地输入快照。")}</p>`}
    ${(t.downloads ?? []).map(d => `<div class="download-path">${th("{0} 本地已保存：{1}", { "0": icon('check'), "1": esc(d.path) })}</div>`).join('')}
  </div>`;
}

// ==========================================================================
// Creation Module (Create 3D Model)
// ==========================================================================
function renderCreate() {
  const f = state.form, high = f.tier === 'high_detail', selectedImage = f.images.front;

  setMain(`
  <div class="page-title row spread">
    <div class="page-heading">
      <div class="row" style="gap:10px; align-items:center">
        <h1>${th("创建 3D 模型")}</h1>
        <span class="badge-accent">${th("AI 快速生成")}</span>
      </div>
      <p class="muted small">${th("从单张图片、多视角切面或文字描述快速生成可直接导出的 3D 资产")}</p>
    </div>
  </div>
  <div class="create-modes-grid">
    <button class="mode-card ${f.mode === 'image' ? 'active' : ''}" data-action="createMode" data-mode="image">
      <div class="mode-icon">${icon('image')}</div>
      <div class="mode-text">
        <strong>${th("单图建模")}</strong>
        <span>${th("参考图片快速生成")}</span>
      </div>
    </button>
    <button class="mode-card ${f.mode === 'text' ? 'active' : ''}" data-action="createMode" data-mode="text">
      <div class="mode-icon">${icon('sparkles')}</div>
      <div class="mode-text">
        <strong>${th("文本生成")}</strong>
        <span>${th("提示词自由创造")}</span>
      </div>
    </button>
    <button class="mode-card ${f.mode === 'multiview' ? 'active' : ''}" data-action="createMode" data-mode="multiview">
      <div class="mode-icon">${icon('layers')}</div>
      <div class="mode-text">
        <strong>${th("四视角生成")}</strong>
        <span>${th("多视角切面高保真建模")}</span>
      </div>
    </button>
  </div>
  <div class="create-layout">
    <section class="input-workspace">
      <div class="character-card">
        <div class="character-card-header">
          <span class="character-icon">${icon('user')}</span>
          <label for="characterName">${th("角色归属")}</label>
          <span class="muted small" style="margin-left:auto">${th("同一角色的图片与模型会自动归为一组")}</span>
        </div>
        <div class="character-input-row">
          <input id="characterName" maxlength="80" list="characterNames" value="${esc(f.characterName)}" placeholder="${th("输入角色名称，例如：派蒙、赛博机甲…（留空自动归组）")}">
        </div>
        ${characterNames()}
        ${state.groups.filter(g => g.id !== 'ungrouped' && g.name).length ? `
        <div class="character-chips">
          <span class="chips-label">${th("现有角色：")}</span>
          ${state.groups.filter(g => g.id !== 'ungrouped' && g.name).slice(0, 6).map(g => `<button type="button" class="chip-btn ${f.characterName === g.name ? 'active' : ''}" data-action="pickCharacter" data-name="${esc(g.name)}">${esc(g.name)}</button>`).join('')}
        </div>` : ''}
      </div>

      ${f.mode === 'text' ? `
      <div class="stage-header row spread">
        <h2>${th("模型描述词 (Prompt)")}</h2>
        <span id="promptCount" class="prompt-count">${f.prompt.length} / 1000</span>
      </div>
      <div class="prompt-container">
        <textarea id="prompt" class="prompt-area" maxlength="1000" placeholder="${th("详尽描述主体的外形轮廓、结构特征、材质与色彩细节。例如：白色陶瓷装甲与高光铜色关节的机械九尾狐，锐利几何线条，站立姿态，无底座。")}">${esc(f.prompt)}</textarea>
        <div class="prompt-suggestions">
          <span class="chips-label">${th("灵感预设：")}</span>
          <button type="button" class="chip-btn" data-action="insertPrompt" data-prompt="${th("赛博朋克重装机甲，哑光碳纤维与霓虹流光线路，机械双足，精细工业细节")}">${th("赛博机甲")}</button>
          <button type="button" class="chip-btn" data-action="insertPrompt" data-prompt="${th("3D 萌系潮玩手办，Q版大头身比，马卡龙柔和渐变配色，黏土质感，光滑表面")}">${th("萌系手办")}</button>
          <button type="button" class="chip-btn" data-action="insertPrompt" data-prompt="${th("古典欧式雕花扶手椅，深胡桃木色框架，墨绿色复古天鹅绒软包，黄铜铆钉细节")}">${th("欧式实木椅")}</button>
          <button type="button" class="chip-btn" data-action="insertPrompt" data-prompt="${th("低多边形奇幻双翼飞龙，几何水晶棱角分明，翡翠绿与亮金发光脉络")}">${th("低模飞龙")}</button>
        </div>
      </div>
      <div class="t-pose-switch-card">
        <label class="switch-row" for="tPose">
          <div class="switch-info">
            <strong>${th("生成标准 T-Pose")}</strong>
            <span class="muted small">${th("对称双臂展开标准 T 姿态，极大提升后续自动绑定骨骼及动作的精度")}</span>
          </div>
          <input id="tPose" type="checkbox" class="switch" ${f.tPose ? 'checked' : ''}>
        </label>
      </div>` : f.mode === 'multiview' ? `
      <div class="stage-header row spread">
        <h2>${th("四视角参考图")}</h2>
        <span class="muted small">${th("正面为主视角（必填），至少包含一个其他切面")}</span>
      </div>
      <div class="view-slots">
        ${[['front', tr("正面 (必填)"), 'front'], ['left', tr("左侧"), 'left'], ['back', tr("背面"), 'back'], ['right', tr("右侧"), 'right']].map(([slot, label, key]) => `
        <div class="view-slot-card ${f.images[key] ? 'filled' : 'empty'}">
          <div class="slot-badge">${label}</div>
          ${f.images[key] ? `
          <div class="slot-img-wrap">
            <img src="${f.images[key].preview}" alt="${label}">
            <button class="remove-slot" data-action="removeImage" data-slot="${key}" aria-label="${th("移除{0}", { "0": label })}" title="${th("移除")}">×</button>
          </div>` : `
          <button class="slot-upload-btn" data-action="chooseImage" data-slot="${key}" ${state.importing ? 'disabled' : ''}>
            ${icon('plus')}
            <span>${th("添加图片")}</span>
          </button>`}
        </div>`).join('')}
      </div>` : `
      <div class="stage-header row spread">
        <h2>${th("参考图片")}</h2>
        ${selectedImage ? `<div class="row" style="gap:8px"><span class="badge muted small">${selectedImage.width} × ${selectedImage.height}</span>${button(tr("更换图片"), 'chooseImage', 'text-button', 'data-slot="front"', state.importing)}${button(tr("移除"), 'removeImage', 'text-button', 'data-slot="front"', state.importing)}</div>` : `<span class="muted small">${th("推荐纯色底、轮廓清晰的主体图")}</span>`}
      </div>
      <div id="uploadStage" class="upload-stage ${selectedImage ? 'has-image' : ''}">
        ${state.importing ? `<div class="upload-empty"><span class="busy"></span><p>${th("正在读取并导入本地素材…")}</p></div>` : selectedImage ? `
        <div class="preview-backdrop">
          <img src="${selectedImage.preview}" alt="${esc(selectedImage.name)}">
        </div>
        <div class="stage-overlay">
          <div class="stage-meta-pill">
            <span>${esc(selectedImage.name)}</span>
            <span class="dot-sep">·</span>
            <span>${selectedImage.width} × ${selectedImage.height}</span>
          </div>
          <div class="stage-actions row" style="gap:8px">
            ${button(tr("更换图片"), 'chooseImage', 'overlay-button', 'data-slot="front"', state.importing)}
            ${button(tr("移除"), 'removeImage', 'overlay-button danger', 'data-slot="front"', state.importing)}
          </div>
        </div>` : `
        <div class="upload-empty">
          <div class="upload-icon-circle">${icon('upload')}</div>
          <h3>${th("拖入参考图片到此处")}</h3>
          <p class="muted small">${th("或点击下方按钮直接选择本地文件")}</p>
          <div class="upload-badges">
            <span class="tag">PNG</span>
            <span class="tag">JPG</span>
            <span class="tag">WebP</span>
            <span class="tag">${th("最大 20 MB")}</span>
          </div>
          ${button(icon('plus') + tr("选择本地图片"), 'chooseImage', 'primary', 'data-slot="front"', !state.ready)}
        </div>`}
      </div>`}
    </section>

    <aside class="create-settings">
      <div class="settings-header">
        <h2>${th("生成设置")}</h2>
        <span class="badge-tier">${high ? tr("H3.1 旗舰") : tr("P2.0 拓扑")}</span>
      </div>

      <div class="tier-card-selector">
        <button class="tier-card ${high ? 'active' : ''}" data-action="tier" data-tier="high_detail">
          <div class="tier-card-header">
            <span class="tier-title">${th("高精度")}</span>
            <span class="tier-badge">${th("推荐")}</span>
          </div>
          <p class="tier-desc">${th("H3.1 旗舰几何 · 4K/8K PBR 材质")}</p>
        </button>
        <button class="tier-card ${!high ? 'active' : ''}" data-action="tier" data-tier="smart_mesh">
          <div class="tier-card-header">
            <span class="tier-title">Smart Mesh</span>
            <span class="tier-badge alt">${th("游戏拓扑")}</span>
          </div>
          <p class="tier-desc">${th("P2.0 规整四边面 · 轻量拓扑")}</p>
        </button>
      </div>

      <div class="setting-block">
        <div class="row spread label-row">
          <label for="faces">${th("目标面数")}</label>
          <span class="mono muted small" id="faceHint">${th("{0} 面", { "0": formatNumber(f.faces) })}</span>
        </div>
        <div class="face-input-wrap">
          <input id="faces" type="number" min="500" max="${high ? f.quad ? 50000 : f.geometry === 'detailed' ? 2000000 : 1000000 : 25000}" step="500" value="${f.faces}">
        </div>
        <div class="face-presets">
          <button type="button" class="preset-pill ${Number(f.faces) === 10000 ? 'active' : ''}" data-action="setFaces" data-value="10000">${th("1 万")}</button>
          <button type="button" class="preset-pill ${Number(f.faces) === 30000 ? 'active' : ''}" data-action="setFaces" data-value="30000">${th("3 万")}</button>
          <button type="button" class="preset-pill ${Number(f.faces) === 60000 ? 'active' : ''}" data-action="setFaces" data-value="60000">${th("6 万")}</button>
          <button type="button" class="preset-pill ${Number(f.faces) === 100000 ? 'active' : ''}" data-action="setFaces" data-value="100000">${th("10 万")}</button>
        </div>
      </div>

      ${high ? `
      <div class="setting-block">
        <label for="geometry">${th("几何质量")}</label>
        ${select('geometry', [['standard', tr("标准几何（平衡速度与细节）")], ['detailed', tr("精细几何（超清高模）")]], f.geometry)}
      </div>
      <div class="setting-card">
        <label class="switch-row" for="texture">
          <div class="switch-info">
            <strong>${th("生成贴图")}</strong>
            <span class="muted small">${th("为模型生成高分辨率表面纹理")}</span>
          </div>
          <input id="texture" type="checkbox" class="switch" ${f.texture ? 'checked' : ''}>
        </label>
        ${f.texture ? `
        <div class="texture-subsettings">
          <div class="subsetting-row">
            <label for="textureQuality">${th("贴图分辨率")}</label>
            <div class="segments-pills">
              ${[['standard', '2K'], ['detailed', '4K'], ['ultra', '8K']].map(([val, lbl]) => `
              <button type="button" class="seg-pill ${f.textureQuality === val ? 'active' : ''}" data-action="setTextureQuality" data-value="${val}">${lbl}</button>`).join('')}
            </div>
            <select id="textureQuality" class="hidden">
              ${[['standard', '2K'], ['detailed', '4K'], ['ultra', '8K']].map(([v, l]) => `<option value="${v}" ${f.textureQuality === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <label class="switch-row sub" for="pbr">
            <div class="switch-info">
              <span>${th("PBR 材质贴图")}</span>
              <span class="dim small">${th("包含法线、粗糙度与金属度贴图")}</span>
            </div>
            <input id="pbr" type="checkbox" class="switch" ${f.pbr ? 'checked' : ''}>
          </label>
          <label class="switch-row sub" for="delight">
            <div class="switch-info">
              <span>${th("去除表面光照 (Delight)")}</span>
              <span class="dim small">${th("还原纯净材质反照率，便于自定光照渲染")}</span>
            </div>
            <input id="delight" type="checkbox" class="switch" ${f.delight ? 'checked' : ''}>
          </label>
        </div>` : ''}
      </div>` : `
      <div class="setting-block">
        <label for="amount">${th("生成变体数量")}</label>
        ${select('amount', [['1', tr("1 个独立变体")], ['2', tr("2 个变体候选")], ['4', tr("4 个变体候选")]], f.amount)}
      </div>`}

      <details ${f.advanced ? 'open' : ''} id="advanced" class="advanced-details">
        <summary>${th("高级参数配置")}</summary>
        <div class="advanced-inner">
          <label class="switch-row sub" for="quad">
            <div class="switch-info">
              <span>${th("四边形拓扑 (Quad)")}</span>
              <span class="dim small">${th("重采样为标准四边网格，适合动画与雕刻")}</span>
            </div>
            <input id="quad" type="checkbox" class="switch" ${f.quad ? 'checked' : ''}>
          </label>
          <div class="setting-block" style="margin-top:8px">
            <label for="visibility">${th("模型公开性")}</label>
            ${select('visibility', [['private', tr("私有（仅自己可见）")], ['public', tr("公开")], ['shareable', tr("仅通过链接可分享")]], f.visibility)}
          </div>
        </div>
      </details>

      <div id="quoteArea">${quoteMarkup()}</div>

      <div class="create-footer">
        ${button(tr("保存为草稿"), 'saveDraft', 'secondary wide', '', !canDraft())}
        ${button(icon('sparkles') + tr("确认并生成模型"), 'generate', 'primary wide action-hero', 'id="generateButton"', !canGenerate())}
      </div>
      <p class="field-note muted small" style="text-align:center">${th("提交后可随时在“任务”中查看生成进度")}</p>
    </aside>
  </div>`);

  const drop = $('uploadStage');
  if (drop) {
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('drag'); };
    drop.ondragleave = () => drop.classList.remove('drag');
    drop.ondrop = e => {
      e.preventDefault();
      drop.classList.remove('drag');
      if (e.dataTransfer.files[0]) importFile(e.dataTransfer.files[0], 'front');
    };
  }
}

function captureCreate() {
  const f = state.form;
  if ($('characterName')) f.characterName = $('characterName').value;
  for (const id of ['prompt', 'faces', 'geometry', 'textureQuality', 'amount', 'visibility']) {
    if ($(id)) f[id] = $(id).value;
  }
  for (const id of ['texture', 'pbr', 'delight', 'quad', 'tPose']) {
    if ($(id)) f[id] = $(id).checked;
  }
  f.advanced = $('advanced')?.open ?? f.advanced;
}

function currentRequest() {
  return state.view === 'create' ? { kind: 'model.generate', tool: 'tripo_generate_model', input: generationInput(state.form) } : state.view === 'assets' && state.detail ? operationRequest() : null;
}

function clearQuote() {
  ++quoteEpoch;
  clearTimeout(quoteTimer);
  state.quote = null;
  state.quoteKey = null;
  state.quoteBusy = false;
  state.quoteError = '';
}

function quoteMarkup() {
  const isEstimated = state.quote && Number.isFinite(state.quote.estimated_credits);
  const compact = state.view === 'assets' && !!state.detail;
  const refresh = state.authed ? button(compact ? icon('refresh') : tr("重新报价"), 'requote', `quote-refresh-btn${compact ? ' icon-button' : ''}`, `aria-label="${th("重新报价")}" title="${th("重新报价")}"`, state.quoteBusy || state.busy) : '';
  return `
  <div class="quote-widget">
    <div class="quote-widget-top">
      <div class="quote-label-wrap">
        <span class="quote-icon">${icon('coins')}</span>
        <span class="quote-title">${th("预计消耗费用")}</span>
      </div>
      <div class="quote-amount-wrap">
        ${state.quoteBusy ? `<span class="busy"></span> <span class="quote-calculating">${th("计算中…")}</span>` : isEstimated ? `<strong class="quote-credits">${state.quote.estimated_credits}</strong><span class="quote-unit">${th("积分")}</span>` : '<span class="quote-unknown">—</span>'}
      </div>
      ${compact ? refresh : ''}
    </div>
    <div class="quote-widget-bottom">
      <p class="quote-note ${state.quoteError ? 'error' : ''}">${esc(state.quoteError || (!state.authed ? tr("请先登录 Tripo 账号以获取实时报价与生成。") : state.quote?.estimated_credits === null ? tr("当前操作费用待核实，提交前将明确提示。") : state.quote ? tr("按当前设置估算，最终扣费以服务实际执行为准。") : tr("配置参数后自动计算所需积分。")))}</p>
      ${compact ? '' : refresh}
    </div>
  </div>`;
}

function canGenerate() {
  try {
    const req = currentRequest();
    return state.ready && state.authed && !state.busy && !state.importing && !state.quoteBusy && quoteCurrent(state.quote) && state.quoteKey === JSON.stringify(req);
  } catch {
    return false;
  }
}

function canDraft() {
  try {
    return !!currentRequest() && state.ready && state.authed && !state.busy && !state.importing;
  } catch {
    return false;
  }
}

function updateQuoteUI() {
  if ($('quoteArea')) $('quoteArea').innerHTML = quoteMarkup();
  if ($('generateButton')) $('generateButton').disabled = !canGenerate();
  const draft = document.querySelector('[data-action=saveDraft]');
  if (draft) draft.disabled = !canDraft();
}

function scheduleQuote(delay = 450) {
  clearQuote();
  updateQuoteUI();
  if (!state.ready || !state.authed || state.importing) return;
  let req;
  try { req = currentRequest(); } catch (e) { state.quoteError = e.message; updateQuoteUI(); return; }
  if (!req) return;
  const key = JSON.stringify(req), epoch = quoteEpoch;
  state.quoteBusy = true;
  updateQuoteUI();
  quoteTimer = setTimeout(async () => {
    try {
      const input = { ...req.input };
      delete input.submit;
      delete input.character_name;
      delete input.parent_task_id;
      const result = await data('tripo_quote_operation', { kind: req.kind, input });
      if (epoch !== quoteEpoch) return;
      state.quote = result.quote;
      state.quoteKey = key;
    } catch (e) {
      if (epoch === quoteEpoch) state.quoteError = e.message;
    }
    if (epoch === quoteEpoch) {
      state.quoteBusy = false;
      updateQuoteUI();
    }
  }, delay);
}

async function importFile(file, slot) {
  if (state.importing || !state.ready) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
    toast(tr("请选择小于 20 MB 的 PNG、JPG 或 WebP 图片。"), true);
    return;
  }
  captureCreate();
  state.importing = true;
  clearQuote();
  renderCreate();
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const result = await call('tripo_ui_import_image', { name: file.name, data_base64: dataUrl.split(',')[1] });
    const info = result.structuredContent;
    state.form.images[slot] = { ...info, preview: result._meta?.tripo?.preview?.data_url };
    toast(tr("图片已成功保存到本地，尚未提交生成。"));
  } catch (e) {
    toast(e.message, true);
  } finally {
    state.importing = false;
    if (state.view === 'create') {
      renderCreate();
      scheduleQuote();
    }
  }
}

$('imagePicker').onchange = e => {
  const file = e.target.files[0];
  if (file) importFile(file, selectionSlot);
  e.target.value = '';
};

// ==========================================================================
// Staging & Submissions
// ==========================================================================
async function stageCurrent(submit) {
  if (state.busy) return;
  if (state.view === 'create') captureCreate(); else captureOperation();
  const req = currentRequest();
  if (!req) return;
  if (submit && state.view === 'create' && !canGenerate()) {
    scheduleQuote(0);
    toast(tr("报价已失效，请等待重新计算。"), true);
    return;
  }
  state.busy = true;
  updateQuoteUI();
  document.querySelectorAll('[data-action="saveDraft"],[data-action="stageOperation"],[data-action="process"]').forEach(b => b.disabled = true);
  try {
    const result = await data(req.tool, { ...req.input, submit: false, review: false });
    if (!result.task) throw Error(tr("未收到任务记录。"));
    if (submit) {
      state.busy = false;
      await confirmTask(result.task);
    } else {
      toast(tr("草稿已保存，可在“任务”中确认提交。"));
      await showTask(result.task.task_id);
    }
  } catch (e) {
    toast(e.message, true);
    if (e.task) await showTask(e.task.task_id);
  } finally {
    state.busy = false;
    if (state.view === 'create') { renderCreate(); updateQuoteUI(); }
    else if (state.view === 'assets' && state.detail) { renderAssetDetail(); updateQuoteUI(); }
    else if (state.view === 'tasks') renderTasks();
  }
}

async function confirmTask(task) {
  if (state.busy || task.status !== 'staged') return;
  const quote = (await data('tripo_quote_operation', { task_id: task.task_id, refresh: true })).quote;
  const unknown = task.consumes_credits && !Number.isFinite(quote?.estimated_credits);
  setText($('confirmTitle'), () => tr("确认{0}", { "0": KINDS[task.kind] ?? tr("提交") }));
  setText($('confirmSubmit'), () => tr("确认提交"));
  setText($('confirmCancel'), () => state.view === 'tasks' ? tr("关闭") : tr("返回修改"));
  setDialogBody(() => `${task.character_group ? kv([[tr("角色分组"), task.character_group.name]]) : ''}${kv(parameterRows(task))}<div class="quote-widget" style="margin-top:16px"><div class="quote-widget-top"><span class="quote-title">${th("预计消耗费用")}</span><div class="quote-amount-wrap">${unknown ? `<span class="quote-unknown">${th("费用待确认")}</span>` : `<strong class="quote-credits">${quote?.estimated_credits ?? 0}</strong><span class="quote-unit">${th("积分")}</span>`}</div></div><p class="quote-note" style="margin-top:8px">${unknown ? tr("当前操作无法获取可靠报价。确认后将向 Studio 提交并可能消耗积分。") : tr("参数已冻结。费用为估算值，最终扣费以 Studio 实际消耗为准。")}</p></div>${unknown ? check('unknownCost', tr("我已知晓并接受费用未知，继续提交"), false) : ''}${task.warnings?.length ? `<details style="margin-top:12px"><summary>${th("任务提示")}</summary>${task.warnings.map(w => `<p class="field-note muted small">${esc(w)}</p>`).join('')}</details>` : ''}`);
  $('confirmSubmit').disabled = unknown;
  if ($('unknownCost')) $('unknownCost').onchange = e => $('confirmSubmit').disabled = !e.target.checked;
  const accepted = await new Promise(resolve => {
    const finish = value => {
      $('confirmDialog').close();
      $('confirmSubmit').onclick = null;
      $('confirmCancel').onclick = null;
      $('confirmDialog').oncancel = null;
      resolve(value);
    };
    $('confirmCancel').onclick = () => finish(false);
    $('confirmSubmit').onclick = () => finish(true);
    $('confirmDialog').oncancel = e => { e.preventDefault(); finish(false); };
    $('confirmDialog').showModal();
  });
  if (!accepted) {
    toast(tr("参数已保存为草稿。"));
    if (state.view === 'tasks') await selectTask(task.task_id);
    return;
  }
  if (quote?.estimate_expires_at && Date.parse(quote.estimate_expires_at) <= Date.now()) {
    toast(tr("报价已过期，请重新确认。"), true);
    await showTask(task.task_id);
    return;
  }
  state.busy = true;
  try {
    const result = await data('tripo_submit_task', { task_id: task.task_id, confirmation: task.confirmation, request_hash: task.request_hash });
    void refreshCredits();
    toast(tr("任务已成功提交。"));
    await showTask(result.task.task_id);
  } catch (e) {
    toast(e.message, true);
    await showTask(e.task?.task_id ?? task.task_id);
  } finally {
    state.busy = false;
    if (state.view === 'tasks') renderTasks();
  }
}

async function showTask(taskId) {
  state.taskId = taskId;
  state.view = 'tasks';
  state.detail = null;
  clearQuote();
  updateTabs();
  await Promise.all([loadTasks(true), selectTask(taskId)]);
}

async function downloadTask(taskId) {
  state.busy = true;
  try {
    const t = (await data('tripo_get_task', { task_id: taskId })).task;
    const result = await data('tripo_download', { task_id: taskId, artifact: artifactFor(t) });
    toast(tr("已保存至本地：{0}", { "0": result.download.path }));
    await selectTask(taskId);
  } finally {
    state.busy = false;
    if (state.view === 'tasks') renderTasks();
  }
}

async function downloadAsset(id) {
  state.busy = true;
  try {
    const result = await data('tripo_download', state.assetType === 'models' ? { project_id: id } : { asset_id: id, artifact: 'image' });
    toast(tr("已保存至本地：{0}", { "0": result.download.path }));
  } finally {
    state.busy = false;
  }
}

async function exportDialog() {
  const projectId = state.detail?.project_id;
  if (!projectId) return;
  setText($('confirmTitle'), () => tr("导出 3D 模型"));
  setDialogBody(() => field(tr("目标导出格式"), select('exportFormat', [['glb', tr("GLB (标准 3D / Web)")], ['fbx', tr("FBX (Unity / 动画)")], ['obj', tr("OBJ (通用几何网格)")], ['usdz', 'USDZ (Apple AR)'], ['stl', tr("STL (3D 打印)")], ['3mf', tr("3MF (现代 3D 制造)")]], state.opForm.format), '', 'exportFormat') + field(tr("贴图最大分辨率"), select('exportSize', [['0', tr("保持原始尺寸")], ['1024', '1K'], ['2048', '2K'], ['4096', '4K'], ['8192', '8K']], state.opForm.textureSize), '', 'exportSize') + check('exportAnimation', tr("包含绑定的动作数据"), false) + `<p class="field-note muted small" style="margin-top:10px">${th("导出任务不消耗 Studio 积分。完成后自动下载并校准贴图尺寸。")}</p>`);
  setText($('confirmSubmit'), () => tr("创建导出任务"));
  $('confirmSubmit').disabled = false;
  const input = await new Promise(resolve => {
    const finish = value => { $('confirmDialog').close(); resolve(value); };
    $('confirmCancel').onclick = () => finish(null);
    $('confirmDialog').oncancel = e => { e.preventDefault(); finish(null); };
    $('confirmSubmit').onclick = () => finish({ format: $('exportFormat').value, texture_size: Number($('exportSize').value), with_animation: $('exportAnimation').checked });
    $('confirmDialog').showModal();
  });
  setText($('confirmSubmit'), () => tr("确认提交"));
  if (!input) return;
  state.busy = true;
  try {
    const result = await data('tripo_export_model', { project_id: projectId, ...input, ...(!input.texture_size ? { texture_size: undefined } : {}), submit: true });
    await showTask(result.task.task_id);
  } finally {
    state.busy = false;
  }
}

// ==========================================================================
// Navigation & Global Event Handling
// ==========================================================================
function updateTabs() {
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
}

async function navigate(view) {
  ++viewEpoch;
  ++detailEpoch;
  state.view = view;
  clearTimeout(assetSearchTimer);
  if(view !== 'assets'){clearAssetSelection();}
  state.detail = null;
  state.taskDetailLoading = false;
  clearQuote();
  updateTabs();
  if (view === 'assets') await loadAssets();
  if (view === 'tasks') await loadTasks();
  if (view === 'create') {
    renderCreate();
    scheduleQuote();
    try {
      const grouped = await data('tripo_list_task_groups', {});
      state.groups = grouped.groups ?? [];
      if (state.view === 'create') {
        captureCreate();
        renderCreate();
        updateQuoteUI();
      }
    } catch {}
  }
}

async function openInput() {
  const input = state.openInput, route = JSON.stringify([input.view, input.project_id, input.task_id]);
  if (state.route === route) return;
  state.route = route;
  if (input.task_id) return showTask(input.task_id);
  if (input.project_id) return openAsset(input.project_id);
  return navigate(['assets', 'tasks', 'create'].includes(input.view) ? input.view : 'assets');
}

document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
  state.userNavigated = true;
  navigate(b.dataset.view).catch(e => toast(e.message, true));
});

$('appearance').innerHTML = icon('sun');
$('appearance').onclick = () => {
  theme = ['system', 'light', 'dark'][(['system', 'light', 'dark'].indexOf(theme) + 1) % 3];
  applyTheme();
  toast(tr("主题切换为：{0}", { "0": { system: tr("跟随系统"), light: tr("浅色模式"), dark: tr("深色模式") }[theme] }));
};

$('refresh').innerHTML = icon('refresh');
$('refresh').onclick = async () => {
  if (!state.ready) return;
  try {
    await authStatus();
    if (state.view === 'assets') state.detail ? await openAsset(state.detail.project_id) : await loadAssets(false,true);
    else if (state.view === 'tasks') {
      await loadTasks();
      if (state.taskId) await selectTask(state.taskId);
    } else scheduleQuote(0);
  } catch (e) {
    toast(e.message, true);
  }
};

$('login').onclick = async () => {
  $('login').disabled = true;
  try {
    await data('tripo_auth_login');
    await authStatus();
    await navigate(state.view);
  } catch (e) {
    toast(e.message, true);
  } finally {
    $('login').disabled = false;
  }
};

$('main').addEventListener('input', e => {
  if (e.target.id === 'assetSearch') {
    state.assetSearch = e.target.value;
    clearTimeout(assetSearchTimer);
    assetSearchTimer = setTimeout(() => { if (state.view === 'assets' && !state.detail) loadAssets(true); }, 200);
  } else if (e.target.id === 'taskSearch') {
    const position = e.target.selectionStart;
    state.taskSearch = e.target.value;
    renderTasks();
    $('taskSearch')?.focus();
    $('taskSearch')?.setSelectionRange(position, position);
  } else if (state.view === 'create') {
    captureCreate();
    if ($('promptCount')) setText($('promptCount'), () => `${state.form.prompt.length} / 1000`);
    if ($('faceHint') && $('faces')) setText($('faceHint'), () => tr("{0} 面", { "0": formatNumber($('faces').value) }));
    scheduleQuote();
  } else if (state.detail) {
    captureOperation();
    scheduleQuote();
  }
});

$('main').addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'assetType') {
    state.assetType = e.target.value;
    clearAssetSelection();state.assetGroup='all';
    state.assetSearch = '';
    loadAssets(true);
  } else if (id === 'assetFilter') {
    state.assetFilter = e.target.value;
    state.selected = null;
    loadAssets(true);
  } else if (id === 'assetSort') {
    state.assetSort = e.target.value;
    loadAssets(true);
  } else if (state.view === 'create' && ['texture', 'quad', 'geometry'].includes(id)) {
    captureCreate();
    renderCreate();
    scheduleQuote();
  } else if (state.detail && ['opQuad', 'opSmart', 'opRigType'].includes(id)) {
    captureOperation();
    const inspector = document.querySelector('.inspector');
    if (inspector) {
      inspector.innerHTML = inspector.querySelector('.inspector-header').outerHTML + inspector.querySelector('.op-tabs').outerHTML + renderOperation();
      scheduleQuote();
    }
  }
});

$('main').addEventListener('click', async e => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const action = b.dataset.action, id = b.dataset.id;
  if (state.busy && ['selectAsset','openGroup','groupsBack','setAssetType','selectPageAssets'].includes(action)) return;
  try {
    if (action === 'create') await navigate('create');
    else if (action === 'assetsReload') await loadAssets(false,true);
    else if (action === 'assetsBack') { ++detailEpoch; state.detail = null; clearQuote(); await loadAssets(); }
    else if (['grid', 'list'].includes(action)) { state.layout = action; renderAssets(); }
    else if (action === 'setAssetType') { state.assetType = b.dataset.type; clearAssetSelection();  state.assetGroup='all'; state.assetSearch=''; await loadAssets(true); }
    else if (action === 'selectAsset') { toggleAssetSelection(id);renderAssets(); }
    else if (action === 'clearSelection') { clearAssetSelection(); renderAssets(); }
    else if (action === 'clearAssetSearch') { state.assetSearch = ''; await loadAssets(true); $('assetSearch')?.focus(); }
    else if (action === 'clearTaskSearch') { state.taskSearch = ''; renderTasks(); $('taskSearch')?.focus(); }
    else if (action === 'selectPageAssets') { for(const asset of state.libraryEntries.filter(e=>e.entry_type==='asset')) { const key=asset.project_id??asset.asset_id;if(!state.selectedAssets.has(key))toggleAssetSelection(key); }renderAssets(); }
    else if (action === 'createAssetGroup') await groupSelection(true);
    else if (action === 'joinAssetGroup') await groupSelection(false);
    else if (action === 'removeFromGroup') await removeSelectedFromGroup();
    else if (action === 'openGroup' || action === 'groupsBack') { state.assetGroup=action==='openGroup'?id:'all';state.assetSearch='';clearAssetSelection();await loadAssets(true); }
    else if (action === 'renameAssetGroup') await renameAssetGroup();
    else if (action === 'assetDetail') {
      if (state.assetType === 'images' && state.images.some(a => a.asset_id === id) && !state.detail) {
        const result = await preview({ asset_id: id, type: 'image' });
        setText($('confirmTitle'), () => tr("图片输出预览"));
        setDialogBody(() => `<div style="text-align:center;padding:12px"><img src="${result.data_url}" alt="${th("图片")}" style="max-height:420px;border-radius:10px;margin:auto"></div>`);
        setText($('confirmSubmit'), () => tr("关闭"));
        $('confirmSubmit').disabled = false;
        $('confirmSubmit').onclick = () => { $('confirmDialog').close(); setText($('confirmSubmit'), () => tr("确认提交")); };
        $('confirmCancel').onclick = () => $('confirmDialog').close();
        $('confirmDialog').showModal();
      } else await openAsset(id);
    }
    else if (action === 'assetDownload') await downloadAsset(id);
    else if (action === 'export') await exportDialog();
    else if (action === 'operation') { captureOperation(); state.op = b.dataset.op; clearQuote(); renderAssetDetail(); scheduleQuote(); }
    else if (action === 'material' || action === 'wireframe') {
      if (!viewer) return;
      viewer.wireframe(action === 'wireframe');
      document.querySelectorAll('[data-action="material"],[data-action="wireframe"]').forEach(n => n.classList.toggle('active', n.dataset.action === action));
    }
    else if (action === 'fit') viewer?.reset();
    else if (action === 'reloadViewer') { previews.delete(JSON.stringify({ project_id: state.detail.project_id, type: 'model' })); await loadViewer(state.detail.project_id); }
    else if (action === 'projectTasks') { state.taskSearch = ''; await navigate('tasks'); }
    else if (action === 'task') await selectTask(id);
    else if (action === 'tasksReload') await loadTasks();
    else if (action === 'taskFilter') { state.taskFilter = b.dataset.filter; state.taskId = null; state.taskDetail = null; await loadTasks(true); }
    else if (action === 'syncTask') { b.disabled = true; await data('tripo_task_sync', { task_id: id }); await Promise.all([loadTasks(), selectTask(id)]); }
    else if (action === 'taskDownload') { b.disabled = true; await downloadTask(id); }
    else if (action === 'setCharacter') {
      const character_name = $('taskCharacter').value.trim() || null;
      state.busy = true;
      try {
        const result = await data('tripo_set_task_character', { task_id: id, character_name });
        state.taskOffset = 0;
        toast(tr("角色分组已更新。"));
        await Promise.all([loadTasks(), selectTask(id)]);
      } finally {
        state.busy = false;
        renderTasks();
      }
    }
    else if (action === 'cancelDraft') { b.disabled = true; await data('tripo_task_cancel', { task_id: id }); await Promise.all([loadTasks(), selectTask(id)]); }
    else if (action === 'submitDraft') { b.disabled = true; const t = (await data('tripo_get_task', { task_id: id })).task; await confirmTask(t); }
    else if (action === 'createMode') { captureCreate(); state.form.mode = b.dataset.mode; clearQuote(); renderCreate(); scheduleQuote(); }
    else if (action === 'tier') {
      captureCreate();
      state.form.tier = b.dataset.tier;
      state.form.faces = state.form.tier === 'smart_mesh' ? 10000 : 60000;
      state.form.quad = state.form.tier === 'smart_mesh';
      clearQuote();
      renderCreate();
      scheduleQuote();
    }
    else if (action === 'pickCharacter') {
      state.form.characterName = b.dataset.name;
      if ($('characterName')) $('characterName').value = b.dataset.name;
      renderCreate();
      scheduleQuote();
    }
    else if (action === 'setFaces') {
      state.form.faces = Number(b.dataset.value);
      if ($('faces')) $('faces').value = b.dataset.value;
      if ($('faceHint')) setText($('faceHint'), () => tr("{0} 面", { "0": formatNumber(b.dataset.value) }));
      document.querySelectorAll('.preset-pill').forEach(p => p.classList.toggle('active', p.dataset.value === b.dataset.value));
      scheduleQuote();
    }
    else if (action === 'setTextureQuality') {
      state.form.textureQuality = b.dataset.value;
      if ($('textureQuality')) $('textureQuality').value = b.dataset.value;
      document.querySelectorAll('.seg-pill').forEach(p => p.classList.toggle('active', p.dataset.value === b.dataset.value));
      scheduleQuote();
    }
    else if (action === 'insertPrompt') {
      const p = b.dataset.prompt;
      state.form.prompt = state.form.prompt ? `${state.form.prompt}${tr('，')}${p}` : p;
      if ($('prompt')) $('prompt').value = state.form.prompt;
      if ($('promptCount')) setText($('promptCount'), () => `${state.form.prompt.length} / 1000`);
      scheduleQuote();
    }
    else if (action === 'chooseImage') { selectionSlot = b.dataset.slot ?? 'front'; $('imagePicker').click(); }
    else if (action === 'removeImage') { captureCreate(); delete state.form.images[b.dataset.slot]; clearQuote(); renderCreate(); scheduleQuote(); }
    else if (action === 'requote') { state.view === 'create' ? captureCreate() : captureOperation(); scheduleQuote(0); }
    else if (action === 'saveDraft' || action === 'stageOperation') await stageCurrent(false);
    else if (action === 'generate' || action === 'process') await stageCurrent(true);
    else if (action === 'assetsPrev' || action === 'assetsNext') {
      state.assetOffset = action === 'assetsPrev' ? Math.max(0, state.assetOffset - 20) : state.assetNext;
      await loadAssets();
    }
    else if (action === 'tasksPrev' || action === 'tasksNext') {
      state.taskOffset = action === 'tasksPrev' ? Math.max(0, state.taskOffset - 20) : state.taskNext;
      await loadTasks();
    }
  } catch (error) {
    toast(error.message, true);
  } finally {
    if (b.isConnected && !state.busy) b.disabled = false;
  }
});

let syncing = false;
const taskPoll = setInterval(async () => {
  if (document.hidden || !state.ready || state.busy || syncing || state.view !== 'tasks' || !ACTIVE.includes(state.taskDetail?.task?.status)) return;
  const id = state.taskId;
  syncing = true;
  try {
    const result = await data('tripo_task_sync', { task_id: id });
    if (!ACTIVE.includes(result.task?.status)) void refreshCredits();
    if (state.view !== 'tasks' || state.taskId !== id) return;
    state.tasks = state.tasks.map(t => t.task_id === id ? result.task : t);
    const detail = await data('tripo_get_task', { task_id: id, include_events: true });
    if (state.view === 'tasks' && state.taskId === id) {
      state.taskDetail = detail;
      renderTasks();
    }
  } catch (e) {
    toast(e.message, true);
  } finally {
    syncing = false;
  }
}, 10000);

const creditPoll = setInterval(() => {
  if (!document.hidden && state.ready && !state.busy) authStatus().catch(() => {});
}, 60000);

window.addEventListener('pagehide', () => {
  clearInterval(taskPoll);
  clearInterval(creditPoll);
  ++paymentEpoch;
  clearTimeout(quoteTimer);
  clearTimeout(assetSearchTimer);
  disposeViewer();
});

(async () => {
  applyTheme();
  renderAssets();
  try {
    if (window.parent === window) throw Error(tr("请从 Codex 的 Tripo 工作台入口打开，此页面需要宿主连接。"));
    await app.connect(new HostInfoTransport(window.parent, info => { hostInfo = info; }), { timeout: 15000 });
    hostContext(app.getHostContext());
    await authStatus();
    state.ready = true;
    document.querySelectorAll('[data-view]').forEach(b => b.disabled = false);
    $('connection').classList.add('hidden');
    await openInput();
  } catch (e) {
    setText($('sessionStatus'), () => tr("未连接"));
    $('creditBalance').classList.add('hidden');
    showConnection(e.message);
  }
})();
