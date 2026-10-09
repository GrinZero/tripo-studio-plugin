// Anything shaped like credential material must never reach tool results,
// structured content, task ledgers or log lines.
const SENSITIVE_KEY = /authorization|cookie|token|secret|password|credential|session_token|sts_ak|sts_sk|jwt|bearer/i;
const BEARER_VALUE = /^Bearer\s+\S+/i;
const JWT_VALUE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const REDACTED = "[REDACTED]";

export function sanitizeMessage(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

export function redactValue(value, keyHint = "") {
  if (typeof value === "string") {
    if (SENSITIVE_KEY.test(keyHint)) return REDACTED;
    if (BEARER_VALUE.test(value) || JWT_VALUE.test(value)) return REDACTED;
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry));
  if (value !== null && typeof value === "object") {
    const output = {};
    for (const [key, entry] of Object.entries(value)) output[key] = redactValue(entry, key);
    return output;
  }
  return value;
}

export const redactDeep = redactValue;
export { REDACTED };
