import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { catalogs, createI18n, languages, normalizeLocale, resolveLocale } from '../ui/i18n.mjs';

it('resolves supported scripts and regions with explicit preference before host and browser', () => {
  for (const [input, expected] of [
    ['zh', 'zh-CN'], ['zh_CN', 'zh-CN'], ['zh-SG', 'zh-CN'], ['zh-TW', 'zh-TW'],
    ['zh-HK', 'zh-TW'], ['zh-MO', 'zh-TW'], ['zh-Hant-CN', 'zh-TW'], ['zh-Hans-TW', 'zh-CN'],
    ['en-GB', 'en'], ['ja-JP', 'ja'], ['fr-FR', null], ['', null], [undefined, null]
  ]) assert.equal(normalizeLocale(input), expected, input);
  assert.equal(resolveLocale({ preference: 'ja', hostLocale: 'zh-CN', browserLocales: ['en-US'] }), 'ja');
  assert.equal(resolveLocale({ hostLocale: 'zh-HK', browserLocales: ['en-US'] }), 'zh-TW');
  assert.equal(resolveLocale({ hostLocale: 'fr-FR', browserLocales: ['de-DE', 'ja-JP'] }), 'ja');
  assert.equal(resolveLocale({ browserLocales: ['fr-FR'] }), 'en');
});

it('updates system preferences without overriding a manual choice and notifies only for effective changes', () => {
  const i18n = createI18n({ browserLocales: ['en-US'] }), changes = [];
  const offBefore = i18n.subscribe(next => changes.push(`before:${i18n.locale}:${next}`), true);
  const offAfter = i18n.subscribe(next => changes.push(`after:${i18n.locale}:${next}`));
  i18n.update({ hostLocale: 'ja-JP' });
  assert.deepEqual(changes, ['before:en:ja', 'after:ja:ja']);
  i18n.update({ preference: 'zh-CN' });
  changes.length = 0;
  assert.equal(i18n.update({ hostLocale: 'zh-TW' }), false);
  assert.equal(i18n.locale, 'zh-CN');
  assert.equal(i18n.update({ preference: 'system' }), true);
  assert.equal(i18n.locale, 'zh-TW');
  offBefore(); offAfter(); changes.length = 0;
  i18n.update({ hostLocale: 'en-US' });
  assert.deepEqual(changes, []);
});

it('provides complete catalogs with matching interpolation parameters for all four languages', () => {
  const source = catalogs['zh-CN'], keys = Object.keys(source).sort();
  const parameters = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const locale of Object.keys(languages)) {
    assert.deepEqual(Object.keys(catalogs[locale]).sort(), keys, locale);
    for (const key of keys) {
      assert.equal(typeof catalogs[locale][key], 'string', `${locale}: ${key}`);
      assert.ok(catalogs[locale][key].length > 0, `${locale}: ${key}`);
      assert.deepEqual(parameters(catalogs[locale][key]), parameters(source[key]), `${locale}: ${key}`);
    }
  }
});

it('keeps variable content intact, formats values by locale, and falls back for unknown messages', () => {
  const en = createI18n({ preference: 'en' });
  const content = '派蒙 $& ${prompt} <script> & 日本語 /assets/角色.glb';
  assert.equal(en.t('选择 {0}', { 0: content }), `Select ${content}`);
  assert.equal(en.t('未知的新消息 {0}', { 0: content }), `未知的新消息 ${content}`);
  assert.equal(en.t('第 {0} 页'), 'Page {0}');
  assert.equal(en.t('constructor'), 'constructor');
  assert.equal(en.number(12345), new Intl.NumberFormat('en').format(12345));
  const ja = createI18n({ preference: 'ja' }), date = '2026-10-09T12:34:00Z';
  assert.equal(ja.date(date, { timeZone: 'UTC', dateStyle: 'short' }), new Intl.DateTimeFormat('ja', { timeZone: 'UTC', dateStyle: 'short' }).format(new Date(date)));
  assert.equal(ja.t('确认提交'), '送信を確認');
  assert.equal(en.html('检查本次设置，确认后开始处理。'), 'Review these settings, then confirm to start processing.');
  assert.equal(en.html('共 {0} 项功能 · 具体费用以操作报价为准', { 0: 28 }), '28 features · Check each operation&#39;s estimate for costs');
});

it('includes every explicit UI message and static accessibility marker in the source catalog', async () => {
  const names = ['workbench.mjs', 'workbench.html', 'result-card.mjs', 'result-card.html', 'model.mjs', 'card-model.mjs', 'configuration-card.mjs', 'quote-card.mjs', 'quote-model.mjs', 'viewer.mjs'];
  const sources = await Promise.all(names.map(name => readFile(new URL(`../ui/${name}`, import.meta.url), 'utf8')));
  for (let index = 0; index < sources.length; index++) {
    const patterns = [/\b(?:tr|th)\("([^"\n]+)"/g, /\b(?:tr|th)\('([^'\n]+)'/g, /data-i18n(?:-aria-label|-title|-placeholder)?="([^"]+)"/g];
    for (const pattern of patterns) for (const match of sources[index].matchAll(pattern)) {
      assert.ok(Object.hasOwn(catalogs['zh-CN'], match[1]), `${names[index]}: ${match[1]}`);
    }
  }
});
