// Build, start result-preview-server.mjs, then run through playwright-cli.
async page => {
  const base = 'http://127.0.0.1:43922';
  const assert = (value, message) => { if (!value) throw Error(message); };
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1000, height: 1100 });
  const inputCalls = async () => (await (await page.request.get(`${base}/stats`)).json()).calls.filter(call => call.arguments?.input_slot).length;
  const before = await inputCalls();
  await page.goto(`${base}/?card=input-image&locale=zh-CN&theme=dark`);
  const frame = page.frameLocator('#app');
  await frame.locator('.result-input').waitFor();
  await frame.locator('#language').selectOption('zh-CN');
  assert(!await frame.locator('.result-input').evaluate(el => el.open), 'input starts collapsed');
  assert(await inputCalls() === before, 'collapsed input must not request thumbnails');
  assert(await frame.locator('.result-input-excerpt').textContent() === 'concept_threequarter.png', 'image input has a filename preview');
  await frame.locator('.result-input > summary').focus();
  await page.keyboard.press('Enter');
  await frame.locator('.result-input-picture img').waitFor();
  assert(await inputCalls() === before + 1, 'expanding loads the original input once');
  assert(await frame.locator('.result-input-parameters').textContent().then(text => text.includes('30000') && text.includes('4K') && text.includes('关闭')), 'actual settings and disabled options are visible');
  await frame.locator('#language').selectOption('en');
  await frame.locator('.result-input-picture img').waitFor();
  assert(await frame.locator('.result-input').evaluate(el => el.open), 'locale changes preserve expansion');
  assert(await frame.locator('.result-input-label').textContent() === 'Generation input', 'input label is translated');
  await frame.locator('.result-input > summary').click();
  assert(!await frame.locator('.result-input').evaluate(el => el.open), 'input can collapse again');
  await frame.getByRole('button', { name: 'Download locally', exact: true }).click();
  await frame.locator('model-viewer').waitFor();
  await frame.locator('.result-input > summary').click();
  await page.screenshot({ path: 'output/playwright/result-input-image-dark.png', fullPage: true });
  for (const [theme, width] of [['light', 360], ['dark', 1000]]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(`${base}/?card=input-text&locale=zh-CN&theme=${theme}`);
    await frame.locator('.result-input').waitFor();
    await frame.locator('#language').selectOption('zh-CN');
    await frame.locator('.result-input > summary').click();
    const text = await frame.locator('.result-input-prompt').textContent();
    assert(text.length > 300 && text.endsWith('<script>literal input</script>'), 'long prompt is intact and markup stays literal');
    assert(await frame.locator('.result-input-prompt script').count() === 0, 'input markup is not executed');
    assert(await frame.locator('body').evaluate(el => el.scrollWidth <= innerWidth), 'card must fit the viewport');
    assert(await frame.locator('.result-input').evaluate(el => el.scrollWidth <= el.clientWidth), 'expanded input must fit the card');
    await page.screenshot({ path: `output/playwright/result-input-text-${theme}-${width}.png`, fullPage: true });
  }
  assert(errors.length === 0, `browser errors: ${errors.join('; ')}`);
  console.log('PASS: lazy input thumbnails, keyboard toggling, complete literal prompts, settings, translations, retained expansion, dark/light and narrow layouts.');
}
