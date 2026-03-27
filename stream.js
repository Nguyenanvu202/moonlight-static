var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import "./polyfill/index.js";
import { getApi } from "./api.js";
import { showErrorPopup } from "./component/error.js";
import { Stream } from "./stream/index.js";
import { getModalBackground, showMessage, showModal } from "./component/modal/index.js";
import { getSidebarDragOffsetY, getSidebarRoot, setSidebar, setSidebarExtended, setSidebarStyle } from "./component/sidebar/index.js";
import { defaultStreamInputConfig } from "./stream/input.js";
import { exportAppSettingsToFile, getSettingsForApp, importAppSettingsFromJson, loadStaticAppSettingsFile, setSettingsForApp, } from "./app_settings.js";
import { StreamSettingsComponent } from "./component/settings_menu.js";
import { setStyle as setPageStyle } from "./styles/index.js";
import { SelectComponent } from "./component/input.js";
import { StreamKeys } from "./api_bindings.js";
import { ScreenKeyboard } from "./screen_keyboard.js";
import { FormModal } from "./component/modal/form.js";
import { streamStatsToText } from "./stream/stats.js";
import { MoonlightFullscreenOverlay, MoonlightLoadingScreen } from "./stream_overlays.js";
/** Local dev hostnames — connection log panel is available here when DevTools is open. */
function isLocalDevHostname() {
    const h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".local");
}
/** Enable dev connection log: localhost family, or `?streamLog=1` (any host; panel stays visible). */
function shouldAttachDevConnectionLog() {
    if (typeof location === "undefined")
        return false;
    if (new URLSearchParams(location.search).get("streamLog") === "1")
        return true;
    return isLocalDevHostname();
}
/** Heuristic: docked DevTools usually shrinks the viewport vs the outer window. */
function detectDevToolsOpen() {
    const threshold = 140;
    const w = window.outerWidth - window.innerWidth;
    const h = window.outerHeight - window.innerHeight;
    return w > threshold || h > threshold;
}
function computeDevConnectionLogPanelVisible() {
    if (new URLSearchParams(location.search).get("streamLog") === "1")
        return true;
    if (!isLocalDevHostname())
        return false;
    return detectDevToolsOpen();
}
/**
 * Read-only connection log for development: same stream events as the old modal, but no modal overlay.
 * Shown when DevTools appears docked (localhost) or always with ?streamLog=1.
 */
class DevStreamConnectionLog {
    constructor() {
        this.shell = document.createElement("div");
        this.root = document.createElement("div");
        this.textTy = null;
        this.text = document.createElement("p");
        this.options = document.createElement("div");
        this.debugDetailButton = document.createElement("button");
        this.hidePanelButton = document.createElement("button");
        this.debugDetail = "";
        this.debugDetailDisplay = document.createElement("div");
        this.hideUntil = 0;
        this.shell.className = "dev-stream-connection-log-shell";
        this.shell.style.cssText =
            "position:fixed;bottom:10px;left:10px;max-width:min(420px,calc(100vw - 20px));max-height:36vh;" +
                "z-index:99985;display:none;overflow:hidden;border-radius:10px;" +
                "box-shadow:0 8px 32px rgba(0,0,0,.55);background:rgba(12,12,14,.92);" +
                "backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);" +
                "border:1px solid rgba(255,255,255,.1);font:13px system-ui,sans-serif;color:rgba(255,255,255,.9)";
        const head = document.createElement("div");
        head.style.cssText =
            "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;" +
                "border-bottom:1px solid rgba(255,255,255,.08);font-size:11px;font-weight:600;" +
                "letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,.45)";
        head.textContent = "Connection log";
        this.shell.appendChild(head);
        this.root.classList.add("modal-video-connect");
        this.root.style.cssText = "margin:0;padding:10px 12px 12px;max-height:calc(36vh - 40px);overflow:auto";
        this.text.innerText = "Connecting";
        this.root.appendChild(this.text);
        this.root.appendChild(this.options);
        this.options.classList.add("modal-video-connect-options");
        this.debugDetailButton.innerText = "Show logs";
        this.debugDetailButton.addEventListener("click", this.onDebugDetailClick.bind(this));
        this.options.appendChild(this.debugDetailButton);
        this.hidePanelButton.innerText = "Hide";
        this.hidePanelButton.addEventListener("click", () => {
            this.hideUntil = Date.now() + 20000;
            this.shell.style.display = "none";
        });
        this.options.appendChild(this.hidePanelButton);
        this.debugDetailDisplay.classList.add("textlike");
        this.debugDetailDisplay.classList.add("modal-video-connect-debug");
        this.shell.appendChild(this.root);
        document.body.appendChild(this.shell);
    }
    applyDesiredVisibility(visible) {
        if (Date.now() < this.hideUntil) {
            this.shell.style.display = "none";
            return;
        }
        this.shell.style.display = visible ? "block" : "none";
    }
    onDebugDetailClick() {
        const shown = this.root.contains(this.debugDetailDisplay);
        if (shown) {
            this.debugDetailButton.innerText = "Show logs";
            this.root.removeChild(this.debugDetailDisplay);
        }
        else {
            this.debugDetailButton.innerText = "Hide logs";
            this.root.appendChild(this.debugDetailDisplay);
            this.debugDetailDisplay.innerText = this.debugDetail;
        }
    }
    debugLog(line) {
        this.debugDetail += `${line}\n`;
        this.debugDetailDisplay.innerText = this.debugDetail;
        console.info(`[Stream]: ${line}`);
    }
    onInfo(event) {
        var _a, _b, _c, _d;
        const data = event.detail;
        if (data.type == "app") {
            this.debugLog(`App: ${data.app.title}`);
        }
        else if (data.type == "connectionComplete") {
            const t = "Connection complete";
            this.text.innerText = t;
            this.debugLog(t);
        }
        else if (data.type == "addDebugLine") {
            const message = data.line.trim();
            if (message) {
                this.debugLog(message);
                if (!this.textTy) {
                    this.text.innerText = message;
                    this.textTy = (_b = (_a = data.additional) === null || _a === void 0 ? void 0 : _a.type) !== null && _b !== void 0 ? _b : null;
                }
                else if (((_c = data.additional) === null || _c === void 0 ? void 0 : _c.type) == "fatalDescription" ||
                    ((_d = data.additional) === null || _d === void 0 ? void 0 : _d.type) == "ifErrorDescription") {
                    this.text.innerText = this.text.innerText ? `${this.text.innerText}\n${message}` : message;
                    this.textTy = data.additional.type;
                }
            }
        }
        else if (data.type == "serverMessage") {
            const t = `Server: ${data.message}`;
            this.text.innerText = t;
            this.debugLog(t);
        }
        else if (data.type == "connectionStatus") {
            this.debugLog(`Connection status: ${data.status}`);
        }
    }
}
function startApp() {
    return __awaiter(this, void 0, void 0, function* () {
        const api = yield getApi();
        const rootElement = document.getElementById("root");
        if (rootElement == null) {
            showErrorPopup("couldn't find root element", true);
            return;
        }
        // Get Host and App via Query
        const queryParams = new URLSearchParams(location.search);
        const hostIdStr = queryParams.get("hostId");
        const appIdStr = queryParams.get("appId");
        if (hostIdStr == null || appIdStr == null) {
            yield showMessage("No Host or no App Id found");
            window.close();
            return;
        }
        const hostId = Number.parseInt(hostIdStr);
        const appId = Number.parseInt(appIdStr);
        yield loadStaticAppSettingsFile();
        // event propagation on overlays
        const sidebarRoot = getSidebarRoot();
        if (sidebarRoot) {
            stopPropagationOn(sidebarRoot);
        }
        const modalBackground = getModalBackground();
        if (modalBackground) {
            stopPropagationOn(modalBackground);
        }
        // Start and Mount App
        const app = new ViewerApp(api, hostId, appId);
        app.mount(rootElement);
        window["app"] = app;
    });
}
// Prevent starting transition
window.requestAnimationFrame(() => {
    var _a;
    // Note: elements is a live array
    const elements = document.getElementsByClassName("prevent-start-transition");
    while (elements.length > 0) {
        (_a = elements.item(0)) === null || _a === void 0 ? void 0 : _a.classList.remove("prevent-start-transition");
    }
});
startApp();
function formatTransferBytes(n) {
    if (n < 1024)
        return `${n} B`;
    if (n < 1048576)
        return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
}
class ViewerApp {
    constructor(api, hostId, appId) {
        this.div = document.createElement("div");
        this.statsDiv = document.createElement("div");
        this.stream = null;
        this.inputConfig = defaultStreamInputConfig();
        this.fullscreenExitCircle = null;
        this.fullscreenExitCircleArc = null;
        this.fullscreenExitCircleLogo = null;
        this.fullscreenExitCircleCircumference = 0;
        this.fullscreenExitEscAnimationFrame = null;
        this.fullscreenExitEscActive = false;
        this.fileTransferProgressCircle = null;
        this.fileTransferProgressArc = null;
        this.fileTransferProgressCircumference = 0;
        this.fileTransferProgressLabel = null;
        this.fileTransferProgressHideTimer = null;
        /** One-line status for clipboard (click ring or Ctrl+Shift+C). */
        this.fileTransferLastStatus = "";
        /** Avoid sending matching keyup to host after we skipped keydown (Ctrl/Cmd+Shift+V paste / copy-progress). */
        this.skipNextHostKeyUpCodes = new Set();
        this.keyWatchdogInterval = null;
        this.devConnectionLog = null;
        this.devConnectionLogPoll = null;
        this.lastSidebarAnchorKey = "";
        this.streamConnectionConsoleLogger = new StreamConnectionInfoConsoleLogger();
        this.isTogglingFullscreenWithKeybind = "none";
        this.api = api;
        this.hostId = hostId;
        this.appId = appId;
        MoonlightFullscreenOverlay.show(() => {
            void this.requestFullscreen();
        });
        // Configure sidebar
        this.sidebar = new ViewerSidebar(this);
        setSidebar(this.sidebar);
        // Configure stats element
        this.statsDiv.hidden = true;
        this.statsDiv.classList.add("video-stats");
        setInterval(() => {
            var _a;
            // Update stats display every 100ms
            const stats = (_a = this.getStream()) === null || _a === void 0 ? void 0 : _a.getStats();
            if (stats && stats.isEnabled()) {
                this.statsDiv.hidden = false;
                const text = streamStatsToText(stats.getCurrentStats());
                this.statsDiv.innerText = text;
            }
            else {
                this.statsDiv.hidden = true;
            }
        }, 100);
        this.div.appendChild(this.statsDiv);
        this.createFullscreenExitCircle();
        this.createFileTransferProgressCircle();
        if (shouldAttachDevConnectionLog()) {
            this.devConnectionLog = new DevStreamConnectionLog();
            const syncDevLogVisibility = () => {
                var _a;
                (_a = this.devConnectionLog) === null || _a === void 0 ? void 0 : _a.applyDesiredVisibility(computeDevConnectionLogPanelVisible());
            };
            this.devConnectionLogPoll = window.setInterval(syncDevLogVisibility, 500);
            syncDevLogVisibility();
        }
        // Configure stream (per-app: from localStorage or app_settings.json)
        const settings = getSettingsForApp(appId);
        let browserWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        let browserHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        this.previousMouseMode = this.inputConfig.mouseMode;
        this.toggleFullscreenWithKeybind = settings.toggleFullscreenWithKeybind;
        this.startStream(hostId, appId, settings, [browserWidth, browserHeight]);
        this.settings = settings;
        // Configure input
        this.addListeners(document);
        this.addListeners(document.getElementById("input"));
        window.addEventListener("blur", () => {
            this.releaseAllKeys("window blur");
        });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState !== "visible") {
                this.releaseAllKeys("document hidden");
            }
        });
        window.addEventListener("ml-modal-visibility", () => {
            this.releaseAllKeys("modal visibility changed");
        });
        window.addEventListener("ml-sidebar-extended-change", () => {
            this.releaseAllKeys("sidebar expanded or collapsed");
        });
        document.addEventListener("pointerlockchange", this.onPointerLockChange.bind(this));
        document.addEventListener("fullscreenchange", this.onFullscreenChange.bind(this));
        this.keyWatchdogInterval = window.setInterval(() => {
            var _a;
            const stream = this.stream;
            const isInputFocused = this.isStreamInputFocused();
            const modalBackground = getModalBackground();
            const modalActive = modalBackground ? !modalBackground.classList.contains("modal-disabled") : false;
            const sidebarExpanded = !!((_a = getSidebarRoot()) === null || _a === void 0 ? void 0 : _a.classList.contains("sidebar-show"));
            const pointerLockLost = this.getInputConfig().mouseMode === "relative" && !document.pointerLockElement;
            const shouldForceRelease = !isInputFocused || modalActive || sidebarExpanded || pointerLockLost;
            stream === null || stream === void 0 ? void 0 : stream.getInput().watchdogTick(shouldForceRelease);
        }, ViewerApp.KEY_WATCHDOG_INTERVAL_MS);
        window.addEventListener("gamepadconnected", this.onGamepadConnect.bind(this));
        window.addEventListener("gamepaddisconnected", this.onGamepadDisconnect.bind(this));
        // Connect all gamepads
        for (const gamepad of navigator.getGamepads()) {
            if (gamepad != null) {
                this.onGamepadAdd(gamepad);
            }
        }
    }
    addListeners(element) {
        element.addEventListener("keydown", this.onKeyDown.bind(this), { passive: false });
        element.addEventListener("keyup", this.onKeyUp.bind(this), { passive: false });
        element.addEventListener("paste", this.onPaste.bind(this));
        element.addEventListener("mousedown", this.onMouseButtonDown.bind(this), { passive: false });
        element.addEventListener("mouseup", this.onMouseButtonUp.bind(this), { passive: false });
        element.addEventListener("mousemove", this.onMouseMove.bind(this), { passive: false });
        element.addEventListener("wheel", this.onMouseWheel.bind(this), { passive: false });
        element.addEventListener("contextmenu", this.onContextMenu.bind(this), { passive: false });
        element.addEventListener("touchstart", this.onTouchStart.bind(this), { passive: false });
        element.addEventListener("touchend", this.onTouchEnd.bind(this), { passive: false });
        element.addEventListener("touchcancel", this.onTouchCancel.bind(this), { passive: false });
        element.addEventListener("touchmove", this.onTouchMove.bind(this), { passive: false });
    }
    startStream(hostId, appId, settings, browserSize) {
        return __awaiter(this, void 0, void 0, function* () {
            // Hard-lock sidebar/icon to the left edge.
            setSidebarStyle({
                edge: "left",
            });
            MoonlightLoadingScreen.show();
            this.stream = new Stream(this.api, hostId, appId, settings, browserSize);
            // Add app info listener
            this.stream.addInfoListener(this.onInfo.bind(this));
            this.stream.addInfoListener(this.streamConnectionConsoleLogger.onInfo.bind(this.streamConnectionConsoleLogger));
            if (this.devConnectionLog) {
                this.stream.addInfoListener(this.devConnectionLog.onInfo.bind(this.devConnectionLog));
            }
            // Start animation frame loop
            this.onTouchUpdate();
            this.onGamepadUpdate();
            this.stream.getInput().addScreenKeyboardVisibleEvent(this.onScreenKeyboardSetVisible.bind(this));
            this.stream.mount(this.div);
            this.moveSidebarRootIntoStreamLayer();
        });
    }
    getAppId() {
        return this.appId;
    }
    getHostId() {
        return this.hostId;
    }
    /** Graceful restart: stop current stream, then start again with new settings (no page refresh). */
    restartStreamWithNewSettings(settings) {
        return __awaiter(this, void 0, void 0, function* () {
            const stream = this.stream;
            if (stream) {
                this.releaseAllKeys("before stream restart");
                const success = yield stream.stop();
                if (!success) {
                    console.debug("Restart: stream stop reported failure, continuing anyway");
                }
                stream.unmount(this.div);
                this.stream = null;
            }
            this.settings = settings;
            const browserWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
            const browserHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
            yield this.startStream(this.hostId, this.appId, settings, [browserWidth, browserHeight]);
        });
    }
    onInfo(event) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const data = event.detail;
            if (data.type == "app") {
                const app = data.app;
                document.title = `Stream: ${app.title}`;
            }
            else if (data.type == "connectionComplete") {
                this.sidebar.onCapabilitiesChange(data.capabilities);
                MoonlightLoadingScreen.hide();
            }
            else if (data.type == "addDebugLine") {
                const message = data.line.trim();
                if (message &&
                    data.additional &&
                    (data.additional.type === "fatal" || data.additional.type === "fatalDescription")) {
                    showErrorPopup(message);
                    MoonlightLoadingScreen.hide();
                }
                else if (((_a = data.additional) === null || _a === void 0 ? void 0 : _a.type) === "informError") {
                    showErrorPopup(data.line);
                }
            }
            else if (data.type == "serverMessage") {
                MoonlightLoadingScreen.setSubtitle(`Server: ${data.message}`);
            }
            else if (data.type == "fileTransferProgress") {
                this.updateFileTransferProgressCircle(data.percent, data.loaded, data.total, data.source);
            }
            else if (data.type == "fileTransferProgressEnd") {
                this.hideFileTransferProgressCircleImmediate();
            }
        });
    }
    focusInput() {
        var _a;
        if (((_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().getCurrentPredictedTouchAction()) != "screenKeyboard" && !this.sidebar.getScreenKeyboard().isVisible()) {
            const inputElement = document.getElementById("input");
            inputElement.focus();
        }
    }
    onUserInteraction() {
        this.focusInput();
        this.notifyStreamInteraction();
    }
    notifyStreamInteraction() {
        var _a, _b, _c, _d;
        (_b = (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getVideoRenderer()) === null || _b === void 0 ? void 0 : _b.onUserInteraction();
        (_d = (_c = this.stream) === null || _c === void 0 ? void 0 : _c.getAudioPlayer()) === null || _d === void 0 ? void 0 : _d.onUserInteraction();
    }
    releaseAllKeys(reason) {
        var _a;
        console.debug(`[Keyboard]: Reset all keys (${reason})`);
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onInputContextLost();
    }
    resetKeysForLifecycle(reason) {
        this.releaseAllKeys(reason);
    }
    isStreamInputFocused() {
        const inputElement = document.getElementById("input");
        return !!inputElement && document.activeElement === inputElement;
    }
    shouldForwardKeyboardEvent() {
        return this.isStreamInputFocused();
    }
    addConsumedShortcutSuppressions(event, consumedCode) {
        this.skipNextHostKeyUpCodes.add(consumedCode);
        if (event.ctrlKey) {
            this.skipNextHostKeyUpCodes.add("ControlLeft");
            this.skipNextHostKeyUpCodes.add("ControlRight");
        }
        if (event.shiftKey) {
            this.skipNextHostKeyUpCodes.add("ShiftLeft");
            this.skipNextHostKeyUpCodes.add("ShiftRight");
        }
        if (event.altKey) {
            this.skipNextHostKeyUpCodes.add("AltLeft");
            this.skipNextHostKeyUpCodes.add("AltRight");
        }
        if (event.metaKey) {
            this.skipNextHostKeyUpCodes.add("MetaLeft");
            this.skipNextHostKeyUpCodes.add("MetaRight");
        }
    }
    onScreenKeyboardSetVisible(event) {
        console.info(event.detail);
        const screenKeyboard = this.sidebar.getScreenKeyboard();
        const newShown = event.detail.visible;
        if (newShown != screenKeyboard.isVisible()) {
            if (newShown) {
                screenKeyboard.show();
            }
            else {
                screenKeyboard.hide();
            }
        }
    }
    // Input
    getInputConfig() {
        return this.inputConfig;
    }
    setInputConfig(config) {
        var _a;
        Object.assign(this.inputConfig, config);
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().setConfig(this.inputConfig);
    }
    // Keyboard
    onKeyDown(event) {
        var _a, _b;
        this.notifyStreamInteraction();
        console.debug(event);
        if (event.code === "Escape" && this.isFullscreen()) {
            this.startFullscreenExitEscHold();
        }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "KeyC") {
            if (this.isFileTransferProgressVisible() && this.fileTransferLastStatus) {
                event.preventDefault();
                event.stopPropagation();
                this.addConsumedShortcutSuppressions(event, "KeyC");
                this.releaseAllKeys("consumed Ctrl/Cmd+Shift+C shortcut");
                void navigator.clipboard.writeText(this.fileTransferLastStatus).catch((e) => {
                    console.warn("[Stream]: could not copy transfer status", e);
                });
                return;
            }
        }
        // Ctrl/Cmd+Shift+V: read clipboard and send text to host (Ctrl/Cmd+V is forwarded as normal keys).
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "KeyV") {
            if (!this.shouldForwardKeyboardEvent()) {
                this.releaseAllKeys("Ctrl/Cmd+Shift+V blocked because stream input is not focused");
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            this.addConsumedShortcutSuppressions(event, "KeyV");
            this.releaseAllKeys("consumed Ctrl/Cmd+Shift+V paste shortcut");
            const input = (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput();
            if (input === null || input === void 0 ? void 0 : input.isConnected()) {
                void navigator.clipboard.readText().then((text) => {
                    if (text) {
                        input.pastePlainText(text);
                    }
                }).catch((e) => {
                    console.warn("[Stream]: clipboard read failed (Ctrl/Cmd+Shift+V)", e);
                });
            }
            return;
        }
        else if (event.code == "F11") {
            // Allow manual fullscreen
        }
        else {
            if (!this.shouldForwardKeyboardEvent()) {
                this.releaseAllKeys("keydown blocked because stream input is not focused");
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            event.preventDefault();
            (_b = this.stream) === null || _b === void 0 ? void 0 : _b.getInput().onKeyDown(event);
        }
        event.stopPropagation();
    }
    onKeyUp(event) {
        var _a;
        this.notifyStreamInteraction();
        if (event.code === "Escape") {
            this.cancelFullscreenExitEscHold();
        }
        if (this.skipNextHostKeyUpCodes.has(event.code)) {
            this.skipNextHostKeyUpCodes.delete(event.code);
            event.preventDefault();
        }
        else {
            if (!this.shouldForwardKeyboardEvent()) {
                this.releaseAllKeys("keyup blocked because stream input is not focused");
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            event.preventDefault();
            (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onKeyUp(event);
        }
        event.stopPropagation();
        if (this.toggleFullscreenWithKeybind && this.isTogglingFullscreenWithKeybind == "none" && event.ctrlKey && event.shiftKey && event.code == "KeyI") {
            this.isTogglingFullscreenWithKeybind = "waitForCtrl";
        }
        if (this.isTogglingFullscreenWithKeybind == "waitForCtrl" && (event.code == "ControlRight" || event.code == "ControlLeft")) {
            this.isTogglingFullscreenWithKeybind = "makingFullscreen";
            (() => __awaiter(this, void 0, void 0, function* () {
                if (this.isFullscreen()) {
                    yield this.exitPointerLock();
                    yield this.exitFullscreen();
                }
                else {
                    yield this.requestFullscreen();
                    yield this.requestPointerLock();
                }
                this.isTogglingFullscreenWithKeybind = "none";
            }))();
        }
    }
    onPaste(event) {
        var _a, _b;
        this.onUserInteraction();
        const files = (_a = event.clipboardData) === null || _a === void 0 ? void 0 : _a.files;
        const input = (_b = this.stream) === null || _b === void 0 ? void 0 : _b.getInput();
        // Copied files from Explorer (etc.): upload like drag-and-drop to the configured host folder.
        if (files && files.length > 0 && (input === null || input === void 0 ? void 0 : input.isConnected())) {
            event.preventDefault();
            void (() => __awaiter(this, void 0, void 0, function* () {
                const s = this.stream;
                for (let i = 0; i < files.length; i++) {
                    try {
                        yield s.uploadFileToHost(files[i]);
                    }
                    catch (e) {
                        console.warn("[Stream]: paste file upload failed", e);
                    }
                }
            }))();
            event.stopPropagation();
            return;
        }
        // Text (usernames, passwords, etc.) goes through the keyboard channel into the focused host app.
        input === null || input === void 0 ? void 0 : input.onPaste(event);
        event.stopPropagation();
    }
    // Mouse
    onMouseButtonDown(event) {
        var _a;
        this.onUserInteraction();
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onMouseDown(event, this.getStreamRect());
        event.stopPropagation();
    }
    onMouseButtonUp(event) {
        var _a;
        this.onUserInteraction();
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onMouseUp(event);
        event.stopPropagation();
    }
    onMouseMove(event) {
        var _a;
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onMouseMove(event, this.getStreamRect());
        event.stopPropagation();
    }
    onMouseWheel(event) {
        var _a;
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onMouseWheel(event);
        event.stopPropagation();
    }
    onContextMenu(event) {
        event.preventDefault();
        event.stopPropagation();
    }
    // Touch
    onTouchStart(event) {
        var _a;
        this.onUserInteraction();
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onTouchStart(event, this.getStreamRect());
        event.stopPropagation();
    }
    onTouchEnd(event) {
        var _a;
        this.onUserInteraction();
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onTouchEnd(event, this.getStreamRect());
        event.stopPropagation();
    }
    onTouchCancel(event) {
        var _a;
        this.onUserInteraction();
        event === null || event === void 0 ? void 0 : event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onTouchCancel(event, this.getStreamRect());
        event.stopPropagation();
    }
    onTouchUpdate() {
        var _a;
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onTouchUpdate(this.getStreamRect());
        this.updateSidebarAnchorToStreamRect();
        window.requestAnimationFrame(this.onTouchUpdate.bind(this));
    }
    onTouchMove(event) {
        var _a;
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onTouchMove(event, this.getStreamRect());
        event.stopPropagation();
    }
    // Gamepad
    onGamepadConnect(event) {
        this.onGamepadAdd(event.gamepad);
    }
    onGamepadAdd(gamepad) {
        var _a;
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onGamepadConnect(gamepad);
    }
    onGamepadDisconnect(event) {
        var _a;
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onGamepadDisconnect(event);
    }
    onGamepadUpdate() {
        var _a;
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onGamepadUpdate();
        window.requestAnimationFrame(this.onGamepadUpdate.bind(this));
    }
    // Fullscreen
    createFullscreenExitCircle() {
        const body = document.body;
        if (!body)
            return;
        const SIZE = 48;
        const RADIUS = 18;
        const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
        const wrapper = document.createElement("div");
        wrapper.style.position = "fixed";
        wrapper.style.top = "12px";
        wrapper.style.right = "12px";
        wrapper.style.width = `${SIZE}px`;
        wrapper.style.height = `${SIZE}px`;
        wrapper.style.zIndex = "10000";
        wrapper.style.display = "none";
        wrapper.style.cursor = "default";
        wrapper.style.borderRadius = "50%";
        wrapper.style.backdropFilter = "blur(8px)";
        wrapper.style.setProperty("-webkit-backdrop-filter", "blur(8px)");
        wrapper.style.background = "rgba(20, 20, 22, 0.75)";
        wrapper.style.boxShadow = "0 2px 12px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.08)";
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
        svg.setAttribute("width", `${SIZE}`);
        svg.setAttribute("height", `${SIZE}`);
        svg.style.position = "absolute";
        svg.style.top = "0";
        svg.style.left = "0";
        const borderCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        borderCircle.setAttribute("cx", "24");
        borderCircle.setAttribute("cy", "24");
        borderCircle.setAttribute("r", `${RADIUS}`);
        borderCircle.setAttribute("fill", "none");
        borderCircle.setAttribute("stroke", "rgba(255,255,255,0.08)");
        borderCircle.setAttribute("stroke-width", "3");
        const arc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        arc.setAttribute("cx", "24");
        arc.setAttribute("cy", "24");
        arc.setAttribute("r", `${RADIUS}`);
        arc.setAttribute("fill", "none");
        arc.setAttribute("stroke", "rgba(255,255,255,0.85)");
        arc.setAttribute("stroke-width", "3");
        arc.setAttribute("stroke-dasharray", `${CIRCUMFERENCE}`);
        arc.setAttribute("stroke-dashoffset", `${CIRCUMFERENCE}`);
        arc.setAttribute("stroke-linecap", "round");
        arc.setAttribute("transform", "rotate(-90 24 24)");
        svg.appendChild(borderCircle);
        svg.appendChild(arc);
        const logoImg = document.createElement("img");
        logoImg.src = "./resources/sidebar-button-icon.png";
        logoImg.alt = "Moonlight";
        logoImg.style.position = "absolute";
        logoImg.style.top = "50%";
        logoImg.style.left = "50%";
        logoImg.style.width = "34px";
        logoImg.style.height = "34px";
        logoImg.style.transform = "translate(-50%, -50%)";
        logoImg.style.pointerEvents = "none";
        logoImg.style.opacity = "0.85";
        logoImg.style.transition = "opacity 0.08s ease";
        wrapper.appendChild(svg);
        wrapper.appendChild(logoImg);
        body.appendChild(wrapper);
        this.fullscreenExitCircle = wrapper;
        this.fullscreenExitCircleArc = arc;
        this.fullscreenExitCircleCircumference = CIRCUMFERENCE;
        this.fullscreenExitCircleLogo = logoImg;
    }
    startFullscreenExitEscHold() {
        if (!this.fullscreenExitCircle || this.fullscreenExitEscActive || !this.isFullscreen())
            return;
        this.fullscreenExitEscActive = true;
        this.fullscreenExitCircle.style.display = "block";
        const arc = this.fullscreenExitCircleArc;
        const logo = this.fullscreenExitCircleLogo;
        const circumference = this.fullscreenExitCircleCircumference;
        const duration = 750;
        const start = performance.now();
        let flickerVisible = true;
        const flickerInterval = window.setInterval(() => {
            if (!this.fullscreenExitEscActive) {
                window.clearInterval(flickerInterval);
                if (logo)
                    logo.style.opacity = "1";
                return;
            }
            flickerVisible = !flickerVisible;
            if (logo)
                logo.style.opacity = flickerVisible ? "1" : "0.15";
        }, 200);
        const animate = (now) => {
            if (!this.fullscreenExitEscActive || !this.isFullscreen()) {
                window.clearInterval(flickerInterval);
                this.fullscreenExitCircle.style.display = "none";
                arc === null || arc === void 0 ? void 0 : arc.setAttribute("stroke-dashoffset", `${circumference}`);
                if (logo)
                    logo.style.opacity = "1";
                return;
            }
            const t = Math.min(1, (now - start) / duration);
            arc === null || arc === void 0 ? void 0 : arc.setAttribute("stroke-dashoffset", `${circumference * (1 - t)}`);
            if (t < 1) {
                this.fullscreenExitEscAnimationFrame = window.requestAnimationFrame(animate);
            }
            else {
                window.clearInterval(flickerInterval);
                this.fullscreenExitEscAnimationFrame = null;
                this.fullscreenExitEscActive = false;
                this.fullscreenExitCircle.style.display = "none";
                arc === null || arc === void 0 ? void 0 : arc.setAttribute("stroke-dashoffset", `${circumference}`);
                if (logo)
                    logo.style.opacity = "1";
                void this.exitPointerLock();
                void this.exitFullscreen();
            }
        };
        this.fullscreenExitEscAnimationFrame = window.requestAnimationFrame(animate);
    }
    cancelFullscreenExitEscHold() {
        var _a;
        if (!this.fullscreenExitCircle)
            return;
        this.fullscreenExitEscActive = false;
        if (this.fullscreenExitEscAnimationFrame != null) {
            window.cancelAnimationFrame(this.fullscreenExitEscAnimationFrame);
            this.fullscreenExitEscAnimationFrame = null;
        }
        this.fullscreenExitCircle.style.display = "none";
        (_a = this.fullscreenExitCircleArc) === null || _a === void 0 ? void 0 : _a.setAttribute("stroke-dashoffset", `${this.fullscreenExitCircleCircumference}`);
        if (this.fullscreenExitCircleLogo)
            this.fullscreenExitCircleLogo.style.opacity = "1";
    }
    createFileTransferProgressCircle() {
        const body = document.body;
        if (!body)
            return;
        const SIZE = 56;
        const RADIUS = 21;
        const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
        const CXY = 28;
        const wrapper = document.createElement("div");
        wrapper.style.position = "fixed";
        wrapper.style.top = "12px";
        wrapper.style.left = "12px";
        wrapper.style.width = `${SIZE}px`;
        wrapper.style.height = `${SIZE}px`;
        wrapper.style.zIndex = "10000";
        wrapper.style.display = "none";
        wrapper.style.pointerEvents = "none";
        wrapper.style.borderRadius = "50%";
        wrapper.style.backdropFilter = "blur(8px)";
        wrapper.style.setProperty("-webkit-backdrop-filter", "blur(8px)");
        wrapper.style.background = "rgba(20, 20, 22, 0.75)";
        wrapper.style.boxShadow = "0 2px 12px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.08)";
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
        svg.setAttribute("width", `${SIZE}`);
        svg.setAttribute("height", `${SIZE}`);
        svg.style.position = "absolute";
        svg.style.top = "0";
        svg.style.left = "0";
        const borderCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        borderCircle.setAttribute("cx", `${CXY}`);
        borderCircle.setAttribute("cy", `${CXY}`);
        borderCircle.setAttribute("r", `${RADIUS}`);
        borderCircle.setAttribute("fill", "none");
        borderCircle.setAttribute("stroke", "rgba(255,255,255,0.08)");
        borderCircle.setAttribute("stroke-width", "3");
        const arc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        arc.setAttribute("cx", `${CXY}`);
        arc.setAttribute("cy", `${CXY}`);
        arc.setAttribute("r", `${RADIUS}`);
        arc.setAttribute("fill", "none");
        arc.setAttribute("stroke", "rgba(255,255,255,0.85)");
        arc.setAttribute("stroke-width", "3");
        arc.setAttribute("stroke-dasharray", `${CIRCUMFERENCE}`);
        arc.setAttribute("stroke-dashoffset", `${CIRCUMFERENCE}`);
        arc.setAttribute("stroke-linecap", "round");
        arc.setAttribute("transform", `rotate(-90 ${CXY} ${CXY})`);
        svg.appendChild(borderCircle);
        svg.appendChild(arc);
        const label = document.createElement("span");
        label.textContent = "0%";
        label.style.position = "absolute";
        label.style.top = "50%";
        label.style.left = "50%";
        label.style.transform = "translate(-50%, -50%)";
        label.style.font = "600 7px system-ui, sans-serif";
        label.style.color = "rgba(255,255,255,0.9)";
        label.style.pointerEvents = "none";
        label.style.lineHeight = "1.05";
        label.style.letterSpacing = "-0.02em";
        label.style.whiteSpace = "pre-line";
        label.style.textAlign = "center";
        label.style.maxWidth = `${SIZE - 6}px`;
        label.style.userSelect = "none";
        wrapper.addEventListener("mousedown", (e) => {
            if (wrapper.style.display === "block")
                e.stopPropagation();
        });
        wrapper.addEventListener("mouseup", (e) => {
            if (wrapper.style.display === "block")
                e.stopPropagation();
        });
        wrapper.addEventListener("click", (e) => {
            var _a;
            if (wrapper.style.display !== "block" || !this.fileTransferLastStatus)
                return;
            e.stopPropagation();
            void navigator.clipboard.writeText(this.fileTransferLastStatus).catch((e) => {
                console.warn("[Stream]: could not copy transfer status", e);
            });
            (_a = document.getElementById("input")) === null || _a === void 0 ? void 0 : _a.focus();
        });
        wrapper.appendChild(svg);
        wrapper.appendChild(label);
        body.appendChild(wrapper);
        this.fileTransferProgressCircle = wrapper;
        this.fileTransferProgressArc = arc;
        this.fileTransferProgressCircumference = CIRCUMFERENCE;
        this.fileTransferProgressLabel = label;
    }
    isFileTransferProgressVisible() {
        return this.fileTransferProgressCircle != null && this.fileTransferProgressCircle.style.display === "block";
    }
    updateFileTransferProgressCircle(percent, loaded, total, source) {
        if (!this.fileTransferProgressCircle || !this.fileTransferProgressArc || !this.fileTransferProgressLabel)
            return;
        if (this.fileTransferProgressHideTimer != null) {
            clearTimeout(this.fileTransferProgressHideTimer);
            this.fileTransferProgressHideTimer = null;
        }
        const clamped = Math.max(0, Math.min(100, Math.round(percent)));
        const c = this.fileTransferProgressCircumference;
        const isClipboard = source === "clipboard";
        const kindPrefix = isClipboard ? "Clipboard: " : "";
        const kindName = isClipboard ? "Clipboard sync" : "File transfer";
        this.fileTransferProgressCircle.style.display = "block";
        this.fileTransferProgressCircle.style.pointerEvents = "auto";
        this.fileTransferProgressCircle.style.cursor = "pointer";
        this.fileTransferProgressLabel.style.userSelect = "text";
        this.fileTransferProgressLabel.style.cursor = "text";
        this.fileTransferProgressLabel.style.pointerEvents = "auto";
        const copyHint = " · Click or Ctrl+Shift+C to copy status";
        if (loaded !== undefined && total !== undefined && total > 0) {
            const body = `${clamped}%\n${formatTransferBytes(loaded)}/${formatTransferBytes(total)}`;
            this.fileTransferProgressLabel.textContent = isClipboard ? `Clipboard\n${body}` : body;
            const detail = `${kindPrefix}${formatTransferBytes(loaded)} / ${formatTransferBytes(total)} (${clamped}%)`;
            this.fileTransferProgressCircle.title = detail + copyHint;
            this.fileTransferLastStatus = `${kindName}: ${clamped}% (${formatTransferBytes(loaded)} / ${formatTransferBytes(total)})`;
        }
        else {
            this.fileTransferProgressLabel.textContent = isClipboard ? `Clipboard\n${clamped}%` : `${clamped}%`;
            this.fileTransferProgressCircle.title =
                (isClipboard ? "Clipboard" : "File transfer") + ` ${clamped}%` + copyHint;
            this.fileTransferLastStatus = `${kindName}: ${clamped}%`;
        }
        this.fileTransferProgressArc.setAttribute("stroke-dashoffset", `${c * (1 - clamped / 100)}`);
        if (clamped >= 100) {
            this.fileTransferProgressHideTimer = setTimeout(() => {
                this.fileTransferProgressHideTimer = null;
                this.hideFileTransferProgressCircleImmediate();
            }, 500);
        }
    }
    hideFileTransferProgressCircleImmediate() {
        if (this.fileTransferProgressHideTimer != null) {
            clearTimeout(this.fileTransferProgressHideTimer);
            this.fileTransferProgressHideTimer = null;
        }
        if (!this.fileTransferProgressCircle || !this.fileTransferProgressArc || !this.fileTransferProgressLabel)
            return;
        this.fileTransferProgressCircle.style.display = "none";
        this.fileTransferProgressCircle.style.pointerEvents = "none";
        this.fileTransferProgressCircle.style.cursor = "";
        this.fileTransferProgressCircle.title = "";
        this.fileTransferLastStatus = "";
        this.fileTransferProgressLabel.textContent = "0%";
        this.fileTransferProgressLabel.style.userSelect = "none";
        this.fileTransferProgressLabel.style.pointerEvents = "none";
        this.fileTransferProgressLabel.style.cursor = "";
        this.fileTransferProgressArc.setAttribute("stroke-dashoffset", `${this.fileTransferProgressCircumference}`);
    }
    requestFullscreen() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const body = document.body;
            if (body) {
                if (!("requestFullscreen" in body && typeof body.requestFullscreen == "function")) {
                    yield showMessage("Fullscreen is not supported by your browser!");
                    return;
                }
                this.focusInput();
                if (!this.isFullscreen()) {
                    try {
                        yield body.requestFullscreen({
                            navigationUI: "hide"
                        });
                    }
                    catch (e) {
                        console.warn("failed to request fullscreen", e);
                    }
                }
                if ("keyboard" in navigator && navigator.keyboard && "lock" in navigator.keyboard) {
                    yield navigator.keyboard.lock();
                }
                if (((_a = this.getStream()) === null || _a === void 0 ? void 0 : _a.getInput().getConfig().mouseMode) == "relative") {
                    yield this.requestPointerLock();
                }
                try {
                    if (screen && "orientation" in screen) {
                        const orientation = screen.orientation;
                        if ("lock" in orientation && typeof orientation.lock == "function") {
                            yield orientation.lock("landscape");
                        }
                    }
                }
                catch (e) {
                    console.warn("failed to set orientation to landscape", e);
                }
            }
            else {
                console.warn("root element not found");
            }
        });
    }
    exitFullscreen() {
        return __awaiter(this, void 0, void 0, function* () {
            if ("keyboard" in navigator && navigator.keyboard && "unlock" in navigator.keyboard) {
                yield navigator.keyboard.unlock();
            }
            if ("exitFullscreen" in document && typeof document.exitFullscreen == "function") {
                yield document.exitFullscreen();
            }
        });
    }
    isFullscreen() {
        return "fullscreenElement" in document && !!document.fullscreenElement;
    }
    onFullscreenChange() {
        return __awaiter(this, void 0, void 0, function* () {
            this.checkFullyImmersed();
            if (!this.isFullscreen()) {
                this.cancelFullscreenExitEscHold();
                this.releaseAllKeys("fullscreen exited");
            }
            else {
                MoonlightFullscreenOverlay.hide();
                this.releaseAllKeys("fullscreen entered");
            }
        });
    }
    // Pointer Lock
    requestPointerLock() {
        return __awaiter(this, arguments, void 0, function* (errorIfNotFound = false) {
            this.previousMouseMode = this.inputConfig.mouseMode;
            const inputElement = document.getElementById("input");
            if (inputElement && "requestPointerLock" in inputElement && typeof inputElement.requestPointerLock == "function") {
                this.focusInput();
                this.inputConfig.mouseMode = "relative";
                this.setInputConfig(this.inputConfig);
                setSidebarExtended(false);
                const onLockError = () => {
                    document.removeEventListener("pointerlockerror", onLockError);
                    // Fallback: try to request pointer lock without options
                    inputElement.requestPointerLock();
                };
                document.addEventListener("pointerlockerror", onLockError, { once: true });
                try {
                    let promise = inputElement.requestPointerLock({
                        unadjustedMovement: true
                    });
                    if (promise) {
                        yield promise;
                    }
                    else {
                        inputElement.requestPointerLock();
                    }
                }
                catch (error) {
                    // Some platforms do not support unadjusted movement. If you
                    // would like PointerLock anyway, request again.
                    if (error instanceof Error && error.name == "NotSupportedError") {
                        inputElement.requestPointerLock();
                    }
                    else {
                        throw error;
                    }
                }
                finally {
                    document.removeEventListener("pointerlockerror", onLockError);
                }
            }
            else if (errorIfNotFound) {
                yield showMessage("Pointer Lock not supported");
            }
        });
    }
    exitPointerLock() {
        return __awaiter(this, void 0, void 0, function* () {
            if ("exitPointerLock" in document && typeof document.exitPointerLock == "function") {
                document.exitPointerLock();
            }
        });
    }
    onPointerLockChange() {
        this.checkFullyImmersed();
        this.releaseAllKeys(document.pointerLockElement ? "pointer lock entered" : "pointer lock exited");
        if (!document.pointerLockElement) {
            this.inputConfig.mouseMode = this.previousMouseMode;
            this.setInputConfig(this.inputConfig);
        }
    }
    // -- Fully immersed Fullscreen -> Fullscreen API + Pointer Lock
    checkFullyImmersed() {
        if ("pointerLockElement" in document && document.pointerLockElement &&
            "fullscreenElement" in document && document.fullscreenElement) {
            // We're fully immersed -> remove sidebar
            setSidebar(null);
        }
        else {
            setSidebar(this.sidebar);
        }
        this.updateSidebarAnchorToStreamRect();
    }
    mount(parent) {
        parent.appendChild(this.div);
    }
    unmount(parent) {
        if (this.keyWatchdogInterval != null) {
            clearInterval(this.keyWatchdogInterval);
            this.keyWatchdogInterval = null;
        }
        this.releaseAllKeys("viewer app unmount");
        parent.removeChild(this.div);
    }
    getStreamRect() {
        var _a, _b, _c;
        // The bounding rect of the videoElement or canvasElement can be bigger than the actual video
        // -> We need to correct for this when sending positions, else positions are wrong
        return (_c = (_b = (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getVideoRenderer()) === null || _b === void 0 ? void 0 : _b.getStreamRect()) !== null && _c !== void 0 ? _c : new DOMRect();
    }
    updateSidebarAnchorToStreamRect() {
        const sidebarRoot = getSidebarRoot();
        if (!sidebarRoot) {
            return;
        }
        this.moveSidebarRootIntoStreamLayer();
        const streamRect = this.getStreamRect();
        const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        const hasValidRect = streamRect.width > 0 && streamRect.height > 0;
        if (!hasValidRect) {
            if (this.lastSidebarAnchorKey !== "viewport") {
                sidebarRoot.style.left = "";
                sidebarRoot.style.right = "";
                sidebarRoot.style.top = "";
                sidebarRoot.style.bottom = "";
                this.lastSidebarAnchorKey = "viewport";
            }
            return;
        }
        const edge = "left";
        const streamLeft = Math.max(0, Math.min(viewportWidth, streamRect.left));
        const streamRightInset = Math.max(0, Math.min(viewportWidth, viewportWidth - streamRect.right));
        const streamTop = Math.max(0, Math.min(viewportHeight, streamRect.top));
        const streamBottom = Math.max(0, Math.min(viewportHeight, streamRect.bottom));
        const streamBottomInset = Math.max(0, Math.min(viewportHeight, viewportHeight - streamRect.bottom));
        const streamCenterX = Math.max(0, Math.min(viewportWidth, streamRect.left + (streamRect.width / 2)));
        const streamCenterY = Math.max(0, Math.min(viewportHeight, streamRect.top + (streamRect.height / 2)));
        const dragOffsetY = getSidebarDragOffsetY();
        const sidebarBackground = sidebarRoot.querySelector(".sidebar-background");
        const sidebarBackgroundRect = sidebarBackground === null || sidebarBackground === void 0 ? void 0 : sidebarBackground.getBoundingClientRect();
        const sidebarHalfHeight = Math.max(24, ((sidebarBackgroundRect === null || sidebarBackgroundRect === void 0 ? void 0 : sidebarBackgroundRect.height) || 48) / 2);
        const anchorKey = `${edge}:${Math.round(streamLeft)}:${Math.round(streamRightInset)}:${Math.round(streamTop)}:${Math.round(streamBottomInset)}:${Math.round(streamCenterX)}:${Math.round(streamCenterY)}:${Math.round(sidebarHalfHeight)}:${Math.round(dragOffsetY)}`;
        if (anchorKey === this.lastSidebarAnchorKey) {
            return;
        }
        sidebarRoot.style.left = "";
        sidebarRoot.style.right = "";
        sidebarRoot.style.top = "";
        sidebarRoot.style.bottom = "";
        const minTop = streamTop + sidebarHalfHeight;
        const maxTop = streamBottom - sidebarHalfHeight;
        const fallbackTop = Math.max(streamTop, Math.min(streamBottom, streamCenterY));
        const clampSidebarTop = (desiredTop) => {
            if (minTop > maxTop) {
                return fallbackTop;
            }
            return Math.max(minTop, Math.min(maxTop, desiredTop));
        };
        if (edge === "right") {
            sidebarRoot.style.right = `${streamRightInset}px`;
            const desiredTop = streamCenterY + dragOffsetY;
            const clampedTop = clampSidebarTop(desiredTop);
            sidebarRoot.style.top = `${clampedTop}px`;
        }
        else if (edge === "up") {
            sidebarRoot.style.left = `${streamCenterX}px`;
            sidebarRoot.style.top = `${streamTop}px`;
        }
        else if (edge === "down") {
            sidebarRoot.style.left = `${streamCenterX}px`;
            sidebarRoot.style.bottom = `${streamBottomInset}px`;
        }
        else {
            sidebarRoot.style.left = `${streamLeft}px`;
            const desiredTop = streamCenterY + dragOffsetY;
            const clampedTop = clampSidebarTop(desiredTop);
            sidebarRoot.style.top = `${clampedTop}px`;
        }
        this.lastSidebarAnchorKey = anchorKey;
    }
    moveSidebarRootIntoStreamLayer() {
        const sidebarRoot = getSidebarRoot();
        const streamLayer = this.stream && this.stream.divElement instanceof HTMLElement ? this.stream.divElement : null;
        if (!sidebarRoot || !streamLayer) {
            return;
        }
        if (sidebarRoot.parentElement !== streamLayer) {
            streamLayer.appendChild(sidebarRoot);
        }
        const videoNode = streamLayer.querySelector("video.video-stream, canvas.video-stream");
        if (videoNode && sidebarRoot.nextSibling !== videoNode) {
            streamLayer.insertBefore(sidebarRoot, videoNode);
        }
    }
    getStream() {
        return this.stream;
    }
}
ViewerApp.KEY_WATCHDOG_INTERVAL_MS = 350;
/**
 * Mirrors ConnectionInfoModal's console logging (`debugLog` / `onInfo`) for stream-info events.
 * No modal UI, no showModal / showErrorPopup — ViewerApp.onInfo still handles UX for errors.
 */
class StreamConnectionInfoConsoleLogger {
    constructor() {
        this.lastFileTransferPercentLogged = -1;
        this.lastFileTransferLoadedLogged = -1;
        this.lastFileTransferLogTime = 0;
    }
    onInfo(event) {
        const data = event.detail;
        if (data.type == "connectionComplete") {
            console.info("[Stream]: Connection Complete");
        }
        else if (data.type == "addDebugLine") {
            const message = data.line.trim();
            if (message) {
                console.info(`[Stream]: ${message}`);
            }
        }
        else if (data.type == "serverMessage") {
            console.info(`[Stream]: Server: ${data.message}`);
        }
        else if (data.type == "app") {
            console.info(`[Stream]: App: ${data.app.title}`);
        }
        else if (data.type == "connectionStatus") {
            console.info(`[Stream]: Connection status: ${data.status}`);
        }
        else if (data.type == "fileTransferProgress") {
            const p = data.percent;
            const loaded = data.loaded;
            const total = data.total;
            const tag = data.source === "clipboard" ? "clipboardSync" : "fileTransfer";
            const prev = this.lastFileTransferPercentLogged;
            const now = Date.now();
            const hasBytes = loaded !== undefined && total !== undefined && total > 0;
            const byteStep = 512 * 1024;
            const movedBytes = hasBytes &&
                loaded - this.lastFileTransferLoadedLogged >= byteStep;
            const stalledHeartbeat = hasBytes &&
                loaded > this.lastFileTransferLoadedLogged &&
                now - this.lastFileTransferLogTime >= 2500;
            if (p === 0 ||
                p === 100 ||
                prev < 0 ||
                p >= prev + 10 ||
                (p > 0 && prev === 0) ||
                movedBytes ||
                stalledHeartbeat) {
                this.lastFileTransferPercentLogged = p;
                if (hasBytes) {
                    this.lastFileTransferLoadedLogged = loaded;
                    this.lastFileTransferLogTime = now;
                    console.info(`[Stream]: ${tag} ${p}% (${formatTransferBytes(loaded)}/${formatTransferBytes(total)})`);
                }
                else {
                    console.info(`[Stream]: ${tag} ${p}%`);
                }
            }
        }
        else if (data.type == "fileTransferProgressEnd") {
            const tag = data.source === "clipboard" ? "clipboardSync" : "fileTransfer";
            this.lastFileTransferPercentLogged = -1;
            this.lastFileTransferLoadedLogged = -1;
            this.lastFileTransferLogTime = 0;
            console.info(`[Stream]: ${tag} end (complete, error, or cancelled)`);
        }
    }
}
class ConnectionInfoModal {
    constructor() {
        this.eventTarget = new EventTarget();
        this.root = document.createElement("div");
        this.textTy = null;
        this.text = document.createElement("p");
        this.options = document.createElement("div");
        this.debugDetailButton = document.createElement("button");
        this.closeButton = document.createElement("button");
        this.debugDetail = ""; // We store this seperate because line breaks don't work when the element is not mounted on the dom
        this.debugDetailDisplay = document.createElement("div");
        this.root.classList.add("modal-video-connect");
        this.text.innerText = "Connecting";
        this.root.appendChild(this.text);
        this.root.appendChild(this.options);
        this.options.classList.add("modal-video-connect-options");
        this.debugDetailButton.innerText = "Show Logs";
        this.debugDetailButton.addEventListener("click", this.onDebugDetailClick.bind(this));
        this.options.appendChild(this.debugDetailButton);
        this.closeButton.innerText = "Close";
        this.closeButton.addEventListener("click", this.onClose.bind(this));
        this.options.appendChild(this.closeButton);
        this.debugDetailDisplay.classList.add("textlike");
        this.debugDetailDisplay.classList.add("modal-video-connect-debug");
    }
    onDebugDetailClick() {
        let debugDetailCurrentlyShown = this.root.contains(this.debugDetailDisplay);
        if (debugDetailCurrentlyShown) {
            this.debugDetailButton.innerText = "Show Logs";
            this.root.removeChild(this.debugDetailDisplay);
        }
        else {
            this.debugDetailButton.innerText = "Hide Logs";
            this.root.appendChild(this.debugDetailDisplay);
            this.debugDetailDisplay.innerText = this.debugDetail;
        }
    }
    debugLog(line) {
        this.debugDetail += `${line}\n`;
        this.debugDetailDisplay.innerText = this.debugDetail;
        console.info(`[Stream]: ${line}`);
    }
    onInfo(event) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const data = event.detail;
        if (data.type == "connectionComplete") {
            const text = `Connection Complete`;
            this.text.innerText = text;
            this.debugLog(text);
            this.eventTarget.dispatchEvent(new Event("ml-connected"));
        }
        else if (data.type == "addDebugLine") {
            const message = data.line.trim();
            if (message) {
                this.debugLog(message);
                if (!this.textTy) {
                    this.text.innerText = message;
                    this.textTy = (_b = (_a = data.additional) === null || _a === void 0 ? void 0 : _a.type) !== null && _b !== void 0 ? _b : null;
                }
                else if (((_c = data.additional) === null || _c === void 0 ? void 0 : _c.type) == "fatalDescription" || ((_d = data.additional) === null || _d === void 0 ? void 0 : _d.type) == "ifErrorDescription") {
                    if (this.text.innerText) {
                        this.text.innerText += "\n" + message;
                    }
                    else {
                        this.text.innerText = message;
                    }
                    this.textTy = data.additional.type;
                }
            }
            if (((_e = data.additional) === null || _e === void 0 ? void 0 : _e.type) == "fatal" || ((_f = data.additional) === null || _f === void 0 ? void 0 : _f.type) == "fatalDescription") {
                showModal(this);
            }
            else if (((_g = data.additional) === null || _g === void 0 ? void 0 : _g.type) == "recover") {
                showModal(null);
            }
            else if (((_h = data.additional) === null || _h === void 0 ? void 0 : _h.type) == "informError") {
                showErrorPopup(data.line);
            }
        }
        else if (data.type == "serverMessage") {
            const text = `Server: ${data.message}`;
            this.text.innerText = text;
            this.debugLog(text);
        }
    }
    onClose() {
        showModal(null);
    }
    onFinish(abort) {
        return new Promise((resolve, reject) => {
            this.eventTarget.addEventListener("ml-connected", () => resolve(), { once: true, signal: abort });
        });
    }
    mount(parent) {
        parent.appendChild(this.root);
    }
    unmount(parent) {
        parent.removeChild(this.root);
    }
}
/** Modal that shows the Moonlight streaming settings panel (bitrate, fps, video size, etc.). */
const SETTINGS_NAV_LABELS = [
    "Video",
    "Audio",
    "Controls",
    "Other",
];
class SettingsPanelModal {
    constructor(app) {
        var _a;
        this.wrapper = document.createElement("div");
        this.content = document.createElement("div");
        this.resolve = () => { };
        this.app = app;
        this.wrapper.classList.add("modal-settings-panel");
        const header = document.createElement("div");
        header.classList.add("modal-settings-panel-header");
        const title = document.createElement("h2");
        title.innerText = "Moonlight Settings";
        const applyButton = document.createElement("button");
        applyButton.innerText = "Apply";
        applyButton.addEventListener("click", () => this.onApply());
        const closeButton = document.createElement("button");
        closeButton.innerText = "Close";
        closeButton.addEventListener("click", () => this.resolve(null));
        header.appendChild(title);
        const headerActions = document.createElement("div");
        headerActions.classList.add("modal-settings-panel-header-actions");
        headerActions.appendChild(applyButton);
        headerActions.appendChild(closeButton);
        header.appendChild(headerActions);
        this.wrapper.appendChild(header);
        // Stream settings UI (per-app)
        this.settingsComponent = new StreamSettingsComponent((_a = getSettingsForApp(this.app.getAppId())) !== null && _a !== void 0 ? _a : undefined);
        this.settingsComponent.addChangeListener(() => {
            const s = this.settingsComponent.getStreamSettings();
            setSettingsForApp(this.app.getAppId(), s);
            setPageStyle(s.pageStyle);
        });
        // Body: sidebar + content area with 4 panels (Video includes speed test)
        const body = document.createElement("div");
        body.classList.add("settings-body");
        const sidebar = document.createElement("nav");
        sidebar.classList.add("settings-sidebar");
        this.panels = [];
        for (let i = 0; i < SETTINGS_NAV_LABELS.length; i++) {
            const panel = document.createElement("div");
            panel.classList.add("settings-panel");
            panel.setAttribute("data-panel", String(i));
            if (i !== 0)
                panel.classList.add("settings-panel-hidden");
            this.panels.push(panel);
            const navItem = document.createElement("button");
            navItem.type = "button";
            navItem.classList.add("settings-nav-item");
            if (i === 0)
                navItem.classList.add("settings-nav-item-video");
            if (i === 1)
                navItem.classList.add("settings-nav-item-audio");
            if (i === 2)
                navItem.classList.add("settings-nav-item-controls");
            if (i === 3)
                navItem.classList.add("settings-nav-item-other");
            navItem.setAttribute("data-panel", String(i));
            navItem.innerText = SETTINGS_NAV_LABELS[i];
            if (i === 0)
                navItem.classList.add("active");
            navItem.addEventListener("click", () => this.showPanel(i));
            sidebar.appendChild(navItem);
        }
        this.content.classList.add("modal-settings-panel-content", "settings-content");
        // Speed test (integrated into Video panel)
        const speedtestContainer = document.createElement("div");
        speedtestContainer.classList.add("settings-panel-inner");
        const speedtestTitle = document.createElement("h3");
        speedtestTitle.classList.add("settings-section-title");
        speedtestTitle.innerText = "Connection Speed Test";
        speedtestContainer.appendChild(speedtestTitle);
        const speedtestButton = document.createElement("button");
        speedtestButton.innerText = "Test SpeedTest";
        speedtestContainer.appendChild(speedtestButton);
        const speedtestResult = document.createElement("div");
        speedtestResult.innerText = "Speed test not run yet.";
        speedtestResult.classList.add("settings-speedtest-result");
        speedtestContainer.appendChild(speedtestResult);
        speedtestButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            speedtestButton.disabled = true;
            speedtestResult.innerText = "Running speed test… This may take some time.";
            try {
                // Clear old resource timings so getEntriesByName() can find speed-test entries (avoids transferSize undefined)
                if (typeof performance !== "undefined" && performance.clearResourceTimings) {
                    performance.clearResourceTimings();
                }
                const module = yield import("@cloudflare/speedtest");
                const SpeedTestCtor = (_a = module.default) !== null && _a !== void 0 ? _a : module;
                // Omit packetLoss step to avoid CORS: turn-creds only allows speed.cloudflare.com
                const measurementsNoPacketLoss = [
                    { type: "latency", numPackets: 1 },
                    { type: "download", bytes: 1e5, count: 1, bypassMinDuration: true },
                    { type: "latency", numPackets: 20 },
                    { type: "download", bytes: 1e5, count: 9 },
                    { type: "download", bytes: 1e6, count: 8 },
                    { type: "upload", bytes: 1e5, count: 8 },
                    { type: "upload", bytes: 1e6, count: 6 },
                    { type: "download", bytes: 1e7, count: 6 },
                    { type: "upload", bytes: 1e7, count: 4 },
                    { type: "download", bytes: 2.5e7, count: 4 },
                    { type: "upload", bytes: 2.5e7, count: 4 },
                    { type: "download", bytes: 1e8, count: 3 },
                    { type: "upload", bytes: 5e7, count: 3 },
                    { type: "download", bytes: 2.5e8, count: 2 },
                ];
                const test = new SpeedTestCtor({ autoStart: false, measurements: measurementsNoPacketLoss });
                test.onFinish = (results) => {
                    try {
                        const down = results.getDownloadBandwidth && results.getDownloadBandwidth();
                        const up = results.getUploadBandwidth && results.getUploadBandwidth();
                        const latency = results.getUnloadedLatency && results.getUnloadedLatency();
                        const lines = [];
                        if (down != null) {
                            lines.push(`Download: ${(down / 1e6).toFixed(2)} Mbps`);
                        }
                        if (up != null) {
                            lines.push(`Upload: ${(up / 1e6).toFixed(2)} Mbps`);
                        }
                        if (latency != null) {
                            lines.push(`Latency: ${latency.toFixed(1)} ms`);
                        }
                        // Calculate a recommended Moonlight bitrate and video preset from download+latency.
                        if (down != null) {
                            const downloadMbps = down / 1e6;
                            let usable = downloadMbps * 0.35;
                            if (latency != null && latency > 80) {
                                usable *= 0.7;
                            }
                            // Clamp to [10, 70] Mbps and snap to nearest 10 Mbps tier
                            usable = Math.max(10, Math.min(usable, 70));
                            const tierMbps = Math.round(usable / 10) * 10;
                            const tierKbps = tierMbps * 1000;
                            let presetText;
                            if (tierMbps < 20) {
                                presetText = "1280 x 720 | HD | 60 FPS";
                            }
                            else if (tierMbps < 40) {
                                presetText = "1920 x 1080 | FHD | 30 FPS";
                            }
                            else {
                                presetText = "1920 x 1080 | FHD | 60 FPS";
                            }
                            lines.push(`Recommended video: ${presetText} | ${tierMbps.toFixed(0)} Mbps (${tierKbps.toFixed(0)} Kbps)`);
                            window.mlLastSpeedtestTierMbps = tierMbps;
                        }
                        if (lines.length === 0) {
                            lines.push("Speed test finished, but no metrics were available.");
                        }
                        speedtestResult.innerText = lines.join("\n");
                    }
                    catch (e) {
                        speedtestResult.innerText = "Speed test finished, but results could not be read.";
                    }
                    finally {
                        speedtestButton.disabled = false;
                    }
                };
                test.onError = (error) => {
                    const message = typeof error === "string"
                        ? error
                        : (error && error.message) || "Unknown error";
                    const isTransferSize = /transferSize/i.test(String(message));
                    const hint = isTransferSize
                        ? " Try refreshing the page and run the test again, or run a full test at speed.cloudflare.com."
                        : "";
                    speedtestResult.innerText = "Speed test failed: " + message + hint;
                    speedtestButton.disabled = false;
                };
                test.play();
            }
            catch (e) {
                speedtestResult.innerText = "Failed to start speed test: " + ((_b = e === null || e === void 0 ? void 0 : e.message) !== null && _b !== void 0 ? _b : String(e));
                speedtestButton.disabled = false;
            }
        }));
        // Panel 0: Video (speed test + video settings)
        const sectionDivs = this.settingsComponent.divElement.querySelectorAll(".settings-section");
        this.panels[0].appendChild(speedtestContainer);
        this.panels[0].appendChild(sectionDivs[1]);
        // Panels 1–3: audio, controls (mouse+controller), other
        this.panels[1].appendChild(sectionDivs[2]);
        this.panels[2].appendChild(sectionDivs[3]);
        this.panels[2].appendChild(sectionDivs[4]);
        this.panels[3].appendChild(sectionDivs[5]);
        // Per-app settings export/import (dist)
        const fileSection = document.createElement("div");
        fileSection.classList.add("settings-panel-inner");
        const fileTitle = document.createElement("h3");
        fileTitle.classList.add("settings-section-title");
        fileTitle.innerText = "Per-app settings file";
        fileSection.appendChild(fileTitle);
        const exportBtn = document.createElement("button");
        exportBtn.innerText = "Export app_settings.json";
        exportBtn.style.marginRight = "0.5rem";
        exportBtn.addEventListener("click", () => exportAppSettingsToFile());
        fileSection.appendChild(exportBtn);
        const importBtn = document.createElement("button");
        importBtn.innerText = "Import from file";
        const importInput = document.createElement("input");
        importInput.type = "file";
        importInput.accept = "application/json,.json";
        importInput.style.display = "none";
        importInput.addEventListener("change", () => {
            var _a;
            const file = (_a = importInput.files) === null || _a === void 0 ? void 0 : _a[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = () => {
                    const text = reader.result;
                    if (text)
                        importAppSettingsFromJson(text);
                    importInput.value = "";
                };
                reader.readAsText(file);
            }
        });
        importBtn.addEventListener("click", () => importInput.click());
        fileSection.appendChild(importBtn);
        fileSection.appendChild(importInput);
        this.panels[3].appendChild(fileSection);
        for (let i = 0; i < SETTINGS_NAV_LABELS.length; i++)
            this.content.appendChild(this.panels[i]);
        body.appendChild(sidebar);
        body.appendChild(this.content);
        this.wrapper.appendChild(body);
        // Event target must stay in DOM (hidden) for component events
        this.settingsComponent.divElement.classList.add("settings-event-target");
        this.settingsComponent.divElement.setAttribute("aria-hidden", "true");
        this.wrapper.appendChild(this.settingsComponent.divElement);
    }
    showPanel(index) {
        this.panels.forEach((panel, i) => {
            panel.classList.toggle("settings-panel-hidden", i !== index);
        });
        this.wrapper.querySelectorAll(".settings-nav-item").forEach((item, i) => {
            item.classList.toggle("active", i === index);
        });
    }
    onApply() {
        return __awaiter(this, void 0, void 0, function* () {
            const settings = this.settingsComponent.getStreamSettings();
            setSettingsForApp(this.app.getAppId(), settings);
            setPageStyle(settings.pageStyle);
            this.resolve(null);
            yield this.app.restartStreamWithNewSettings(settings);
        });
    }
    mount(parent) {
        parent.appendChild(this.wrapper);
    }
    unmount(parent) {
        parent.removeChild(this.wrapper);
    }
    onFinish(signal) {
        return new Promise((resolve) => {
            this.resolve = resolve;
            signal.addEventListener("abort", () => resolve(null));
        });
    }
}
/** Inline SVG icon: cursor hidden (circle + slash) */
function getIconHideCursor() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "rgba(255,255,255,0.85)");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("class", "settings-control-row__icon-svg");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "5");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "5");
    line.setAttribute("y1", "19");
    line.setAttribute("x2", "19");
    line.setAttribute("y2", "5");
    svg.appendChild(circle);
    svg.appendChild(line);
    return svg;
}
/** Inline SVG icon: lock */
function getIconLock() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "rgba(255,255,255,0.85)");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("class", "settings-control-row__icon-svg");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", "3");
    rect.setAttribute("y", "11");
    rect.setAttribute("width", "18");
    rect.setAttribute("height", "11");
    rect.setAttribute("rx", "2");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M7 11V7a5 5 0 0110 0v4");
    svg.appendChild(rect);
    svg.appendChild(path);
    return svg;
}
/** Premium toggle: wraps checkbox in label + track with glossy knob */
function createPremiumToggle(checkboxInput) {
    const label = document.createElement("label");
    label.className = "settings-toggle-wrap";
    checkboxInput.classList.add("settings-toggle-input");
    const track = document.createElement("span");
    track.className = "settings-toggle__track";
    label.appendChild(checkboxInput);
    label.appendChild(track);
    return label;
}
/** Reusable settings row: left = icon + label, divider, right = control */
function createSettingsControlRow(opts) {
    const { iconSvg, labelText, controlEl } = opts;
    const row = document.createElement("div");
    row.className = "settings-control-row";
    const labelSection = document.createElement("div");
    labelSection.className = "settings-control-row__label";
    const iconWrap = document.createElement("span");
    iconWrap.className = "settings-control-row__icon";
    iconWrap.appendChild(iconSvg);
    const text = document.createElement("span");
    text.className = "settings-control-row__text";
    text.textContent = labelText;
    labelSection.appendChild(iconWrap);
    labelSection.appendChild(text);
    const divider = document.createElement("span");
    divider.className = "settings-control-row__divider";
    divider.setAttribute("aria-hidden", "true");
    const controlSection = document.createElement("div");
    controlSection.className = "settings-control-row__control";
    controlSection.appendChild(controlEl);
    row.appendChild(labelSection);
    row.appendChild(divider);
    row.appendChild(controlSection);
    return row;
}
class ViewerSidebar {
    constructor(app) {
        this.app = app;
        this.selectedMode = null; // null | "pc" | "phone"
        this.uploadDoneAnnouncementHideTimer = null;
        this.div = document.createElement("div");
        this.div.classList.add("sidebar-stream");
        this.screenKeyboard = new ScreenKeyboard();
        this.screenKeyboard.addKeyDownListener(this.onKeyDown.bind(this));
        this.screenKeyboard.addKeyUpListener(this.onKeyUp.bind(this));
        this.screenKeyboard.addTextListener(this.onText.bind(this));
        this.div.appendChild(this.screenKeyboard.getHiddenElement());
        this.uploadDoneAnnouncementButton = document.createElement("button");
        this.uploadDoneAnnouncementButton.classList.add("upload-done-announcement");
        this.uploadDoneAnnouncementButton.type = "button";
        this.uploadDoneAnnouncementTitle = document.createElement("span");
        this.uploadDoneAnnouncementTitle.classList.add("upload-done-announcement-title");
        this.uploadDoneAnnouncementTitle.textContent = "NextGPU announces";
        this.uploadDoneAnnouncementMessage = document.createElement("span");
        this.uploadDoneAnnouncementMessage.classList.add("upload-done-announcement-message");
        this.uploadDoneAnnouncementButton.appendChild(this.uploadDoneAnnouncementTitle);
        this.uploadDoneAnnouncementButton.appendChild(this.uploadDoneAnnouncementMessage);
        this.uploadDoneAnnouncementButton.style.display = "none";
        this.uploadDoneAnnouncementButton.addEventListener("click", () => {
            if (this.uploadDoneAnnouncementHideTimer != null) {
                clearTimeout(this.uploadDoneAnnouncementHideTimer);
                this.uploadDoneAnnouncementHideTimer = null;
            }
            this.uploadDoneAnnouncementButton.style.display = "none";
        });
        document.body.appendChild(this.uploadDoneAnnouncementButton);
        const openSettings = () => {
            setSidebarExtended(false);
            const sidebarRoot = getSidebarRoot();
            sidebarRoot === null || sidebarRoot === void 0 ? void 0 : sidebarRoot.classList.add("sidebar-settings-hidden");
            showModal(new SettingsPanelModal(this.app))
                .finally(() => {
                sidebarRoot === null || sidebarRoot === void 0 ? void 0 : sidebarRoot.classList.remove("sidebar-settings-hidden");
            });
        };
        // ---- Mode selection view (tier 1) ----
        this.modeSelectView = document.createElement("div");
        this.modeSelectView.setAttribute("data-sidebar-view", "mode-select");
        this.modeSelectView.classList.add("sidebar-mode-select");
        const pcModeBtn = document.createElement("button");
        pcModeBtn.className = "sidebar-stream-cta";
        const pcModeIcon = document.createElement("img");
        pcModeIcon.src = "resources/desktop_windows-48px.svg";
        pcModeIcon.alt = "";
        pcModeIcon.className = "sidebar-stream-cta-icon";
        pcModeBtn.appendChild(pcModeIcon);
        pcModeBtn.appendChild(document.createTextNode("PC Mode"));
        pcModeBtn.addEventListener("click", () => this.setSelectedMode("pc"));
        const phoneModeBtn = document.createElement("button");
        phoneModeBtn.className = "sidebar-stream-cta";
        const phoneModeIcon = document.createElement("img");
        phoneModeIcon.src = "resources/smartphone.svg";
        phoneModeIcon.alt = "";
        phoneModeIcon.className = "sidebar-stream-cta-icon";
        phoneModeBtn.appendChild(phoneModeIcon);
        phoneModeBtn.appendChild(document.createTextNode("Phone Mode"));
        phoneModeBtn.addEventListener("click", () => this.setSelectedMode("phone"));
        this.modeSelectView.appendChild(pcModeBtn);
        this.modeSelectView.appendChild(phoneModeBtn);
        this.div.appendChild(this.modeSelectView);
        // ---- Phone panel ----
        this.phonePanelView = document.createElement("div");
        this.phonePanelView.setAttribute("data-sidebar-view", "phone");
        const phonePanelHeader = document.createElement("div");
        phonePanelHeader.classList.add("sidebar-panel-header");
        const backBtnPhone = document.createElement("button");
        backBtnPhone.className = "sidebar-back-btn";
        backBtnPhone.innerText = "← Back";
        backBtnPhone.addEventListener("click", () => this.setSelectedMode(null));
        phonePanelHeader.appendChild(backBtnPhone);
        const statsHeaderPhone = document.createElement("button");
        statsHeaderPhone.classList.add("sidebar-panel-stats-btn");
        const statsIconPhone = document.createElement("img");
        statsIconPhone.src = "resources/route.svg";
        statsIconPhone.alt = "";
        statsIconPhone.className = "sidebar-btn-icon";
        statsHeaderPhone.appendChild(statsIconPhone);
        statsHeaderPhone.appendChild(document.createTextNode("Stats"));
        statsHeaderPhone.addEventListener("click", () => {
            var _a;
            const stats = (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getStats();
            if (stats)
                stats.toggle();
        });
        phonePanelHeader.appendChild(statsHeaderPhone);
        this.phonePanelView.appendChild(phonePanelHeader);
        const phonePanelContent = document.createElement("div");
        phonePanelContent.classList.add("sidebar-panel-content", "sidebar-stream-buttons");
        this.sendKeycodeButton = document.createElement("button");
        this.sendKeycodeButton.classList.add("sidebar-btn-with-icon");
        const sendKeycodeIcon = document.createElement("img");
        sendKeycodeIcon.src = "resources/send.svg";
        sendKeycodeIcon.alt = "";
        sendKeycodeIcon.className = "sidebar-btn-icon";
        this.sendKeycodeButton.appendChild(sendKeycodeIcon);
        this.sendKeycodeButton.appendChild(document.createTextNode("Send Keycode"));
        this.sendKeycodeButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const key = yield showModal(new SendKeycodeModal());
            if (key == null)
                return;
            (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getInput().sendKey(true, key, 0);
            (_b = this.app.getStream()) === null || _b === void 0 ? void 0 : _b.getInput().sendKey(false, key, 0);
        }));
        const settingsButtonPhone = document.createElement("button");
        settingsButtonPhone.classList.add("sidebar-btn-with-icon");
        const settingsIconPhone = document.createElement("img");
        settingsIconPhone.src = "resources/settings-gear.svg";
        settingsIconPhone.alt = "";
        settingsIconPhone.className = "sidebar-btn-icon";
        settingsButtonPhone.appendChild(settingsIconPhone);
        settingsButtonPhone.appendChild(document.createTextNode("Settings"));
        settingsButtonPhone.addEventListener("click", openSettings);
        this.touchMode = new SelectComponent("touchMode", [
            { value: "touch", name: "Touch" },
            { value: "mouseRelative", name: "Relative" },
            { value: "pointAndDrag", name: "Point and Drag" }
        ], {
            displayName: "",
            preSelectedOption: this.app.getInputConfig().touchMode,
            embeddedLabel: "Touch Mode",
            forcePolyfill: true,
            listClass: "sidebar-stream-select-list"
        });
        this.touchMode.addChangeListener(this.onTouchModeChange.bind(this));
        const touchModeContainer = document.createElement("div");
        touchModeContainer.classList.add("sidebar-mouse-mode-btn");
        const settingsTouchModeRow = document.createElement("div");
        settingsTouchModeRow.classList.add("sidebar-settings-hide-cursor-row");
        settingsTouchModeRow.appendChild(settingsButtonPhone);
        settingsTouchModeRow.appendChild(this.sendKeycodeButton);
        this.keyboardButton = document.createElement("button");
        this.keyboardButton.classList.add("sidebar-btn-with-icon");
        const keyboardIcon = document.createElement("img");
        keyboardIcon.src = "resources/keyboard.svg";
        keyboardIcon.alt = "";
        keyboardIcon.className = "sidebar-btn-icon";
        this.keyboardButton.appendChild(keyboardIcon);
        this.keyboardButton.appendChild(document.createTextNode("Keyboard"));
        this.keyboardButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            setSidebarExtended(false);
            this.screenKeyboard.show();
        }));
        const sendKeycodeKeyboardRow = document.createElement("div");
        sendKeycodeKeyboardRow.classList.add("sidebar-touch-mode-row");
        sendKeycodeKeyboardRow.appendChild(touchModeContainer);
        sendKeycodeKeyboardRow.appendChild(this.keyboardButton);
        phonePanelContent.appendChild(settingsTouchModeRow);
        phonePanelContent.appendChild(sendKeycodeKeyboardRow);
        this.phonePanelView.appendChild(phonePanelContent);
        this.touchMode.mount(touchModeContainer);
        this.div.appendChild(this.phonePanelView);
        // ---- PC panel ----
        this.pcPanelView = document.createElement("div");
        this.pcPanelView.setAttribute("data-sidebar-view", "pc");
        const pcPanelHeader = document.createElement("div");
        pcPanelHeader.classList.add("sidebar-panel-header");
        const backBtnPc = document.createElement("button");
        backBtnPc.className = "sidebar-back-btn";
        backBtnPc.innerText = "← Back";
        backBtnPc.addEventListener("click", () => this.setSelectedMode(null));
        pcPanelHeader.appendChild(backBtnPc);
        const statsHeaderPc = document.createElement("button");
        statsHeaderPc.classList.add("sidebar-panel-stats-btn");
        const statsIconPc = document.createElement("img");
        statsIconPc.src = "resources/route.svg";
        statsIconPc.alt = "";
        statsIconPc.className = "sidebar-btn-icon";
        statsHeaderPc.appendChild(statsIconPc);
        statsHeaderPc.appendChild(document.createTextNode("Stats"));
        statsHeaderPc.addEventListener("click", () => {
            var _a;
            const stats = (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getStats();
            if (stats)
                stats.toggle();
        });
        pcPanelHeader.appendChild(statsHeaderPc);
        this.pcPanelView.appendChild(pcPanelHeader);
        const pcPanelContent = document.createElement("div");
        pcPanelContent.classList.add("sidebar-panel-content", "sidebar-stream-buttons");
        const settingsButtonPc = document.createElement("button");
        settingsButtonPc.classList.add("sidebar-btn-with-icon");
        const settingsIconPc = document.createElement("img");
        settingsIconPc.src = "resources/settings-gear.svg";
        settingsIconPc.alt = "";
        settingsIconPc.className = "sidebar-btn-icon";
        settingsButtonPc.appendChild(settingsIconPc);
        settingsButtonPc.appendChild(document.createTextNode("Settings"));
        settingsButtonPc.addEventListener("click", openSettings);
        this.hideCursorCheckbox = document.createElement("input");
        this.hideCursorCheckbox.type = "checkbox";
        this.hideCursorCheckbox.addEventListener("change", () => {
            var _a;
            const input = (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getInput();
            if (input) {
                input.sendKey(true, StreamKeys.VK_LCONTROL, 0);
                input.sendKey(true, StreamKeys.VK_LMENU, 0);
                input.sendKey(true, StreamKeys.VK_LSHIFT, 0);
                input.sendKey(true, StreamKeys.VK_KEY_N, 0);
                input.sendKey(false, StreamKeys.VK_KEY_N, 0);
                input.sendKey(false, StreamKeys.VK_LSHIFT, 0);
                input.sendKey(false, StreamKeys.VK_LMENU, 0);
                input.sendKey(false, StreamKeys.VK_LCONTROL, 0);
            }
        });
        const hideCursorToggleWrap = createPremiumToggle(this.hideCursorCheckbox);
        const hideCursorRow = createSettingsControlRow({
            iconSvg: getIconHideCursor(),
            labelText: "Hide Host Cursor",
            controlEl: hideCursorToggleWrap
        });
        const hideCursorTextSpan = hideCursorRow.querySelector(".settings-control-row__text");
        if (hideCursorTextSpan)
            hideCursorTextSpan.innerHTML = "Hide<br>Host Cursor";
        const settingsHideCursorRow = document.createElement("div");
        settingsHideCursorRow.classList.add("sidebar-settings-hide-cursor-row", "sidebar-pc-settings-row");
        settingsHideCursorRow.appendChild(settingsButtonPc);
        settingsHideCursorRow.appendChild(hideCursorRow);
        this.lockMouseCheckbox = document.createElement("input");
        this.lockMouseCheckbox.type = "checkbox";
        this.lockMouseCheckbox.addEventListener("change", () => __awaiter(this, void 0, void 0, function* () {
            if (this.lockMouseCheckbox.checked)
                yield this.app.requestPointerLock(true);
            else
                yield this.app.exitPointerLock();
        }));
        document.addEventListener("pointerlockchange", () => {
            this.lockMouseCheckbox.checked = !!document.pointerLockElement;
        });
        const lockMouseToggleWrap = createPremiumToggle(this.lockMouseCheckbox);
        const lockMouseRow = createSettingsControlRow({
            iconSvg: getIconLock(),
            labelText: "Lock Mouse",
            controlEl: lockMouseToggleWrap
        });
        this.mouseMode = new SelectComponent("mouseMode", [
            { value: "relative", name: "Relative" },
            { value: "follow", name: "Follow" },
            { value: "pointAndDrag", name: "Point and Drag" }
        ], {
            displayName: "",
            preSelectedOption: this.app.getInputConfig().mouseMode,
            embeddedLabel: "Mouse Mode",
            forcePolyfill: true,
            listClass: "sidebar-stream-select-list"
        });
        this.mouseMode.addChangeListener(this.onMouseModeChange.bind(this));
        const mouseModeContainer = document.createElement("div");
        mouseModeContainer.classList.add("sidebar-mouse-lock-cell", "sidebar-mouse-mode-btn");
        const mouseModeLockMouseRow = document.createElement("div");
        mouseModeLockMouseRow.classList.add("sidebar-mouse-mode-lock-row");
        mouseModeLockMouseRow.appendChild(mouseModeContainer);
        mouseModeLockMouseRow.appendChild(lockMouseRow);
        pcPanelContent.appendChild(settingsHideCursorRow);
        pcPanelContent.appendChild(mouseModeLockMouseRow);
        this.mouseMode.mount(mouseModeContainer);
        this.pcPanelView.appendChild(pcPanelContent);
        this.div.appendChild(this.pcPanelView);
        // ---- Common section (Upload, Fullscreen, Exit) ----
        this.commonSection = document.createElement("div");
        this.commonSection.classList.add("sidebar-common", "sidebar-stream-buttons");
        this.uploadFileButton = document.createElement("button");
        this.uploadFileButton.classList.add("sidebar-upload-btn");
        this.uploadFileButton.appendChild(document.createTextNode("UP FILE"));
        const uploadFileInput = document.createElement("input");
        uploadFileInput.type = "file";
        uploadFileInput.style.display = "none";
        uploadFileInput.addEventListener("change", () => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const selectedFile = (_a = uploadFileInput.files) === null || _a === void 0 ? void 0 : _a[0];
            if (!selectedFile) {
                return;
            }
            try {
                this.uploadFileButton.disabled = true;
                const stream = this.app.getStream();
                if (!stream) {
                    return;
                }
                yield stream.uploadFileToHost(selectedFile);
                this.showUploadDoneAnnouncement(selectedFile.name);
            }
            catch (e) {
                console.warn("[Stream]: upload from sidebar failed", e);
            }
            finally {
                this.uploadFileButton.disabled = false;
                uploadFileInput.value = "";
            }
        }));
        this.uploadFileButton.addEventListener("click", () => uploadFileInput.click());
        this.fullscreenButton = document.createElement("button");
        this.fullscreenButton.classList.add("sidebar-btn-with-icon", "sidebar-fullscreen-btn");
        const fullscreenIcon = document.createElement("img");
        fullscreenIcon.src = "resources/expand.svg";
        fullscreenIcon.alt = "";
        fullscreenIcon.className = "sidebar-btn-icon";
        this.fullscreenButton.appendChild(fullscreenIcon);
        this.fullscreenButton.appendChild(document.createTextNode("Fullscreen"));
        this.fullscreenButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            if (this.app.isFullscreen())
                yield this.app.exitFullscreen();
            else
                yield this.app.requestFullscreen();
        }));
        this.statsButton = document.createElement("button");
        this.statsButton.classList.add("sidebar-btn-with-icon");
        const statsIcon = document.createElement("img");
        statsIcon.src = "resources/route.svg";
        statsIcon.alt = "";
        statsIcon.className = "sidebar-btn-icon";
        this.statsButton.appendChild(statsIcon);
        this.statsButton.appendChild(document.createTextNode("Stats"));
        this.statsButton.addEventListener("click", () => {
            var _a;
            const stats = (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getStats();
            if (stats)
                stats.toggle();
        });
        this.exitStreamButton = document.createElement("button");
        this.exitStreamButton.className = "sidebar-exit-btn sidebar-btn-with-icon";
        const exitIcon = document.createElement("img");
        exitIcon.src = "resources/square-arrow-right-exit.svg";
        exitIcon.alt = "";
        exitIcon.className = "sidebar-btn-icon";
        this.exitStreamButton.appendChild(exitIcon);
        this.exitStreamButton.appendChild(document.createTextNode("Exit"));
        this.exitStreamButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            const stream = this.app.getStream();
            if (stream) {
                const success = yield stream.stop();
                if (!success)
                    console.debug("Failed to close stream correctly");
            }
            if (window.matchMedia('(display-mode: standalone)').matches)
                history.back();
            else
                window.close();
        }));
        this.commonSection.appendChild(this.uploadFileButton);
        this.commonSection.appendChild(uploadFileInput);
        this.commonSection.appendChild(this.fullscreenButton);
        this.commonSection.appendChild(this.exitStreamButton);
        this.div.appendChild(this.commonSection);
        this.setSelectedMode(null);
    }
    setSelectedMode(mode) {
        this.selectedMode = mode;
        this.modeSelectView.classList.toggle("sidebar-view-visible", mode === null);
        this.phonePanelView.classList.toggle("sidebar-view-visible", mode === "phone");
        this.pcPanelView.classList.toggle("sidebar-view-visible", mode === "pc");
        this.commonSection.classList.toggle("sidebar-view-visible", mode !== null);
    }
    onCapabilitiesChange(capabilities) {
        this.touchMode.setOptionEnabled("touch", capabilities.touch);
    }
    showUploadDoneAnnouncement(fileName) {
        const safeFileName = (fileName || "").trim() || "file";
        this.uploadDoneAnnouncementMessage.textContent = `Up Load '${safeFileName}' done, please check the file on the desktop`;
        this.uploadDoneAnnouncementButton.style.display = "inline-flex";
        if (this.uploadDoneAnnouncementHideTimer != null) {
            clearTimeout(this.uploadDoneAnnouncementHideTimer);
        }
        this.uploadDoneAnnouncementHideTimer = setTimeout(() => {
            this.uploadDoneAnnouncementButton.style.display = "none";
            this.uploadDoneAnnouncementHideTimer = null;
        }, 5000);
    }
    getScreenKeyboard() {
        return this.screenKeyboard;
    }
    // -- Keyboard
    onText(event) {
        var _a;
        (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getInput().sendText(event.detail.text);
    }
    onKeyDown(event) {
        var _a;
        (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getInput().onKeyDown(event);
    }
    onKeyUp(event) {
        var _a;
        (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getInput().onKeyUp(event);
    }
    // -- Mouse Mode
    onMouseModeChange() {
        const config = this.app.getInputConfig();
        config.mouseMode = this.mouseMode.getValue();
        this.app.setInputConfig(config);
    }
    // -- Touch Mode
    onTouchModeChange() {
        const config = this.app.getInputConfig();
        config.touchMode = this.touchMode.getValue();
        this.app.setInputConfig(config);
    }
    extended() {
    }
    unextend() {
    }
    mount(parent) {
        parent.appendChild(this.div);
    }
    unmount(parent) {
        parent.removeChild(this.div);
    }
}
class SendKeycodeModal extends FormModal {
    constructor() {
        super();
        const keyList = [];
        for (const keyNameRaw in StreamKeys) {
            const keyName = keyNameRaw;
            const keyValue = StreamKeys[keyName];
            const PREFIX = "VK_";
            let name = keyName;
            if (name.startsWith(PREFIX)) {
                name = name.slice(PREFIX.length);
            }
            keyList.push({
                value: keyValue.toString(),
                name
            });
        }
        this.dropdownSearch = new SelectComponent("winKeycode", keyList, {
            hasSearch: true,
            displayName: "Select Keycode"
        });
    }
    mountForm(form) {
        this.dropdownSearch.mount(form);
    }
    reset() {
        this.dropdownSearch.reset();
    }
    submit() {
        const keyString = this.dropdownSearch.getValue();
        if (keyString == null) {
            return null;
        }
        return parseInt(keyString);
    }
}
// Stop propagation so the stream doesn't get it
function stopPropagationOn(element) {
    element.addEventListener("keydown", onStopPropagation);
    element.addEventListener("keyup", onStopPropagation);
    element.addEventListener("keypress", onStopPropagation);
    element.addEventListener("click", onStopPropagation);
    element.addEventListener("mousedown", onStopPropagation);
    element.addEventListener("mouseup", onStopPropagation);
    element.addEventListener("mousemove", onStopPropagation);
    element.addEventListener("wheel", onStopPropagation);
    element.addEventListener("contextmenu", onStopPropagation);
    element.addEventListener("touchstart", onStopPropagation);
    element.addEventListener("touchmove", onStopPropagation);
    element.addEventListener("touchend", onStopPropagation);
    element.addEventListener("touchcancel", onStopPropagation);
}
function onStopPropagation(event) {
    event.stopPropagation();
}
