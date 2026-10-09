// TRIPO_TEST_PORT=43914 node test/browser/i18n-server.mjs after npm run build.
// playwright-cli run-code --filename test/browser/check-selectionbar-layout.js
async page => {
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/rpc', async route => {
    const call = route.request().postDataJSON();
    assert(!['tripo_submit_task','tripo_download_artifact','tripo_export_model'].includes(call.name), 'unexpected write');
    const response = await route.fetch(), body = await response.json();
    if (call.name === 'tripo_ui_asset_library' && call.arguments.action === 'list') {
      body.structuredContent = {entries:Array.from({length:20}, (_,i) => ({entry_type:'asset',project_id:`model-${i}`,name:'stone stepped platform 3d model '.repeat(10),visibility:'private'})),total:20,next_offset:null};
    }
    await route.fulfill({response,json:body});
  });
  const frame = page.frameLocator('#app');
  const settle = () => frame.locator('html').evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  let checks = 0;
  for (const host of ['normalized','raw','other']) {
    const codex = host !== 'other';
    await page.setViewportSize({width:1560,height:820});
    await page.goto(`http://127.0.0.1:43914/?locale=zh-CN&theme=dark&layout=1${codex?`&codex=${host}`:''}`);
    await frame.locator('[data-action=assetsBack]').click();
    await frame.locator('[data-action=selectAsset]').first().click();
    await frame.locator('.selectionbar').waitFor();
    assert(await frame.locator('html').getAttribute('data-host')===(codex?'codex':'other'), 'wrong host detection, including SDK client_type preservation');
    if (codex) await page.evaluate(() => {
      const composer = document.createElement('div');
      composer.id = 'mockComposer';
      composer.textContent = '＋　随心输入';
      composer.style.cssText = 'position:fixed;right:16px;bottom:16px;width:min(560px,calc(100% - 32px));height:44px;border-radius:28px;background:#333;color:#999;padding:12px 20px;box-sizing:border-box;font:14px system-ui;z-index:999';
      document.body.append(composer);
    });
    for (const locale of ['zh-CN','en']) {
      await frame.locator('#language').selectOption(locale);
      for (const [width,height] of [[1560,820],[1100,720],[1024,600],[680,720],[390,844],[320,640]]) {
        await page.setViewportSize({width,height});
        for (const bottom of codex?[60,180]:[0]) {
          await page.evaluate(value => {
            window.setHostSafeArea(value);
            const composer = document.getElementById('mockComposer');
            if (composer) composer.style.height = `${value-16}px`;
          }, bottom);
          await frame.locator('html').evaluate((root,value) => new Promise(resolve => {
            const check = () => root.style.getPropertyValue('--host-safe-bottom')===`${value}px` ? resolve() : requestAnimationFrame(check);
            check();
          }), bottom);
          for (const end of [false,true]) {
            await frame.locator('html').evaluate((root,{codex,end}) => {
              const scroll = codex?document.getElementById('main'):document.scrollingElement;
              scroll.scrollTop = end?scroll.scrollHeight:scroll.scrollHeight/2;
            }, {codex,end});
            await settle();
            const result = await frame.locator('.selectionbar').evaluate(bar => {
              const box = node => {const b=node.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};
              const main = document.getElementById('main'), styles = getComputedStyle(main);
              return {bar:box(bar),main:box(main),paddingLeft:parseFloat(styles.paddingLeft),paddingRight:parseFloat(styles.paddingRight),height:innerHeight,documentHeight:document.documentElement.scrollHeight,bodyHeight:document.body.clientHeight,overflow:bar.scrollWidth>bar.clientWidth,buttons:[...bar.querySelectorAll('button')].map(box),title:bar.querySelector('h3').innerText};
            });
            const context = `${codex?'Codex':'other'} ${locale} ${width}x${height}, inset ${bottom}, end ${end}`;
            assert(result.bar.top>=0 && result.bar.bottom<=height, `${context}: bar outside viewport`);
            assert(result.bar.left>=0 && result.bar.right<=width && !result.overflow, `${context}: bar overflow`);
            assert(result.buttons.every(b=>b.left>=result.bar.left && b.right<=result.bar.right && b.top>=result.bar.top && b.bottom<=result.bar.bottom), `${context}: clipped button`);
            
            if (codex) {
              const composer = await page.locator('#mockComposer').boundingBox();
              assert(result.documentHeight<=height && result.bodyHeight===height, `${context}: workbench does not match host height`);
              if (width>=1100) {
                assert(result.bar.right<=composer.x-12 && Math.abs(result.bar.bottom-composer.y-composer.height)<1, `${context}: bar is not beside/bottom-aligned with composer`);
              } else assert(result.bar.bottom<=composer.y-16, `${context}: narrow bar overlaps composer`);
            } else {
              assert(Math.abs(result.bar.left-result.main.left-result.paddingLeft)<1 && Math.abs(result.bar.right-result.main.right+result.paddingRight)<1, `${context}: standard bar does not fill page width`);
            }
            checks++;
          }
        }
      }
    }
    await page.setViewportSize({width:1560,height:820});
    await page.evaluate(codex => {
      window.setHostSafeArea(codex?60:0);
      const composer = document.getElementById('mockComposer');
      if (composer) composer.style.height = '44px';
    }, codex);
    await frame.locator('#language').selectOption('zh-CN');
    await settle();
    await page.screenshot({path:`output/playwright/selectionbar-${host==='other'?'standard':`codex-${host}`}.png`});
    if (codex) {
      await page.setViewportSize({width:390,height:844});
      await settle();
      await page.screenshot({path:'output/playwright/selectionbar-mobile.png'});
    }
    await frame.locator('[data-action=clearSelection]').click();
    assert(await frame.locator('.selectionbar').count()===0, 'cancel selection failed');
    await frame.locator('[data-action=selectAsset]').first().click();
    await frame.locator('.selectionbar [data-action=assetDetail]').click();
    await frame.locator('#modelViewport').waitFor();
    assert(await frame.locator('.selectionbar').count()===0, 'selectionbar leaked to detail');
  }
  assert(errors.length===0,errors.join('\n'));
  await page.unroute('**/rpc');
  return {passed:checks,coverage:'Codex/native client_type detection, host height, side-by-side alignment, narrow fallback, standard full width, safe-area updates, long names, cancel/detail navigation'};
}
