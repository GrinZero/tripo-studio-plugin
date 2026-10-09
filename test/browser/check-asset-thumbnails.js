// Build, start TRIPO_TEST_PORT=43919 node test/browser/i18n-server.mjs, then:
// playwright-cli run-code --filename test/browser/check-asset-thumbnails.js
async page => {
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const shapes = [[420,420], [210,420], [420,140]];
  const images = shapes.map(([width,height]) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="10" y="10" width="${width-20}" height="${height-20}" rx="12" fill="#adb8c8"/><path d="M10 10L${width-10} ${height-10}M${width-10} 10L10 ${height-10}" stroke="#ff5c35" stroke-width="6"/></svg>`));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/rpc', async route => {
    const call = route.request().postDataJSON();
    if (call.name === 'tripo_ui_asset_library' && call.arguments.action === 'list') return route.fulfill({json:{structuredContent:{
      entries:shapes.map((_,i)=>({entry_type:'asset',project_id:`model-${i}`,name:['方形封面','人物竖图','石台横图'][i],visibility:'private'})),total:3,next_offset:null
    }}});
    if (call.name === 'tripo_ui_preview' && call.arguments.type !== 'model') {
      const index = Number(call.arguments.project_id?.split('-').pop()) || 0;
      return route.fulfill({json:{_meta:{tripo:{preview:{data_url:images[index]}}}}});
    }
    await route.continue();
  });
  await page.goto('http://127.0.0.1:43919/?locale=zh-CN&theme=dark');
  const frame = page.frameLocator('#app');
  await frame.locator('[data-view=assets]').click();
  await frame.locator('.asset-picture img').first().waitFor();
  await frame.locator('[data-action=selectAsset]').first().click();
  
  for (const width of [680,1280,420,320]) {
    await page.setViewportSize({width,height:900});
    for (const layout of ['grid','list']) {
      await frame.locator(`[data-action=${layout}]`).click();
      await frame.locator('.asset-picture img').last().waitFor();
      
      const boxes = await frame.locator('html').evaluate(async () => {
        const imgs = [...document.querySelectorAll('.asset-picture img')];
        await Promise.all(imgs.map(img=>img.decode()));
        return imgs.map(img => {
          const wrap=img.closest('.asset-picture-wrap,.selection-thumb').getBoundingClientRect();
          const box=img.getBoundingClientRect();
          const css=getComputedStyle(img);
          return {wrap:{x:wrap.x,y:wrap.y,width:wrap.width,height:wrap.height},box:{x:box.x,y:box.y,width:box.width,height:box.height},fit:css.objectFit};
        });
      });
      for (const [i,{wrap,box,fit}] of boxes.entries()) {
        const label=`${width}px ${layout} image ${i}: ${JSON.stringify({wrap,box})}`;
        assert(box.x >= wrap.x-1 && box.y >= wrap.y-1 && box.x+box.width <= wrap.x+wrap.width+1 && box.y+box.height <= wrap.y+wrap.height+1, `Clipped thumbnail: ${label}`);
        assert(Math.abs(box.x+box.width/2-wrap.x-wrap.width/2)<=1 && Math.abs(box.y+box.height/2-wrap.y-wrap.height/2)<=1, `Off-center thumbnail: ${label}`);
        assert(fit==='contain', `Thumbnail does not preserve the whole image: ${label}`);
      }
      if(width===680 && layout==='grid') await page.screenshot({path:'output/playwright/asset-thumbnails-fixed.png'});
    }
  }
  assert(errors.length===0,errors.join('\n'));
  await page.unroute('**/rpc');
  console.log('PASS: square, portrait and landscape thumbnails stay centered inside grid/list cards and selection bar at 4 panel widths.');
}
