/**
 * Verbose browser-console logging for local debugging (same rules as the connection log panel).
 * Enable everywhere with ?streamLog=1 on the stream URL, or use localhost / 127.0.0.1 / *.local.
 */
export function isDevVerboseLogging() {
    if (typeof location === "undefined")
        return false;
    if (new URLSearchParams(location.search).get("streamLog") === "1")
        return true;
    const h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".local");
}
export function devConsoleLog(...args) {
    if (isDevVerboseLogging()) {
        console.log("[moonlight-dev]", ...args);
    }
}
export function devConsoleWarn(...args) {
    if (isDevVerboseLogging()) {
        console.warn("[moonlight-dev]", ...args);
    }
}
