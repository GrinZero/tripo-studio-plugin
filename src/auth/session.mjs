import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import path from "node:path";
import { TripoError } from "../errors.mjs";
import { JsonDocument } from "../store/jsondoc.mjs";

const EXPIRY_GUARD_MS = 60000;

function decodeJwtPayload(token) {
  const parts = token.split(".");
  const payload = parts[1];
  if (parts.length !== 3 || !payload) {
    throw new TripoError("AUTH_CAPTURE_FAILED", "Captured bearer value is not a JWT.", { stage: "authentication" });
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (error) {
    throw new TripoError("AUTH_CAPTURE_FAILED", "Captured JWT payload is invalid.", { cause: error, stage: "authentication" });
  }
}

function normalizeBearerToken(value) {
  const token = value.trim().replace(/^Bearer\s+/i, "").trim();
  const payload = decodeJwtPayload(token);
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    throw new TripoError("AUTH_CAPTURE_FAILED", "Captured JWT does not include a numeric expiration.", { stage: "authentication" });
  }
  const identity = [
    ["sub", payload.sub],
    ["user_id", payload.user_id],
    ["userId", payload.userId],
    ["uid", payload.uid],
    ["account_id", payload.account_id]
  ].find((entry) => {
    const v = entry[1];
    return (typeof v === "string" && v.trim().length > 0) || (typeof v === "number" && Number.isFinite(v));
  });
  if (!identity) {
    throw new TripoError("AUTH_CAPTURE_FAILED", "Captured JWT does not include a stable account identifier.", { stage: "authentication" });
  }
  return {
    accountFingerprint: createHash("sha256").update(JSON.stringify(identity)).digest("hex"),
    expiresAtMs: payload.exp * 1000,
    token
  };
}

function fingerprintFromIdentityId(identityId, cookieValue) {
  if (typeof identityId === "string" && identityId.trim()) {
    return createHash("sha256").update(`kratos:${identityId.trim()}`).digest("hex");
  }
  return createHash("sha256").update(`cookie:${cookieValue}`).digest("hex");
}

// SessionManager holds the captured credential — an `ory_kratos_session`
// cookie extracted from the user's own browser — and persists it to
// <dataDir>/session.json (mode 0600). The Studio API accepts the session
// cookie directly, so no browser automation is involved after extraction.
export class SessionManager {
  #config;
  #doc;
  #session;
  #loaded = false;
  constructor(config) {
    this.#config = config;
    this.#doc = new JsonDocument(path.join(config.dataDir, "session.json"));
  }

  async #ensureLoaded() {
    if (this.#loaded) return;
    this.#loaded = true;
    const stored = await this.#doc.read(undefined);
    if (!stored || typeof stored !== "object") return;
    try {
      if (stored.kind === "cookie" && typeof stored.cookie === "string") {
        if (stored.expires_at_ms && Date.now() >= stored.expires_at_ms - EXPIRY_GUARD_MS) return;
        this.#session = {
          kind: "cookie",
          cookie: stored.cookie,
          accountFingerprint: stored.account_fingerprint ?? fingerprintFromIdentityId(null, stored.cookie),
          deviceId: typeof stored.device_id === "string" ? stored.device_id : this.#config.deviceId,
          region: "rg1",
          expiresAtMs: stored.expires_at_ms ?? null,
          source: stored.source ?? "persisted"
        };
        return;
      }
      if (typeof stored.token === "string") {
        const normalized = normalizeBearerToken(stored.token);
        if (Date.now() >= normalized.expiresAtMs - EXPIRY_GUARD_MS) return;
        if (stored.account_fingerprint && stored.account_fingerprint !== normalized.accountFingerprint) return;
        this.#session = {
          kind: "bearer",
          ...normalized,
          deviceId: typeof stored.device_id === "string" ? stored.device_id : this.#config.deviceId,
          region: typeof stored.region === "string" ? stored.region : "rg1",
          source: "persisted"
        };
      }
    } catch {
      // Unparseable persisted material is treated as absent, never fatal.
    }
  }

  async status() {
    await this.#ensureLoaded();
    const session = this.#session;
    const expired = session?.expiresAtMs != null && Date.now() >= session.expiresAtMs - EXPIRY_GUARD_MS;
    if (!session || expired) {
      return { authenticated: false, kind: null, device_id_available: false, expires_at: null, expires_in_seconds: null, source: null };
    }
    return {
      authenticated: true,
      kind: session.kind,
      device_id_available: Boolean(session.deviceId),
      expires_at: session.expiresAtMs != null ? new Date(session.expiresAtMs).toISOString() : null,
      expires_in_seconds: session.expiresAtMs != null ? Math.max(0, Math.floor((session.expiresAtMs - Date.now()) / 1000)) : null,
      source: session.source
    };
  }

  async accountFingerprint() {
    await this.#ensureLoaded();
    await this.#require();
    return this.#session.accountFingerprint;
  }

  activeAccountFingerprint() {
    return this.#session?.accountFingerprint ?? null;
  }

  async getRequestIdentity() {
    await this.#ensureLoaded();
    const session = await this.#require();
    return {
      accountFingerprint: session.accountFingerprint,
      ...(session.kind === "bearer" ? { authorization: `Bearer ${session.token}` } : { cookie: `ory_kratos_session=${session.cookie}` }),
      deviceId: session.deviceId,
      region: session.region
    };
  }

  isCurrentSessionIdentity(identity) {
    const session = this.#session;
    if (!session) return false;
    if (session.expiresAtMs != null && Date.now() >= session.expiresAtMs - EXPIRY_GUARD_MS) return false;
    const sameCredential =
      session.kind === "bearer"
        ? `Bearer ${session.token}` === identity.authorization
        : `ory_kratos_session=${session.cookie}` === identity.cookie;
    return session.accountFingerprint === identity.accountFingerprint && sameCredential && session.deviceId === identity.deviceId && session.region === identity.region;
  }

  // captured: { cookie, deviceId, region, expiresAtMs, identityId, source }
  //        or { authorization, deviceId, region, source } for a raw JWT.
  async set(captured, { persist = true } = {}) {
    let session;
    if (typeof captured.authorization === "string") {
      const normalized = normalizeBearerToken(captured.authorization);
      if (Date.now() >= normalized.expiresAtMs - EXPIRY_GUARD_MS) {
        throw new TripoError("AUTH_EXPIRED", "The captured Tripo Studio JWT is already expired.", { stage: "authentication" });
      }
      session = { kind: "bearer", ...normalized };
    } else if (typeof captured.cookie === "string" && captured.cookie.trim()) {
      const cookie = captured.cookie.trim();
      if (cookie.length > 8192 || /[;\r\n]/.test(cookie)) {
        throw new TripoError("AUTH_CAPTURE_FAILED", "The captured Tripo Studio session cookie is malformed.", { stage: "authentication" });
      }
      if (captured.expiresAtMs != null && Date.now() >= captured.expiresAtMs - EXPIRY_GUARD_MS) {
        throw new TripoError("AUTH_EXPIRED", "The captured Tripo Studio session cookie is already expired.", { stage: "authentication" });
      }
      session = {
        kind: "cookie",
        cookie,
        accountFingerprint: fingerprintFromIdentityId(captured.identityId, cookie),
        expiresAtMs: captured.expiresAtMs ?? null
      };
    } else {
      throw new TripoError("AUTH_CAPTURE_FAILED", "No usable Tripo Studio credential was captured.", { stage: "authentication" });
    }
    const region = captured.region?.trim() || "rg1";
    if (region !== "rg1") {
      throw new TripoError("UNSUPPORTED_REGION", `This build supports Tripo Studio region rg1, but captured ${region}.`, { stage: "authentication" });
    }
    this.#loaded = true;
    this.#session = {
      ...session,
      deviceId: captured.deviceId?.trim() || this.#config.deviceId,
      region,
      source: captured.source ?? "cookie_store"
    };
    if (persist) {
      await this.#doc.write({
        account_fingerprint: this.#session.accountFingerprint,
        captured_at: new Date().toISOString(),
        device_id: this.#session.deviceId,
        ...(this.#session.expiresAtMs != null ? { expires_at_ms: this.#session.expiresAtMs } : {}),
        kind: this.#session.kind,
        region: this.#session.region,
        schema_version: 2,
        ...(this.#session.kind === "bearer" ? { token: this.#session.token } : { cookie: this.#session.cookie })
      });
    }
    return this.status();
  }

  async clear() {
    this.#session = undefined;
    this.#loaded = true;
    await this.#doc.remove();
  }

  async #require() {
    await this.#ensureLoaded();
    const session = this.#session;
    if (!session) {
      throw new TripoError("AUTH_REQUIRED", "Tripo Studio login is not established. Call tripo_auth_login — it opens your browser once; afterwards the plugin reuses your web session headlessly.", {
        nextAction: "tripo_auth_login",
        stage: "authentication"
      });
    }
    if (session.expiresAtMs != null && Date.now() >= session.expiresAtMs - EXPIRY_GUARD_MS) {
      await this.clear();
      throw new TripoError("AUTH_EXPIRED", "The persisted Tripo Studio session expired and needs to be refreshed from the browser.", { stage: "authentication" });
    }
    return session;
  }
}
