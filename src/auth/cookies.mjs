import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto";
import os from "node:os";
import path from "node:path";

// Reads the `ory_kratos_session` cookie (plus tripo_device_id) out of the
// browsers already installed on this machine — no browser automation needed.
// The Studio API accepts the session cookie directly, so once extracted the
// plugin talks to Tripo over plain HTTPS.
//
// Chromium-family cookies are AES-128-CBC encrypted ("v10"/"v11" prefix) with
// a key derived from the OS credential store ("Chrome Safe Storage" keychain
// item on macOS, "peanuts" fallback on Linux). Firefox stores cookies as
// plaintext SQLite on every platform.

const TRIPO_COOKIE_NAMES = ["ory_kratos_session", "tripo_device_id"];

let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  DatabaseSync = null; // Node < 22.5 — sqlite3 CLI fallback below.
}

function sqliteRows(dbPath, sql) {
  if (DatabaseSync) {
    // Cookie timestamps exceed MAX_SAFE_INTEGER — they must come back as
    // BigInt or node:sqlite throws and the store is skipped.
    const db = new DatabaseSync(dbPath, { readOnly: true, readBigInts: true });
    try {
      return db.prepare(sql).all();
    } finally {
      db.close();
    }
  }
  const out = execFileSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out || "[]");
}

function chromiumBrowserRoots(platform, env) {
  const home = os.homedir();
  const roots = [];
  const push = (name, rel, keychainLabel) => {
    const dir = platform === "darwin" || platform === "linux" || platform === "win32" ? path.join(home, rel) : null;
    if (dir) roots.push({ name, dir, keychainLabel });
  };
  if (platform === "darwin") {
    const as = (rel) => path.join("Library", "Application Support", rel);
    push("chrome", as(path.join("Google", "Chrome")), "Chrome Safe Storage");
    push("chrome-beta", as(path.join("Google", "Chrome Beta")), "Chrome Safe Storage");
    push("chromium", as("Chromium"), "Chromium Safe Storage");
    push("edge", as("Microsoft Edge"), "Microsoft Edge Safe Storage");
    push("brave", as(path.join("BraveSoftware", "Brave-Browser")), "Brave Safe Storage");
    push("arc", as(path.join("Arc", "User Data")), "Arc Safe Storage");
    push("vivaldi", as("Vivaldi"), "Vivaldi Safe Storage");
  } else if (platform === "linux") {
    const cfg = (rel) => path.join(".config", rel);
    push("chrome", cfg("google-chrome"), "Chrome Safe Storage");
    push("chromium", cfg("chromium"), "Chromium Safe Storage");
    push("edge", cfg("microsoft-edge"), "Microsoft Edge Safe Storage");
    push("brave", cfg(path.join("BraveSoftware", "Brave-Browser")), "Brave Safe Storage");
  }
  // Escape hatch: an explicit cookie-store root (e.g. a dedicated
  // Chrome-for-Testing profile) via TRIPO_BROWSER_PROFILE_DIR.
  if (env?.TRIPO_BROWSER_PROFILE_DIR) {
    roots.push({ name: "custom", dir: path.resolve(env.TRIPO_BROWSER_PROFILE_DIR), keychainLabel: "Chrome Safe Storage" });
  }
  return roots;
}

function firefoxRoots(platform, env) {
  const home = os.homedir();
  if (platform === "darwin") return [path.join(home, "Library", "Application Support", "Firefox", "Profiles")];
  if (platform === "linux") return [path.join(home, ".mozilla", "firefox"), path.join(home, "snap", "firefox", "common", ".mozilla", "firefox")];
  if (platform === "win32") return [path.join(env?.APPDATA ?? path.join(home, "AppData", "Roaming"), "Mozilla", "Firefox", "Profiles")];
  return [];
}

function profileCookieDbs(rootDir) {
  // A "profile" is any subdirectory (or the root itself) containing a Cookies
  // database, either at <profile>/Cookies or <profile>/Network/Cookies.
  const dbs = [];
  const candidates = [rootDir];
  try {
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(path.join(rootDir, entry.name));
    }
  } catch {
    return dbs;
  }
  for (const dir of candidates) {
    for (const rel of ["Cookies", path.join("Network", "Cookies")]) {
      const dbPath = path.join(dir, rel);
      if (existsSync(dbPath)) dbs.push({ dbPath, profile: path.basename(dir) });
    }
  }
  return dbs;
}

function safeStorageKey(label) {
  try {
    const password = execFileSync("security", ["find-generic-password", "-l", label, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15000
    }).trim();
    if (password) return pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
  } catch {
    // Keychain denied or label missing — fall through to other stores.
  }
  return null;
}

function linuxFallbackKey() {
  // Chromium on Linux without a keyring encrypts with the literal "peanuts".
  return pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1");
}

function decryptChromiumValue(encryptedHex, hostKey, keys) {
  const raw = Buffer.from(encryptedHex, "hex");
  if (raw.length < 3 + 16) return null;
  const version = raw.subarray(0, 3).toString("latin1");
  if (version !== "v10" && version !== "v11") return null;
  for (const key of keys) {
    try {
      const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
      decipher.setAutoPadding(false);
      let plain = Buffer.concat([decipher.update(raw.subarray(3)), decipher.final()]);
      const pad = plain[plain.length - 1];
      if (pad < 1 || pad > 16) continue;
      plain = plain.subarray(0, plain.length - pad);
      // Chrome >= 80 prefixes values with the 32-byte SHA-256 of the host key.
      if (plain.length > 32 && plain.subarray(0, 32).equals(createHash("sha256").update(hostKey).digest())) {
        plain = plain.subarray(32);
      }
      const value = plain.toString("utf8");
      // Decrypted session material is printable text; a wrong key yields
      // control bytes — treat that as a miss.
      if (value && !/[\u0000-\u001f]/.test(value)) return value;
    } catch {
      // Wrong key — try the next one.
    }
  }
  return null;
}

function* copyDbForRead(dbPath) {
  // Chrome holds an exclusive lock while running: copy db + wal/shm aside.
  const dir = mkdtempSync(path.join(os.tmpdir(), "tripo-cookies-"));
  const target = path.join(dir, "Cookies");
  try {
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      const src = dbPath + suffix;
      if (existsSync(src)) copyFileSync(src, target + suffix);
    }
    yield target;
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

function chromiumCookies(env) {
  const platform = process.platform;
  const results = [];
  for (const browser of chromiumBrowserRoots(platform, env)) {
    if (!existsSync(browser.dir)) continue;
    let keys = null;
    for (const { dbPath, profile } of profileCookieDbs(browser.dir)) {
      let rows;
      try {
        for (const copy of copyDbForRead(dbPath)) {
          rows = sqliteRows(
            copy,
            `SELECT host_key, name, value, hex(encrypted_value) AS encrypted_hex, expires_utc FROM cookies WHERE name IN (${TRIPO_COOKIE_NAMES.map((n) => `'${n}'`).join(",")}) AND host_key LIKE '%tripo3d.ai'`
          );
        }
      } catch {
        continue;
      }
      if (!rows?.length) continue;
      if (keys === null) {
        keys = [];
        if (platform === "darwin") {
          const key = safeStorageKey(browser.keychainLabel);
          if (key) keys.push(key);
          // The dedicated-profile escape hatch may have been written by a
          // Chromium build using the generic label.
          if (browser.keychainLabel !== "Chromium Safe Storage") {
            const alt = safeStorageKey("Chromium Safe Storage");
            if (alt) keys.push(alt);
          }
        } else if (platform === "linux") {
          keys.push(linuxFallbackKey());
          const key = safeStorageKey(browser.keychainLabel);
          if (key) keys.push(key);
        }
      }
      for (const row of rows) {
        const expiresUtc = Number(row.expires_utc ?? 0);
        const expiresAtMs = expiresUtc > 0 ? Math.round(expiresUtc / 1000) - 11644473600000 : null;
        let value = typeof row.value === "string" && row.value !== "" ? row.value : null;
        if (!value && row.encrypted_hex) {
          value = decryptChromiumValue(row.encrypted_hex, row.host_key, keys);
        }
        if (value) {
          results.push({
            browser: browser.name,
            profile,
            name: row.name,
            value,
            host: row.host_key,
            expiresAtMs,
            sourcePath: dbPath
          });
        }
      }
    }
  }
  return results;
}

function firefoxCookies(env) {
  const results = [];
  for (const root of firefoxRoots(process.platform, env)) {
    if (!existsSync(root)) continue;
    let profiles;
    try {
      profiles = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of profiles) {
      if (!entry.isDirectory()) continue;
      const dbPath = path.join(root, entry.name, "cookies.sqlite");
      if (!existsSync(dbPath)) continue;
      let rows;
      try {
        for (const copy of copyDbForRead(dbPath)) {
          rows = sqliteRows(
            copy,
            `SELECT host AS host_key, name, value, expiry FROM moz_cookies WHERE name IN (${TRIPO_COOKIE_NAMES.map((n) => `'${n}'`).join(",")}) AND host LIKE '%tripo3d.ai'`
          );
        }
      } catch {
        continue;
      }
      for (const row of rows ?? []) {
        if (typeof row.value !== "string" || row.value === "") continue;
        results.push({
          browser: "firefox",
          profile: entry.name,
          name: row.name,
          value: row.value,
          host: row.host_key,
          expiresAtMs: Number(row.expiry ?? 0) > 0 ? Number(row.expiry) * 1000 : null,
          sourcePath: dbPath
        });
      }
    }
  }
  return results;
}

// Returns every usable Tripo cookie found on this machine, newest first.
export function extractTripoCookies(env = process.env) {
  const all = [...chromiumCookies(env), ...firefoxCookies(env)];
  all.sort((a, b) => (b.expiresAtMs ?? 0) - (a.expiresAtMs ?? 0));
  return all;
}

// Groups extracted cookies into candidate sessions (one per session value),
// newest first. Each candidate carries the raw kratos cookie and the device id
// seen alongside it.
export function sessionCandidates(env = process.env) {
  const byValue = new Map();
  const devices = new Map();
  for (const cookie of extractTripoCookies(env)) {
    if (cookie.name === "tripo_device_id" && !devices.has(cookie.value)) devices.set(cookie.value, cookie.value);
    if (cookie.name !== "ory_kratos_session") continue;
    if (cookie.expiresAtMs !== null && cookie.expiresAtMs <= Date.now()) continue;
    if (!byValue.has(cookie.value)) {
      byValue.set(cookie.value, {
        cookie: cookie.value,
        browser: cookie.browser,
        expiresAtMs: cookie.expiresAtMs
      });
    }
  }
  const candidates = [...byValue.values()];
  const deviceId = [...devices.values()][0];
  for (const candidate of candidates) candidate.deviceId = deviceId;
  return candidates;
}
