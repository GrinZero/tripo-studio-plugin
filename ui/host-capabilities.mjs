import { OpenAIExtensions } from "@openai/mcp-extensions/app";

// The embedding host selects its adapter before the app handshake. Existing
// Codex resources retain their original extension negotiation and transport.
export function installHostExtensions(app, host = window.__TRIPO_HOST__) {
  return host === "deepseek" ? undefined : new OpenAIExtensions(app);
}
