import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { modelCard } from '../src/ui/asset-library.mjs';
import * as model from '../ui/model.mjs';
import { t as tr, th } from '../ui/i18n.mjs';
import { modelGenerationMetadata } from '../src/studio/model-metadata.mjs';

// Exercise the actual workbench renderer with the public library card. The
// surrounding App bridge and DOM are unrelated to the version badge.
const source = await readFile(new URL('../ui/workbench.mjs', import.meta.url), 'utf8');
const renderer = source.slice(source.indexOf('function renderAssetCard('), source.indexOf('function renderGroupCard('));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(asset) {
  const context = vm.createContext({
    ...model, tr, th, esc, state: {assetType:'models',selectedAssets:new Map()},
    previewPlaceholder: () => '', icon: () => '', button: () => ''
  });
  vm.runInContext(renderer, context);
  return context.renderAssetCard(modelCard(asset));
}

it('renders P2.0 from the real generate/operator shape rather than the H3.1 fallback', () => {
  const html = render({id:'bamboo',type:'generate',operator:{model_version:'Nexus-v2.0-20260801',is_nexus_mesh:true,type:'text_to_model'}});
  assert.match(html, /badge-blue[^>]*>P2\.0<\/span>/);
});

it('uses original generation settings after texturing and distinguishes P1.0 from P2.0', () => {
  assert.match(render({id:'textured',type:'generate',operator:{model_version:'v3.5-20260815',type:'texture_generation',is_nexus_mesh:true,text_to_model:{model_version:'Nexus-v2.0-20260801'}}}), />P2\.0<\/span>/);
  assert.match(render({id:'ship',type:'generate',operator:{model_version:'Nexus-v1.0-20260214',is_nexus_mesh:true}}), />P1\.0<\/span>/);
});

it('does not label imports, missing versions, or post-operation versions as H3.1', () => {
  for (const asset of [
    {id:'import',type:'upload',operator:{model_version:'default',type:'rigging'}},
    {id:'unknown',type:'generate'},
    {id:'textured-unknown',type:'generate',operator:{model_version:'v3.5-20260815',type:'texture_generation',is_nexus_mesh:true}}
  ]) assert.doesNotMatch(render(asset), />H3\.1<\/span>/);
});

it('keeps actual High Detail versions distinct', () => {
  for (const [version,label] of [['v3.1-20260211','H3.1'],['v3.0-20250812','H3.0'],['v2.5-20250123','H2.5']]) {
    assert.ok(render({id:label,type:'generate',operator:{model_version:version,is_nexus_mesh:false}}).includes(`>${label}</span>`));
  }
});

it('reads retained versions for every generation input and ignores newer operation versions', () => {
  for (const key of ['text_to_model','image_to_model','image_prompt_to_model','multiview_to_model','batch_image_to_model']) {
    const card = modelCard({id:key,type:'generate',operator:{type:'rigging',model_version:'v3.0-20260909',[key]:{model_version:'Nexus-v2.0-20260801'}}});
    assert.equal(card.model_version,'Nexus-v2.0-20260801');
    assert.equal(card.is_nexus_mesh,true);
    assert.equal(model.modelBadge(card).label,'P2.0');
  }
  assert.deepEqual(modelGenerationMetadata({operator:{type:'texture_generation',model_version:'v3.0-20250812'}}),{model_version:null,is_nexus_mesh:null});
  assert.equal(model.modelBadge(modelCard({id:'nexus',operator:{is_nexus_mesh:true}})).label,'Smart Mesh');
  assert.equal(model.modelBadge(modelCard({id:'unknown',operator:{type:'text_to_model',model_version:'v9.0-future'}})).label,'3D 模型');
});
