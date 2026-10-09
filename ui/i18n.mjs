import zhCN from './locales/zh-CN.mjs';
import zhTW from './locales/zh-TW.mjs';
import en from './locales/en.mjs';
import ja from './locales/ja.mjs';

export const catalogs = Object.freeze({ 'zh-CN': Object.freeze(zhCN), 'zh-TW': Object.freeze(zhTW), en: Object.freeze(en), ja: Object.freeze(ja) });
export const languages = Object.freeze({ 'zh-CN': '简体中文', 'zh-TW': '繁體中文', en: 'English', ja: '日本語' });
const storageKey = 'tripo.language';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function normalizeLocale(value) {
  if (typeof value !== 'string') return null;
  const parts = value.trim().replaceAll('_', '-').toLowerCase().split('-');
  if (parts[0] === 'en' || parts[0] === 'ja') return parts[0];
  if (parts[0] !== 'zh') return null;
  // An explicit script takes precedence over region (e.g. zh-Hans-TW).
  if (parts.includes('hant')) return 'zh-TW';
  if (parts.includes('hans')) return 'zh-CN';
  return parts.some(part => ['tw', 'hk', 'mo'].includes(part)) ? 'zh-TW' : 'zh-CN';
}

export function resolveLocale({ preference = 'system', hostLocale, browserLocales = [] } = {}) {
  if (Object.hasOwn(languages, preference)) return preference;
  return normalizeLocale(hostLocale) ?? browserLocales.map(normalizeLocale).find(Boolean) ?? 'en';
}

function interpolate(message, values) {
  // A replacement callback keeps literal $, braces and markup in user data intact.
  return message.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key] ?? '') : match);
}

export function createI18n(options = {}) {
  let settings = { ...options }, locale = resolveLocale(settings);
  const before = new Set(), after = new Set();
  const message = key => Object.hasOwn(catalogs[locale], key) ? catalogs[locale][key] : Object.hasOwn(zhCN, key) ? zhCN[key] : String(key);
  return {
    get locale() { return locale; },
    get preference() { return settings.preference ?? 'system'; },
    update(next) {
      const nextSettings = { ...settings, ...next }, nextLocale = resolveLocale(nextSettings);
      if (nextLocale !== locale) for (const callback of before) callback(nextLocale);
      settings = nextSettings;
      if (nextLocale === locale) return false;
      locale = nextLocale;
      for (const callback of after) callback(locale);
      return true;
    },
    subscribe(callback, beforeChange = false) {
      const listeners = beforeChange ? before : after;
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    t(key, values = {}) { return interpolate(message(key), values); },
    html(key, values = {}) { return interpolate(escape(message(key)), values); },
    number(value, options) { return new Intl.NumberFormat(locale, options).format(value); },
    date(value, options) { return new Intl.DateTimeFormat(locale, options).format(new Date(value)); }
  };
}

// Pure model helpers keep their historical Chinese default outside a browser.
// Browser entrypoints initialize with persisted, host and navigator preferences.
const current = createI18n({ preference: 'zh-CN' });
export const t = (key, values) => current.t(key, values);
// HTML interpolation values have already been escaped by the calling template.
export const th = (key, values) => current.html(key, values);
export const getLocale = () => current.locale;
export const formatNumber = (value, options) => current.number(value, options);
export const formatDate = (value, options) => current.date(value, options);
export const onLocaleChange = (callback, beforeChange = false) => current.subscribe(callback, beforeChange);

export function localizedMap(values) {
  return Object.freeze(Object.defineProperties({}, Object.fromEntries(Object.entries(values).map(([key, value]) =>
    [key, { enumerable: true, get: () => typeof value === 'string' ? t(value) : value }]))));
}

const bindings = new Map();
const attributes = new Map();
let pruneScheduled = false;
function pruneBindings() {
  if (pruneScheduled) return;
  pruneScheduled = true;
  queueMicrotask(() => {
    for (const records of [bindings, attributes]) for (const node of records.keys()) if (!node.isConnected) records.delete(node);
    pruneScheduled = false;
  });
}

export function setAttributeText(node, attribute, value) {
  if (!attributes.has(node)) attributes.set(node, new Map());
  attributes.get(node).set(attribute, value);
  node.setAttribute(attribute, value());
  pruneBindings();
}

export function setText(node, value) {
  if (!node) return;
  const text = String(value() ?? '');
  bindings.set(node, { value, text });
  node.textContent = text;
  pruneBindings();
}

export function localizeStatic(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const attribute of ['title', 'aria-label', 'placeholder', 'alt']) {
    for (const node of root.querySelectorAll(`[data-i18n-${attribute}]`)) node.setAttribute(attribute, t(node.getAttribute(`data-i18n-${attribute}`)));
  }
  document.documentElement.lang = getLocale();
}

let initialized = false;
export function initializeI18n() {
  let preference = 'system';
  try { preference = localStorage.getItem(storageKey) ?? 'system'; } catch {}
  if (preference !== 'system' && !Object.hasOwn(languages, preference)) preference = 'system';
  current.update({ preference, browserLocales: navigator.languages?.length ? [...navigator.languages] : [navigator.language] });
  localizeStatic();
  if (initialized) return;
  initialized = true;
  current.subscribe(() => {
    localizeStatic();
    for (const [node, binding] of bindings) {
      // A loading placeholder may have been replaced by an image or a 3D canvas.
      if (!node.isConnected || node.childElementCount || node.textContent !== binding.text) { bindings.delete(node); continue; }
      binding.text = String(binding.value() ?? '');
      node.textContent = binding.text;
    }
    for (const [node, records] of attributes) {
      if (!node.isConnected) { attributes.delete(node); continue; }
      for (const [attribute, value] of records) node.setAttribute(attribute, value());
    }
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    const preference = event.key === null ? 'system' : event.newValue ?? 'system';
    current.update({ preference: Object.hasOwn(languages, preference) ? preference : 'system' });
    syncSelectors();
  });
  window.addEventListener('languagechange', () => current.update({ browserLocales: [...navigator.languages] }));
}

export function setHostLocale(locale) {
  if (typeof locale === 'string') current.update({ hostLocale: locale });
}

export function setLanguagePreference(preference) {
  if (preference !== 'system' && !Object.hasOwn(languages, preference)) throw Error(`Unsupported UI language: ${preference}`);
  current.update({ preference });
  try { localStorage.setItem(storageKey, preference); } catch {}
  syncSelectors();
}

function syncSelectors() {
  for (const selector of document.querySelectorAll('[data-language-selector]')) selector.value = current.preference;
}

export function mountLanguageSelector(selector) {
  selector.dataset.languageSelector = '';
  selector.setAttribute('data-i18n-aria-label', '语言');
  const system = document.createElement('option');
  system.value = 'system'; system.dataset.i18n = '跟随宿主 / 浏览器'; selector.append(system);
  for (const [value, label] of Object.entries(languages)) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; selector.append(option);
  }
  selector.value = current.preference;
  selector.onchange = () => setLanguagePreference(selector.value);
  localizeStatic();
}
