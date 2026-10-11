// Start i18n-server.mjs with TRIPO_TEST_FBX pointing to a PBR FBX.
async page => {
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1560,height:940});
  await page.goto('http://127.0.0.1:43911/?layout&locale=zh-CN&theme=dark');
  const frame=page.frameLocator('#app');
  await frame.locator('#language').selectOption('zh-CN');
  await frame.locator('#viewerMessage.hidden').waitFor({state:'attached'});
  assert(await frame.locator('model-viewer').evaluate(model=>model.loaded),'asset PBR preview did not load');
  assert((await frame.locator('#viewerMeta').textContent()).includes('FBX'),'asset preview must identify the native FBX');
  assert(await frame.locator('.viewport-cover').count()===0,'failed thumbnail backdrop must not survive the real 3D model');
  await frame.getByRole('button',{name:'线框模式',exact:true}).click();
  await frame.getByRole('button',{name:'材质视图',exact:true}).click();
  await page.screenshot({path:'output/playwright/pbr-asset-workbench.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const box=await frame.locator('model-viewer').boundingBox();
  assert(box.width>100 && box.height>150,'narrow asset PBR preview collapsed');
  assert(errors.length===0,errors.join('; '));
  console.log('PASS: actual PBR FBX in the production asset workbench, format, material/wireframe controls and narrow sizing.');
}
