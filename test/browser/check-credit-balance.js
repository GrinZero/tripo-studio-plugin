// After npm run build, start i18n-server.mjs and run with:
// playwright-cli run-code --filename test/browser/check-credit-balance.js
async page => {
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  let authenticated = true, amount = 24180, fail = false, delayed = false, pending;
  await page.route('**/rpc', async route => {
    const { name } = route.request().postDataJSON();
    const send = body => route.fulfill({json:body});
    if (name === 'tripo_auth_status') return send({structuredContent:{session:{authenticated},account_fingerprint:'fixture'}});
    if (name !== 'tripo_get_payment') return route.continue();
    if (delayed) { pending = route; return; }
    return send(fail ? {isError:true,structuredContent:{error:{message:'Payment unavailable'}}} : {structuredContent:{payment:{wallet:{total_credit:amount,expiring_credit:999999}}}});
  });
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://127.0.0.1:43911/?assets=1&locale=zh-CN&theme=dark');
  const frame = page.frameLocator('#app');
  await frame.locator('#creditAmount').filter({hasText:'24,180'}).waitFor();
  await frame.locator('[data-view=assets]:not(:disabled)').waitFor();
  for (const locale of ['zh-CN','zh-TW','en','ja']) {
    await frame.locator('#language').selectOption(locale);
    for (const theme of ['dark','light']) {
      await page.evaluate(theme => window.setHostTheme(theme), theme);
      for (const width of [1440,1024,768,480,320]) {
        await page.setViewportSize({width,height:900});
        const fits = await frame.locator('.appbar').evaluate(header => {
          const nodes = [...header.querySelectorAll('.brand,.tabs,.bar-tools > *')];
          return document.documentElement.scrollWidth <= innerWidth && nodes.every(node => {
            const rect = node.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= header.getBoundingClientRect().bottom;
          });
        });
        assert(fits, `Header overflow: ${locale}/${theme}/${width}`);
      }
    }
  }
  await page.setViewportSize({width:1440,height:900});
  await frame.locator('#language').selectOption('zh-CN');
  await page.evaluate(() => window.setHostTheme('dark'));
  await page.screenshot({path:'output/playwright/credit-balance-dark.png'});
  await page.evaluate(() => window.setHostTheme('light'));
  await page.screenshot({path:'output/playwright/credit-balance-light.png'});
  amount = 0;
  await frame.locator('#refresh').click();
  await frame.locator('#creditAmount').filter({hasText:/^0$/}).waitFor();
  for (const invalid of [null,undefined,-1,'24180']) {
    amount = invalid;
    await frame.locator('#refresh').click();
    await frame.locator('#creditAmount').filter({hasText:'暂不可用'}).waitFor();
  }
  fail = true;
  await frame.locator('#refresh').click();
  await frame.locator('#creditAmount').filter({hasText:'暂不可用'}).waitFor();
  fail = false; amount = 12500;
  await frame.locator('#refresh').click();
  await frame.locator('#creditAmount').filter({hasText:'12,500'}).waitFor();
  delayed = true;
  const paymentRequest = page.waitForRequest(request => request.url().endsWith('/rpc') && request.postDataJSON().name === 'tripo_get_payment');
  await frame.locator('#refresh').click();
  await paymentRequest;
  authenticated = false;
  await frame.locator('#refresh').click();
  await frame.locator('#creditBalance').waitFor({state:'hidden'});
  assert(pending, 'Delayed balance request was not captured');
  await pending.fulfill({json:{structuredContent:{payment:{wallet:{total_credit:999}}}}});
  await page.waitForLoadState('networkidle');
  assert(await frame.locator('#creditBalance').isHidden(), 'Stale payment reappeared after logout');
  const stats = await (await page.request.get('http://127.0.0.1:43911/stats')).json();
  assert(!stats.calls.some(call => /submit|generate|remesh/.test(call.name)), 'Credit display submitted an operation');
  await page.unroute('**/rpc');
  console.log('PASS: credit balance, zero, unavailable, recovery, logout race; 4 locales × 2 themes × 5 widths.');
}
