import { PostMessageTransport } from '@modelcontextprotocol/ext-apps';

export function isCodexHost(context = {}, info = {}, browserAgent = '') {
  const explicitIdentity = [info.client_type, info.name, context.userAgent, browserAgent]
    .some(value => typeof value === 'string' && /\bcodex(?:\b|_)/i.test(value));
  // The native Codex widget identifies itself as "chatgpt". Sandboxes can
  // normalize hostInfo before it reaches this app, removing client_type.
  // Its desktop widget context retains the interaction-cursor extension.
  const nativeWidget = context.userAgent === 'chatgpt'
    && context.platform === 'desktop'
    && typeof context['openai/interactionCursor'] === 'string';
  return explicitIdentity || nativeWidget;
}

export class HostInfoTransport extends PostMessageTransport {
  constructor(target, reportHostInfo) {
    super(target, target);
    this.reportHostInfo = reportHostInfo;
  }

  async send(message) {
    if (message.method === 'ui/initialize') this.initializeId = message.id;
    await super.send(message);
  }

  async start() {
    // The SDK's ImplementationSchema drops client_type. Preserve it from the
    // same source-checked transport before the SDK parses the handshake.
    const handle = this.onmessage;
    this.onmessage = (message, ...extra) => {
      if (this.initializeId !== undefined && message.id === this.initializeId && message.result?.hostInfo) this.reportHostInfo(message.result.hostInfo);
      handle?.(message, ...extra);
    };
    await super.start();
  }
}
