import test from 'node:test';
import assert from 'node:assert/strict';
import { isCodexHost } from '../ui/host-layout.mjs';
import { McpUiInitializeResultSchema } from '@modelcontextprotocol/ext-apps';

test('recognizes the native Codex context after a sandbox has normalized hostInfo', () => {
  // Native widget host: name/userAgent are "chatgpt". Only hostContext is
  // extensible through schema normalization; client_type is discarded.
  const rawHostInfo = {name:'chatgpt',version:'1',client_type:'codex_desktop'};
  const init = McpUiInitializeResultSchema.parse({
    protocolVersion:'2026-01-26',
    hostCapabilities:{},
    hostInfo: rawHostInfo,
    hostContext:{userAgent:'chatgpt',platform:'desktop','openai/interactionCursor':'default',containerDimensions:{maxWidth:1560,maxHeight:820}}
  });
  assert.equal(init.hostInfo.client_type, undefined);
  assert.equal(isCodexHost(init.hostContext, rawHostInfo, 'Mozilla/5.0 Chrome/130.0.0.0'), true);
});

test('identifies Codex even when the host name and userAgent are chatgpt', () => {
  assert.equal(isCodexHost({userAgent:'chatgpt'}, {name:'chatgpt',client_type:'codex_desktop'}), true);
  assert.equal(isCodexHost({}, {client_type:'codex_browser'}), true);
  assert.equal(isCodexHost({}, {client_type:'codex_vscode'}), true);
  assert.equal(isCodexHost({userAgent:'Codex/1.0'}), true);
  assert.equal(isCodexHost({}, {name:'Codex'}), true);
  assert.equal(isCodexHost({}, {}, 'Mozilla/5.0 Codex/1.0'), true);
});

test('generic ChatGPT, browsers and unknown hosts keep the standard layout', () => {
  assert.equal(isCodexHost({userAgent:'chatgpt'}, {name:'chatgpt'}), false);
  assert.equal(isCodexHost({userAgent:'chatgpt',platform:'desktop'}, {name:'chatgpt'}), false);
  assert.equal(isCodexHost({userAgent:'chatgpt',platform:'web','openai/interactionCursor':'default'}), false);
  assert.equal(isCodexHost({userAgent:'other',platform:'desktop','openai/interactionCursor':'default'}), false);
  assert.equal(isCodexHost({}, {}, 'Mozilla/5.0 Chrome/130.0.0.0'), false);
  assert.equal(isCodexHost({}, {name:'mycodexclone'}), false);
  assert.equal(isCodexHost(), false);
});
