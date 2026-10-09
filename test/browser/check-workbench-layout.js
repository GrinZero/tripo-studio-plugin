// Start i18n-server.mjs after npm run build, then run with:
// playwright-cli run-code --filename test/browser/check-workbench-layout.js
async page => {
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const errors = [];
  let stressParts = false;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/rpc', async route => {
    const call = route.request().postDataJSON();
    const response = await route.fetch(), body = await response.json();
    if (call.name==='tripo_list_tasks') body.structuredContent.tasks[0].remote={project_id:'model'};
    if (call.name==='tripo_get_model') {
      body.structuredContent.project_name='stone stepped platform 3d model '.repeat(12);
      body.structuredContent.parts=stressParts ? ['Head','Body_with_a_very_long_unbroken_name_for_overflow_verification'] : ['Head','Body'];
    }
    await route.fulfill({response,json:body});
  });
  await page.setViewportSize({width:1560,height:820});
  await page.goto('http://127.0.0.1:43911/?locale=zh-CN&layout=1');
  const frame = page.frameLocator('#app');
  await frame.locator('#opFaces').waitFor();
  await frame.locator('#viewerMessage.hidden').waitFor({state:'attached'});
  const dimensions = [[1560,820],[1280,720],[1024,600],[960,720],[680,720],[390,844],[320,640]];
  for (const locale of ['zh-CN','zh-TW','en','ja']) {
    await frame.locator('#language').selectOption(locale);
    await frame.locator('#viewerMessage.hidden').waitFor({state:'attached'});
    for (const [width,height] of dimensions) {
      await page.setViewportSize({width,height});
      await page.waitForFunction(() => document.querySelector('#app').contentDocument.body.clientHeight === innerHeight);
      const result = await frame.locator('html').evaluate(root => {
        const box = node => node.getBoundingClientRect();
        const inspector = document.querySelector('.inspector'), tabs = document.querySelector('.op-tabs');
        const viewport = document.querySelector('#modelViewport'), canvas = viewport.querySelector('canvas');
        return {
          width:innerWidth,height:innerHeight,scrollWidth:root.scrollWidth,scrollHeight:root.scrollHeight,
          inspectorWidth:inspector.clientWidth,inspectorScrollWidth:inspector.scrollWidth,
          inspectorHeight:inspector.clientHeight,inspectorScrollHeight:inspector.scrollHeight,
          tabs:[...tabs.children].map(button => ({width:button.clientWidth,scrollWidth:button.scrollWidth,left:box(button).left,right:box(button).right})),
          tabLeft:box(tabs).left,tabRight:box(tabs).right,
          switchHeight:box(document.querySelector('#opSmart')).height,
          viewportHeight:box(viewport).height,canvasHeight:box(canvas).height,
        };
      });
      const context = `${locale} ${width}x${height}`;
      assert(result.scrollWidth <= width, `${context}: document horizontal overflow`);
      assert(result.scrollHeight <= height, `${context}: document vertical overflow`);
      assert(result.inspectorScrollWidth <= result.inspectorWidth, `${context}: inspector horizontal overflow`);
      assert(result.tabs.every(button => button.scrollWidth <= button.width && button.left >= result.tabLeft && button.right <= result.tabRight), `${context}: tab text outside boundary`);
      assert(result.switchHeight === 22, `${context}: switch stretched by input styles`);
      assert(result.viewportHeight >= 220 && Math.abs(result.viewportHeight-result.canvasHeight) <= 2, `${context}: canvas does not follow viewport`);
      if (width===1560) assert(result.inspectorScrollHeight <= result.inspectorHeight, `${context}: unnecessary desktop inspector scroll`);
      if (locale==='zh-CN' && [1560,390].includes(width)) await page.screenshot({path:`output/playwright/detail-layout-${width}.png`});
      // Bottom actions remain reachable in the actual scroll container.
      await frame.locator('[data-action=process]').scrollIntoViewIfNeeded();
      assert(await frame.locator('[data-action=process]').evaluate(node => {
        const box=node.getBoundingClientRect();return box.top>=0 && box.bottom<=innerHeight;
      }), `${context}: process button unreachable`);
    }
  }
  await page.setViewportSize({width:1280,height:720});
  await page.waitForFunction(() => document.querySelector('#app').contentDocument.documentElement.style.getPropertyValue('--workbench-height') === '720px');
  await page.evaluate(() => window.setHostDimensions({width:1280,maxHeight:600}));
  await page.waitForFunction(() => document.querySelector('#app').contentDocument.body.clientHeight === 600);
  await page.evaluate(() => window.setHostDimensions({width:1280}));
  await page.waitForFunction(() => document.querySelector('#app').contentDocument.body.clientHeight === 720);
  await frame.locator('#language').selectOption('zh-CN');
  await frame.locator('.source-record summary').click();
  await frame.locator('[data-action=projectTasks]').waitFor({state:'visible'});
  await frame.locator('#opFaces').fill('25000');
  await frame.locator('#language').selectOption('en');
  assert(await frame.locator('#opFaces').inputValue()==='25000', 'locale change lost operation settings');
  for (const operation of ['texture','rig','remesh']) {
    await frame.locator(`[data-op=${operation}]`).click();
    await frame.locator('[data-action=process]').scrollIntoViewIfNeeded();
  }
  stressParts = true;
  await frame.locator('#refresh').click();
  await frame.locator('.part-pill').filter({hasText:'Body_with_a_very_long'}).waitFor();
  assert(await frame.locator('.inspector').evaluate(node => node.scrollWidth <= node.clientWidth), 'long part name overflows inspector');
  await page.setViewportSize({width:1560,height:820});
  await frame.locator('#language').selectOption('zh-CN');
  await frame.locator('#viewerMessage.hidden').waitFor({state:'attached'});
  await frame.locator('.quote-credits').waitFor();
  await frame.locator('#appearance').click();
  await frame.locator('#appearance').click();
  await frame.locator('#toast').evaluate(node => node.classList.add('hidden'));
  await page.screenshot({path:'output/playwright/detail-layout-dark.png'});
  await frame.locator('[data-action=export]').click();
  await frame.locator('#confirmDialog').waitFor({state:'visible'});
  await frame.locator('#confirmCancel').click();
  await frame.locator('[data-action=assetsBack]').click();
  assert(!await frame.locator('body').evaluate(node => node.classList.contains('asset-detail-page')), 'detail shell leaked to assets');
  const stats = await (await page.request.get('http://127.0.0.1:43911/stats')).json();
  assert(!stats.calls.some(call=>['tripo_submit_task','tripo_remesh_model','tripo_generate_texture','tripo_rig_model'].includes(call.name)), 'layout check submitted an operation');
  assert(errors.length===0, errors.join('\n'));
  await page.unroute('**/rpc');
  console.log('PASS: 4 locales x 7 viewport sizes; tab bounds, switch, canvas resizing, internal scrolling, host height, history, locale preservation and export dialog.');
}
