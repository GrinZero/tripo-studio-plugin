import { execFile } from "node:child_process";
import { TripoError } from "../errors.mjs";
import { STUDIO_WORKSPACE_URL } from "../constants.mjs";
import { FileLock } from "../store/lock.mjs";
import { delay } from "../util/misc.mjs";
import { sessionCandidates } from "./cookies.mjs";

const LOGIN_WAIT_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 2500;
const WHOAMI_URL = "https://auth.tripo3d.ai/sessions/whoami";
const VERIFY_PATH = "/v2/studio/user/profile/payment";

function openInDefaultBrowser(url) {
  return new Promise((resolve) => {
    const [cmd, args] =
      process.platform === "darwin"
        ? ["open", [url]]
        : process.platform === "win32"
          ? ["cmd", ["/c", "start", "", url]]
          : ["xdg-open", [url]];
    execFile(cmd, args, { timeout: 15000 }, (error) => resolve(!error));
  });
}

// Validates a candidate kratos cookie against the Studio API. Returns
// { expiresAtMs, identityId } when the session is accepted, else null.
async function verifyCookie(config, cookieValue) {
  const headers = {
    accept: "application/json",
    cookie: `ory_kratos_session=${cookieValue}`,
    origin: config.studioOrigin,
    referer: `${config.studioOrigin}/`,
    "x-tripo-device-id": config.deviceId,
    "x-tripo-region": "rg1"
  };
  try {
    const response = await fetch(`${config.apiBaseUrl}${VERIFY_PATH}`, { headers, redirect: "error" });
    if (response.status !== 200) return null;
    const envelope = await response.json().catch(() => null);
    if (!envelope || envelope.code !== 0) return null;
  } catch {
    return null;
  }
  let identityId;
  let expiresAtMs;
  try {
    const whoami = await fetch(WHOAMI_URL, { headers: { cookie: `ory_kratos_session=${cookieValue}` }, redirect: "error" });
    if (whoami.status === 200) {
      const session = await whoami.json().catch(() => null);
      identityId = session?.identity?.id ?? session?.identity?.traits?.subId ?? undefined;
      const parsedExpiry = Date.parse(session?.expires_at ?? "");
      if (Number.isFinite(parsedExpiry)) expiresAtMs = parsedExpiry;
    }
  } catch {
    // whoami is best-effort: cookie-hash fingerprint still works.
  }
  return { expiresAtMs, identityId };
}

// Coordinates login and headless credential refresh across every MCP process
// on this machine. There is no browser automation anywhere: login opens the
// user's normal browser once, afterwards the plugin re-reads the browser's
// own cookie store to reuse (and renew) the web session.
export class AuthCoordinator {
  #config;
  #session;
  #lock;
  constructor(config, session) {
    this.#config = config;
    this.#session = session;
    this.#lock = new FileLock(`${config.dataDir}/locks`);
  }

  // Full login: reuse an already-valid browser session when present,
  // otherwise open the default browser at Studio and wait (up to ten
  // minutes) for a session cookie to appear in the browser's cookie store.
  async login() {
    return await this.#lock.withLock("auth", async () => {
      const reused = await this.#tryCandidates(new Set());
      if (reused) return await this.#session.status();
      const opened = await openInDefaultBrowser(STUDIO_WORKSPACE_URL);
      const rejected = new Set();
      const deadline = Date.now() + LOGIN_WAIT_MS;
      while (Date.now() < deadline) {
        const captured = await this.#tryCandidates(rejected);
        if (captured) return await this.#session.status();
        await delay(POLL_INTERVAL_MS);
      }
      throw new TripoError(
        "AUTH_REQUIRED",
        `No usable Tripo Studio session appeared in the browser cookie store${opened ? "" : " (and the browser could not be opened automatically — open https://studio.tripo3d.ai/ and sign in)"}. Sign in with your normal browser; the plugin picks the session up automatically.`,
        { stage: "authentication" }
      );
    });
  }

  // Silent refresh: re-read the browser cookie stores and adopt any valid
  // session. Runs entirely headless — succeeds while the user stays logged
  // into Tripo Studio in any supported browser on this machine.
  async refresh() {
    try {
      return await this.#lock.withLock(
        "auth",
        async () => {
          const status = await this.#session.status();
          if (status.authenticated && (status.expires_in_seconds === null || status.expires_in_seconds > 300)) return true;
          return await this.#tryCandidates(new Set());
        },
        { timeoutMs: 90000 }
      );
    } catch (error) {
      if (error.code === "LOCK_TIMEOUT") return false;
      throw error;
    }
  }

  // Recovery hook used by the HTTP layer on 401/403/AUTH_REQUIRED.
  async recover({ reason } = {}) {
    const ok = await this.refresh();
    if (!ok) {
      throw new TripoError("AUTH_REQUIRED", `Tripo Studio session refresh failed (${reason ?? "auth"}). Run tripo_auth_login and sign in once in your browser.`, {
        nextAction: "tripo_auth_login",
        stage: "authentication"
      });
    }
    return true;
  }

  async importCookie(cookieValue) {
    return await this.#lock.withLock("auth", async () => {
      const verified = await verifyCookie(this.#config, cookieValue);
      if (!verified) {
        throw new TripoError("AUTH_CAPTURE_FAILED", "The provided Tripo Studio session cookie was rejected by the API.", { stage: "authentication" });
      }
      await this.#session.set({ cookie: cookieValue, source: "imported", ...verified });
      return await this.#session.status();
    });
  }

  async logout() {
    return await this.#lock.withLock("auth", async () => {
      await this.#session.clear();
      return { logged_out: true };
    });
  }

  async #tryCandidates(rejected) {
    for (const candidate of sessionCandidates(process.env)) {
      if (rejected.has(candidate.cookie)) continue;
      const verified = await verifyCookie(this.#config, candidate.cookie);
      if (!verified) {
        rejected.add(candidate.cookie);
        continue;
      }
      await this.#session.set({
        cookie: candidate.cookie,
        deviceId: candidate.deviceId,
        expiresAtMs: verified.expiresAtMs ?? candidate.expiresAtMs,
        identityId: verified.identityId,
        source: `cookie_store:${candidate.browser}`
      });
      return true;
    }
    return false;
  }
}
