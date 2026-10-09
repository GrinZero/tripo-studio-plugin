// npm run build; TRIPO_TEST_PORT=43914 node test/browser/i18n-server.mjs
// playwright-cli run-code --filename test/browser/check-asset-groups.js
async page => {
  const base='http://127.0.0.1:43914';
  const assert=(condition,message)=>{if(!condition)throw Error(message);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.request.get(`${base}/grouped-assets`);
  await page.setViewportSize({width:1280,height:900});
  await page.goto(`${base}/?locale=zh-CN`);
  const frame=page.frameLocator('#app');
  await frame.locator('[data-view=assets]').click();
  await frame.locator('.asset-card').first().waitFor();
  assert(await frame.locator('[data-action=toggleMultiSelect]').count()===0,'card selection must not require a mode switch');
  assert(await frame.locator('.asset-card').count()===3,'root must contain two group cards and one loose model');
  assert(await frame.locator('.group-card').count()===2,'groups must be cards');
  assert(await frame.locator('[data-action=selectAsset]').count()===1,'group members leaked into the main grid');
  assert(await frame.locator('[data-action=openGroup][data-id=paimon] .group-cover-count').innerText()==='22','group count is not the entire group');
  await frame.locator('[data-action=openGroup][data-id=paimon]').click();
  await frame.locator('[data-action=selectAsset][data-id=model-0]').waitFor();
  assert(await frame.locator('.group-card').count()===0,'group detail must show actual members');
  assert(await frame.locator('.asset-card').count()===20,'member pagination failed');
  for(const id of ['model-0','model-2'])await frame.locator(`[data-action=selectAsset][data-id=${id}]`).click();
  await frame.locator('[data-action=assetsNext]').click();
  await frame.locator('[data-action=selectAsset][data-id=model-40]').waitFor();
  await frame.locator('[data-action=selectAsset][data-id=model-40]').click();
  assert((await frame.locator('.multi-selectionbar h3').innerText()).includes('3'),'cross-page selection was lost');
  await frame.locator('[data-action=createAssetGroup]').click();
  const name='创作组 <A>';
  await frame.locator('#assetGroupName').fill(name);
  await frame.locator('#language').selectOption('en');
  assert(await frame.locator('#assetGroupName').inputValue()===name,'locale change lost group name');
  await frame.locator('#assetGroupName').fill(name+' test');
  assert(await frame.locator('#confirmSubmit').isEnabled(),'locale change disconnected name validation');
  await frame.locator('#assetGroupName').fill(name);
  await frame.locator('#confirmSubmit').click();
  const groupButton=frame.locator('[data-action=openGroup]').filter({hasText:name});
  await groupButton.waitFor();
  const groupId=await groupButton.getAttribute('data-id');
  assert(await groupButton.locator('.group-cover-count').innerText()==='3','manual group count is wrong');
  assert(await frame.locator('.group-card').count()===3,'new group card missing');
  for(const id of ['model-0','model-2','model-40'])assert(await frame.locator(`[data-action=selectAsset][data-id=${id}]`).count()===0,'manually grouped model leaked into root');
  await frame.locator('#language').selectOption('zh-CN');
  await page.waitForFunction(()=>[...document.querySelector('#app').contentDocument.querySelectorAll('.group-card img')].every(img=>img.complete&&img.naturalWidth>0));
  await page.screenshot({path:'output/playwright/asset-group-cards.png',fullPage:true});
  await groupButton.click();
  await frame.locator('[data-action=selectAsset][data-id=model-0]').waitFor();
  assert(await frame.locator('.asset-card').count()===3,'created group must contain all selected models');
  await page.screenshot({path:'output/playwright/asset-group-members.png',fullPage:true});
  await frame.locator('[data-action=groupsBack]').click();
  await groupButton.waitFor();
  await page.reload();
  await frame.locator('[data-view=assets]').click();
  await groupButton.waitFor();
  assert(await groupButton.locator('.group-cover-count').innerText()==='3','group did not survive reopening');
  // Images use the same grouping controls and may join a group created for models.
  await frame.locator('[data-action=setAssetType][data-type=images]').click();
  await frame.locator('[data-action=selectAsset][data-id=image-2]').waitFor();
  await frame.locator('[data-action=selectAsset][data-id=image-2]').click();
  await frame.locator('[data-action=joinAssetGroup]').click();
  await frame.locator('#assetGroupTarget').selectOption(groupId);
  await frame.locator('#confirmSubmit').click();
  await groupButton.waitFor();
  assert(await groupButton.locator('.group-cover-count').innerText()==='1','image group count is wrong');
  assert(await frame.locator('[data-action=selectAsset][data-id=image-2]').count()===0,'grouped image leaked into root');
  // Check root and member grids, plus the actual multi-selection action bar.
  for(const locale of ['zh-CN','zh-TW','en','ja']) {
    await frame.locator('#language').selectOption(locale);
    for(const layout of ['grid','list']) {
      await frame.locator(`[data-action=${layout}]`).click();
      for(const width of [1280,680,420,320]) {
        await page.setViewportSize({width,height:900});
        const size=await frame.locator('html').evaluate(node=>({width:innerWidth,scroll:node.scrollWidth}));
        assert(size.scroll<=size.width,`${locale} ${layout} ${width}: root horizontal overflow (${size.scroll})`);
      }
    }
  }
  await frame.locator('#language').selectOption('zh-CN');
  await frame.locator('[data-action=setAssetType][data-type=models]').click();
  await groupButton.waitFor();
  await groupButton.click();
  await frame.locator('[data-action=selectPageAssets]').click();
  for(const width of [1280,420,320]) {
    await page.setViewportSize({width,height:900});
    assert(await frame.locator('html').evaluate(node=>node.scrollWidth<=innerWidth),`multi-selection overflows at ${width}`);
    await frame.locator('[data-action=createAssetGroup]').scrollIntoViewIfNeeded();
    assert(await frame.locator('[data-action=createAssetGroup]').evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),'group action is inaccessible');
  }
  await page.setViewportSize({width:1280,height:900});
  await frame.locator('[data-action=removeFromGroup]').click();
  await page.waitForFunction(()=>document.querySelector('#app').contentDocument.querySelectorAll('.asset-card').length===0);
  await frame.locator('[data-action=groupsBack]').first().click();
  await frame.locator('[data-action=selectAsset][data-id=model-0]').waitFor();
  assert(await groupButton.count()===0,'empty group left a ghost model card');
  await frame.locator('[data-view=tasks]').click();
  await frame.locator('.task-row').waitFor();
  assert(await frame.locator('.group-card,.asset-group,#taskGroupFilter').count()===0,'asset grouping appeared on task page');
  const {calls}=await (await page.request.get(`${base}/stats`)).json();
  const writes=calls.filter(c=>c.name==='tripo_ui_asset_library'&&c.arguments.action==='assign');
  assert(writes.length===3,'expected create, join and remove membership writes');
  assert(writes[0].arguments.assets.length===3,'creation did not include cross-page selections');
  assert(!calls.some(c=>['tripo_submit_task','tripo_generate_model','tripo_set_task_character'].includes(c.name)),'grouping submitted task operations');
  assert(errors.length===0,errors.join('\n'));
  return {passed:true,checks:'group cards hide members; full counts; cross-page multi-select; create/join/remove; persistence; images; 4 locales, 2 layouts and narrow panels; flat task page',screenshots:['asset-group-cards.png','asset-group-members.png']};
}
