/**
 * Per-app Moonlight stream settings.
 * - Runtime: stored in localStorage under "mlAppSettings" as { [appId: string]: Settings }.
 * - File: optional web/app_settings.json (same shape) is fetched and used as fallback when no localStorage entry for an app.
 * - Export: download current per-app settings as app_settings.json. Import: load from a JSON file and merge into storage.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { buildUrl } from "./config_.js";
import { defaultSettings, getLocalStreamSettings } from "./component/settings_menu.js";
const STORAGE_KEY = "mlAppSettings";
const SETTINGS_FILE_PATH = "/app_settings.json";
let staticFileCache = null;
function loadAppSettingsMap() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw == null)
            return {};
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed !== null ? parsed : {};
    }
    catch (_a) {
        localStorage.removeItem(STORAGE_KEY);
        return {};
    }
}
function saveAppSettingsMap(map) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}
function migratePageStyle(settings) {
    if (settings.pageStyle === "old") {
        settings.pageStyle = "moonlight";
    }
}
/**
 * Fetch app_settings.json from the server once and cache it. Used as fallback when an app has no localStorage entry.
 */
export function loadStaticAppSettingsFile() {
    return __awaiter(this, void 0, void 0, function* () {
        if (staticFileCache !== null)
            return staticFileCache;
        try {
            const url = buildUrl(SETTINGS_FILE_PATH);
            const res = yield fetch(url, { cache: "no-store" });
            if (!res.ok)
                return null;
            const data = (yield res.json());
            if (typeof data !== "object" || data === null)
                return null;
            staticFileCache = data;
            return staticFileCache;
        }
        catch (_a) {
            return null;
        }
    });
}
/**
 * Get stream settings for a given app_id.
 * Precedence: localStorage (per-app) > static app_settings.json (per-app) > global mlSettings > default settings.
 */
export function getSettingsForApp(appId) {
    const key = String(appId);
    const map = loadAppSettingsMap();
    const appSettings = map[key];
    if (appSettings != null) {
        const base = defaultSettings();
        Object.assign(base, appSettings);
        migratePageStyle(base);
        return base;
    }
    if (staticFileCache != null) {
        const fileSettings = staticFileCache[key];
        if (fileSettings != null) {
            const base = defaultSettings();
            Object.assign(base, fileSettings);
            migratePageStyle(base);
            return base;
        }
    }
    const global = getLocalStreamSettings();
    if (global != null)
        return global;
    return defaultSettings();
}
/**
 * Save stream settings for a given app_id. Writes only to localStorage (not to the server file).
 */
export function setSettingsForApp(appId, settings) {
    const map = loadAppSettingsMap();
    map[String(appId)] = settings;
    saveAppSettingsMap(map);
}
/**
 * Return all app IDs that have saved per-app settings (localStorage).
 */
export function getAppIdsWithSavedSettings() {
    const map = loadAppSettingsMap();
    return Object.keys(map)
        .map((k) => Number.parseInt(k, 10))
        .filter((n) => Number.isInteger(n));
}
/**
 * Export current per-app settings (localStorage) as JSON string. Same format as app_settings.json.
 */
export function exportAppSettingsToJson() {
    const map = loadAppSettingsMap();
    return JSON.stringify(map, null, 2);
}
/**
 * Trigger download of app_settings.json with current per-app settings.
 */
export function exportAppSettingsToFile() {
    const json = exportAppSettingsToJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "app_settings.json";
    a.click();
    URL.revokeObjectURL(url);
}
/**
 * Merge imported JSON (same format as app_settings.json) into localStorage. Does not replace existing entries unless the import contains that appId.
 */
export function importAppSettingsFromJson(json) {
    const map = loadAppSettingsMap();
    try {
        const imported = JSON.parse(json);
        if (typeof imported !== "object" || imported === null)
            return;
        for (const key of Object.keys(imported)) {
            const val = imported[key];
            if (typeof val === "object" && val !== null)
                map[key] = val;
        }
        saveAppSettingsMap(map);
    }
    catch (_a) {
        // invalid json, do nothing
    }
}
