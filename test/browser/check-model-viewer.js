// Run model-viewer-server.mjs, then playwright-cli run-code --filename this file.
async page => {
  const assert = (value, message) => { if (!value) throw Error(message); };
  const errors = [], network = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:43921')) network.push(request.url()); });
  await page.setViewportSize({ width: 800, height: 600 });
  for (const source of ['glb', 'textured', 'meshopt', 'fbx']) {
    await page.goto(`http://127.0.0.1:43921/?source=${source}`);
    await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error);
    const state = await page.evaluate(() => ({ error: document.body.dataset.error, loaded: document.querySelector('model-viewer')?.loaded, triangles: window.adapter?.triangles }));
    assert(!state.error && state.loaded, `${source} did not load: ${state.error}`);
    assert(state.triangles === (source === 'fbx' ? 12 : 4), `wrong ${source} geometry count`);
    if (source === 'textured') assert(await page.evaluate(() => { let textured = false; window.scene().model.traverse(o => { if (o.isMesh) textured ||= [].concat(o.material).some(m => m.map?.image?.width === 8); }); return textured; }), 'embedded texture did not load');
    await page.evaluate(() => window.adapter.wireframe(true));
    assert(await page.evaluate(() => { let valid = true; window.scene().model.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) valid &&= m.wireframe; }); return valid; }), 'wireframe toggle failed');
    await page.evaluate(() => { window.adapter.wireframe(false); window.adapter.theme(true); });
    assert(await page.evaluate(() => document.querySelector('model-viewer').style.backgroundColor === 'rgb(12, 14, 22)'), 'theme failed');
    await page.mouse.move(380, 280); await page.mouse.down(); await page.mouse.move(510, 350, { steps: 12 }); await page.mouse.up();
    const moved = await page.evaluate(() => document.querySelector('model-viewer').getCameraOrbit().theta);
    assert(Math.abs(moved - 36 * Math.PI / 180) > .01, 'rotation failed');
    const radius = await page.evaluate(() => document.querySelector('model-viewer').getCameraOrbit().radius);
    await page.mouse.wheel(0, -200);
    await page.waitForFunction(before => Math.abs(document.querySelector('model-viewer').getCameraOrbit().radius - before) > .001, radius);
    await page.evaluate(() => window.adapter.reset());
    assert(await page.evaluate(() => Math.abs(document.querySelector('model-viewer').getCameraOrbit().theta - 36 * Math.PI / 180) < .001), 'reset failed');
    await page.screenshot({ path: `output/playwright/model-viewer-${source}.png` });
    await page.evaluate(() => window.adapter.dispose());
    assert(await page.locator('model-viewer').count() === 0, 'dispose failed');
  }
  assert(errors.length === 0, `browser errors: ${errors.join('; ')}`);
  assert(network.length === 0, 'preview fetched external resources');
  console.log('PASS: model-viewer GLB, embedded textures, decoded Meshopt + FBX conversion; geometry, rotation/zoom/reset, wireframe, theme, disposal and local-only CSP.');
}
