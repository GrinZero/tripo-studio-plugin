import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import { McpUiInitializeResultSchema } from '@modelcontextprotocol/ext-apps';
const params = new URLSearchParams(location.search), iframe = document.getElementById('app');
const context = () => ({locale:params.get('locale') ?? 'ja-JP',theme:params.get('theme') ?? 'light',displayMode:'inline',availableDisplayModes:['inline','fullscreen'], ...(params.get('codex') === 'normalized' ? {userAgent:'chatgpt',platform:'desktop','openai/interactionCursor':'default'} : {}), ...(params.has('layout') || params.has('assets') ? {containerDimensions:{width:innerWidth,height:innerHeight}} : {})});
const codexInfo = {name:'chatgpt',version:'1',client_type:'codex_desktop'};
const normalizedInfo = McpUiInitializeResultSchema.parse({protocolVersion:'2026-01-26',hostCapabilities:{},hostContext:context(),hostInfo:codexInfo}).hostInfo;
const bridge = new AppBridge(null, params.has('codex') ? params.get('codex') === 'normalized' ? normalizedInfo : codexInfo : {name:'I18n test host',version:'1'}, {serverTools:{},logging:{}}, {
  hostContext: context()
});
window.appSizes = [];
bridge.onsizechange = size => window.appSizes.push(size);
bridge.oncalltool = async call => (await fetch('/rpc', {method:'POST',body:JSON.stringify(call)})).json();
bridge.onloggingmessage = () => {};
bridge.oninitialized = async () => {
  await bridge.sendToolInput({arguments:params.has('layout') ? {view:'assets',project_id:'model'} : params.has('assets') ? {view:'assets'} : {view:'create'}});
  if (params.get('card')) await bridge.sendToolResult(await (await fetch(`/result?kind=${params.get('card')}`)).json());
};
window.setHostLocale = locale => bridge.setHostContext({locale,theme:'light',displayMode:'inline',availableDisplayModes:['inline','fullscreen']});
window.setHostDimensions = containerDimensions => bridge.setHostContext({containerDimensions});
window.setHostSafeArea = bottom => bridge.setHostContext({safeAreaInsets:{top:0,right:0,bottom,left:0}});
window.setHostTheme = theme => bridge.setHostContext({theme});
if (params.has('layout') || params.has('assets')) window.addEventListener('resize', () => bridge.setHostContext(context()));
await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow));
iframe.src = params.get('card') ? '/card' : '/workbench';
