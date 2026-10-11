// Build, start result-preview-server.mjs, then run through playwright-cli.
async page => {
  const base = 'http://127.0.0.1:43922';
  const assert = (value, message) => { if (!value) throw Error(message); };
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/?card=saved-preview&locale=zh-CN&theme=dark`);
  const frame = page.frameLocator('#app');
  await frame.getByText('fetch failed', { exact: true }).waitFor();
  assert(await frame.locator('#status').textContent() === '已完成', 'completed task must update the header');
  assert(!await frame.locator('#message').textContent().then(text => text.includes('任务已提交')), 'completed task must not retain submitted instructions');
  await frame.getByRole('button', { name: '下载到本地', exact: true }).click();
  await frame.getByText('已保存到本地', { exact: true }).waitFor();
  await frame.locator('model-viewer').waitFor();
  const child = page.frames().find(f => f.url().endsWith('/card'));
  await child.waitForFunction(() => document.querySelector('model-viewer')?.loaded);
  assert(await frame.getByText('fetch failed', { exact: true }).count() === 0, 'download must recover the failed preview');
  const stats = await (await page.request.get(`${base}/stats`)).json();
  assert(stats.calls.some(call => call.name === 'tripo_ui_preview' && call.arguments?.local_path?.endsWith('textured.fbx')), 'card must load the saved artifact');
  await page.screenshot({ path: 'output/playwright/result-preview-recovered.png', fullPage: true });
  await page.reload();
  await frame.locator('model-viewer').waitFor();
  const reopened = page.frames().find(f => f.url().endsWith('/card'));
  await reopened.waitForFunction(() => document.querySelector('model-viewer')?.loaded);
  assert(await frame.getByText('fetch failed', { exact: true }).count() === 0, 'reopening must load recorded local downloads without the cloud');
  assert(errors.length === 0, `browser errors: ${errors.join('; ')}`);
  console.log('PASS: completed header, cloud failure recovery after download, and saved FBX on reopen.');
}
