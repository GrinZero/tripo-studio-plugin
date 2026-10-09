// Build, start node test/browser/i18n-server.mjs, then:
// playwright-cli run-code --filename test/browser/check-configuration-visibility.js
async page => {
  const base = 'http://127.0.0.1:43911';
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('about:blank');
  await page.request.get(`${base}/reset`);
  await page.route(`${base}/?**`, async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('<iframe id="app"', '<style id="hide-card">#app{display:none!important}</style><iframe id="app"');
    await route.fulfill({response,body});
  });
  await page.goto(`${base}/?card=configuration&locale=zh-CN`);
  const frame = page.frameLocator('#app');
  await frame.locator('.configuration').waitFor({state:'attached'});
  await frame.locator('.source-picture img').first().waitFor({state:'attached'});
  const hidden = await (await page.request.get(`${base}/stats`)).json();
  assert(hidden.review.deadline_at === null, 'hidden mounted card must not start a deadline');
  assert(!hidden.calls.some(call => call.arguments?.action === 'ready'), 'hidden card must not acknowledge visibility');
  await page.locator('#hide-card').evaluate(element => element.remove());
  await frame.locator('.config-notice').filter({hasText:/\d+ 秒后自动提交/}).waitFor();
  const shown = await (await page.request.get(`${base}/stats`)).json();
  assert(shown.review.deadline_at - Date.now() > 55000, 'displayed card must have a full edit window');
  assert(shown.calls.filter(call => call.arguments?.action === 'ready').length === 1, 'display must acknowledge once');
  await frame.getByRole('spinbutton', {name:'目标面数'}).fill('24000');
  await frame.locator('.countdown-helper').filter({hasText:'自动提交已暂停'}).waitFor();
  const edited = await (await page.request.get(`${base}/stats`)).json();
  assert(edited.review.status === 'editing' && edited.review.deadline_at === null, 'editing must pause server submission');
  await frame.getByRole('button', {name:'保存并更新报价',exact:true}).click();
  await frame.locator('.config-notice').filter({hasText:/\d+ 秒后自动提交/}).waitFor();
  const saved = await (await page.request.get(`${base}/stats`)).json();
  assert(saved.review.input.face_limit === 24000, 'save must preserve the user selection');
  assert(saved.review.deadline_at - Date.now() > 55000, 'displayed saved card must restart a full edit window');
  assert(saved.calls.filter(call => call.arguments?.action === 'ready').length === 2, 'saved card must acknowledge the updated display');
  assert(errors.length === 0, errors.join('\n'));
  console.log('PASS: hidden mount waits, displayed card gets 60 seconds, edit pauses, save restarts after display.');
}
