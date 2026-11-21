import { OpenAIExtensions } from "@openai/mcp-extensions/app";

// The embedding host selects its adapter before the app handshake. Existing
// Codex resources retain their original extension negotiation and transport.
export function installHostExtensions(app, host = window.__TRIPO_HOST__) {
  if (host === "antigravity") {
    // Antigravity allows at most four tools/call requests per view. Queue
    // thumbnail/preview bursts instead of letting the host reject the excess.
    app.callServerTool = limitConcurrentCalls(app.callServerTool.bind(app), 4);
    return;
  }
  return host === "deepseek" ? undefined : new OpenAIExtensions(app);
}

export function limitConcurrentCalls(call, limit) {
  let active = 0;
  const pending = [];
  const next = () => {
    while (active < limit && pending.length) {
      const { args, resolve, reject } = pending.shift();
      active++;
      Promise.resolve()
        .then(() => call(...args))
        .then(resolve, reject)
        .finally(() => {
          active--;
          next();
        });
    }
  };
  return (...args) =>
    new Promise((resolve, reject) => {
      pending.push({ args, resolve, reject });
      next();
    });
}

export function updateModelContext(app, params) {
  if (!app.getHostCapabilities()?.updateModelContext) return Promise.resolve();
  return app.updateModelContext(params).catch(() => {});
}
