import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { TripoError } from "./errors.mjs";
import { STUDIO_API_BASE_URL, STUDIO_ORIGIN } from "./constants.mjs";

function defaultDataDir(env) {
  if (process.platform === "win32") {
    return path.join(env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "TripoStudioPlugin");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "TripoStudioPlugin");
  }
  return path.join(env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state"), "tripo-studio-plugin");
}

function defaultAssetRoot(env) {
  const home = env.USERPROFILE?.trim() || env.HOME?.trim() || os.homedir();
  return path.join(home, "Documents", "TripoStudio");
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TripoError("CONFIGURATION_ERROR", `${name} must be a positive integer.`);
  }
  return parsed;
}

function stableDeviceId(dataDir) {
  const hex = createHash("sha256").update(`tripo-studio-plugin\0${dataDir}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16] ?? "0", 16) % 4] ?? "8";
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function parseRoots(value, fallback) {
  const entries = (value?.trim() ? value.split(path.delimiter) : fallback)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
  if (entries.length === 0) throw new TripoError("CONFIGURATION_ERROR", "At least one local path root is required.");
  return [...new Set(entries)];
}

const SETTINGS_FIELDS = new Set(["asset_root", "schema_version"]);

function normalizeAssetRoot(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || !path.isAbsolute(trimmed)) {
    throw new TripoError("CONFIGURATION_ERROR", "asset_root must be an absolute path to a dedicated folder.");
  }
  const resolved = path.resolve(trimmed);
  const samePath = (a, b) => {
    const n = (v) => path.resolve(v).replace(/[\\/]+$/, "");
    return process.platform === "win32" ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
  };
  if (samePath(resolved, path.parse(resolved).root)) {
    throw new TripoError("CONFIGURATION_ERROR", "asset_root cannot be a filesystem root.");
  }
  if (samePath(resolved, os.homedir()) || samePath(resolved, os.tmpdir())) {
    throw new TripoError("CONFIGURATION_ERROR", "asset_root must be a dedicated subdirectory, not home or tmp.");
  }
  return resolved;
}

function readLocalSettings(settingsFile) {
  let text;
  try {
    text = readFileSync(settingsFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw new TripoError("CONFIGURATION_ERROR", "Could not read the local settings file.", { cause: error });
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new TripoError("CONFIGURATION_ERROR", "The local settings file is not valid JSON.", { cause: error });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || parsed.schema_version !== 1) {
    throw new TripoError("CONFIGURATION_ERROR", "The local settings file schema is not supported.");
  }
  const unknown = Object.keys(parsed).filter((key) => !SETTINGS_FIELDS.has(key));
  if (unknown.length > 0) {
    throw new TripoError("CONFIGURATION_ERROR", `Unsupported local settings fields: ${unknown.sort().join(", ")}.`);
  }
  return { asset_root: normalizeAssetRoot(parsed.asset_root) };
}

export function loadConfig(env = process.env) {
  const dataDir = path.resolve(env.TRIPO_PLUGIN_DATA_DIR ?? defaultDataDir(env));
  const settingsFile = path.join(dataDir, "settings.json");
  const settings = readLocalSettings(settingsFile);
  const assetRoot = normalizeAssetRoot(settings?.asset_root ?? env.TRIPO_ASSET_ROOT?.trim() ?? defaultAssetRoot(env));
  const outputRoots = parseRoots(env.TRIPO_OUTPUT_ROOTS, [assetRoot]);
  return {
    apiBaseUrl: STUDIO_API_BASE_URL,
    blenderExecutable: env.TRIPO_BLENDER_EXECUTABLE?.trim() || (process.platform === "darwin" ? "/Applications/Blender.app/Contents/MacOS/Blender" : "blender"),
    assetRoot,
    dataDir,
    deviceId: env.TRIPO_DEVICE_ID?.trim() || stableDeviceId(dataDir),
    outputRoots,
    planTtlMs: parsePositiveInteger(env.TRIPO_PLAN_TTL_MS, 30 * 60 * 1000, "TRIPO_PLAN_TTL_MS"),
    requestTimeoutMs: parsePositiveInteger(env.TRIPO_REQUEST_TIMEOUT_MS, 60000, "TRIPO_REQUEST_TIMEOUT_MS"),
    settingsFile,
    settingsLoaded: settings !== undefined,
    studioOrigin: STUDIO_ORIGIN,
    tokenCaptureTimeoutMs: parsePositiveInteger(env.TRIPO_TOKEN_CAPTURE_TIMEOUT_MS, 20000, "TRIPO_TOKEN_CAPTURE_TIMEOUT_MS")
  };
}
