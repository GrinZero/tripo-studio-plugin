import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the workbench's actual theme handlers, including the SDK's inline
// color-scheme side effect, without a live Studio account.
const source = await readFile(new URL('../ui/workbench.mjs', import.meta.url), 'utf8');
const handlers = source.slice(source.indexOf('function isDark()'), source.indexOf('function receiveOpenInput('));
function workbench(systemDark = true) {
  const root = { dataset: {}, style: { colorScheme: '', setProperty() {}, removeProperty() {} } };
  const context = vm.createContext({
    document: { documentElement: root }, localStorage: { setItem() {} },
    matchMedia: () => ({ matches: systemDark, addEventListener() {} }), setHostLocale() {}, applyHostStyleVariables() {},
    applyDocumentTheme(value) { root.dataset.theme = value; root.style.colorScheme = value; },
    syncHostLayout() {}, app: {}, viewer: { theme(value) { context.viewerDark = value; } },
    hostTheme: undefined, theme: 'system'
  });
  vm.runInContext(handlers, context);
  return { root, context, run: code => vm.runInContext(code, context) };
}

test('manual light theme overrides a dark host for both CSS and native controls', () => {
  const { root, context, run } = workbench();
  run("hostContext({theme:'dark'}); theme='light'; applyTheme();");
  assert.equal(root.dataset.theme, 'light');
  assert.equal(root.style.colorScheme, 'light');
  assert.equal(context.viewerDark, false);
  run("hostContext({theme:'dark'});");
  assert.equal(root.style.colorScheme, 'light');
  run("theme='dark'; applyTheme();");
  assert.equal(root.style.colorScheme, 'dark');
  run("theme='system'; hostContext({theme:'light'});");
  assert.equal(root.style.colorScheme, 'light');
});

test('system fallback resolves CSS and viewer to the same browser preference', () => {
  for (const dark of [false, true]) {
    const { root, context, run } = workbench(dark);
    run('applyTheme();');
    assert.equal(root.dataset.theme, dark ? 'dark' : 'light');
    assert.equal(root.style.colorScheme, dark ? 'dark' : 'light');
    assert.equal(context.viewerDark, dark);
  }
});
