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
import { getSidebarRoot, setSidebar, setSidebarExtended, setSidebarStyle } from "./component/sidebar/index.js";
import { defaultStreamInputConfig } from "./stream/input.js";
import { exportAppSettingsToFile, getSettingsForApp, importAppSettingsFromJson, loadStaticAppSettingsFile, setSettingsForApp, } from "./app_settings.js";
import { StreamSettingsComponent } from "./component/settings_menu.js";
import { setStyle as setPageStyle } from "./styles/index.js";
import { SelectComponent } from "./component/input.js";
import { StreamKeys } from "./api_bindings.js";
import { ScreenKeyboard } from "./screen_keyboard.js";
import { FormModal } from "./component/modal/form.js";
import { streamStatsToText } from "./stream/stats.js";
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
class ViewerApp {
    constructor(api, hostId, appId) {
        this.div = document.createElement("div");
        this.statsDiv = document.createElement("div");
        this.stream = null;
        this.inputConfig = defaultStreamInputConfig();
        this.hasShownFullscreenEscapeWarning = false;
        this.isTogglingFullscreenWithKeybind = "none";
        this.api = api;
        this.hostId = hostId;
        this.appId = appId;
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
            var _a;
            (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().raiseAllKeys();
        });
        document.addEventListener("visibilitychange", () => {
            var _a;
            if (document.visibilityState !== "visible") {
                (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().raiseAllKeys();
            }
        });
        document.addEventListener("pointerlockchange", this.onPointerLockChange.bind(this));
        document.addEventListener("fullscreenchange", this.onFullscreenChange.bind(this));
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
            setSidebarStyle({
                edge: settings.sidebarEdge,
            });
            this.stream = new Stream(this.api, hostId, appId, settings, browserSize);
            // Add app info listener
            this.stream.addInfoListener(this.onInfo.bind(this));
            // Create connection info modal
            const connectionInfo = new ConnectionInfoModal();
            this.stream.addInfoListener(connectionInfo.onInfo.bind(connectionInfo));
            showModal(connectionInfo);
            // Start animation frame loop
            this.onTouchUpdate();
            this.onGamepadUpdate();
            this.stream.getInput().addScreenKeyboardVisibleEvent(this.onScreenKeyboardSetVisible.bind(this));
            this.stream.mount(this.div);
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
            const data = event.detail;
            if (data.type == "app") {
                const app = data.app;
                document.title = `Stream: ${app.title}`;
            }
            else if (data.type == "connectionComplete") {
                this.sidebar.onCapabilitiesChange(data.capabilities);
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
        var _a, _b, _c, _d;
        this.focusInput();
        (_b = (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getVideoRenderer()) === null || _b === void 0 ? void 0 : _b.onUserInteraction();
        (_d = (_c = this.stream) === null || _c === void 0 ? void 0 : _c.getAudioPlayer()) === null || _d === void 0 ? void 0 : _d.onUserInteraction();
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
        var _a;
        this.onUserInteraction();
        console.debug(event);
        if (event.shiftKey && event.ctrlKey && event.code == "KeyV") {
            // We are likely pasting -> don't send keys
        }
        else if (event.code == "F11") {
            // Allow manual fullscreen
        }
        else {
            event.preventDefault();
            (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onKeyDown(event);
        }
        event.stopPropagation();
    }
    onKeyUp(event) {
        var _a;
        this.onUserInteraction();
        event.preventDefault();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onKeyUp(event);
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
        var _a;
        this.onUserInteraction();
        (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getInput().onPaste(event);
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
                    if (!this.hasShownFullscreenEscapeWarning) {
                        yield showMessage("To exit Fullscreen you'll have to hold ESC for a few seconds.");
                    }
                    this.hasShownFullscreenEscapeWarning = true;
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
    }
    mount(parent) {
        parent.appendChild(this.div);
    }
    unmount(parent) {
        parent.removeChild(this.div);
    }
    getStreamRect() {
        var _a, _b, _c;
        // The bounding rect of the videoElement or canvasElement can be bigger than the actual video
        // -> We need to correct for this when sending positions, else positions are wrong
        return (_c = (_b = (_a = this.stream) === null || _a === void 0 ? void 0 : _a.getVideoRenderer()) === null || _b === void 0 ? void 0 : _b.getStreamRect()) !== null && _c !== void 0 ? _c : new DOMRect();
    }
    getStream() {
        return this.stream;
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
        header.appendChild(applyButton);
        header.appendChild(closeButton);
        this.wrapper.appendChild(header);
        this.content.classList.add("modal-settings-panel-content");
        this.wrapper.appendChild(this.content);
        // Stream settings UI (per-app)
        this.settingsComponent = new StreamSettingsComponent((_a = getSettingsForApp(this.app.getAppId())) !== null && _a !== void 0 ? _a : undefined);
        this.settingsComponent.addChangeListener(() => {
            const s = this.settingsComponent.getStreamSettings();
            setSettingsForApp(this.app.getAppId(), s);
            setPageStyle(s.pageStyle);
        });
        // Export / Import app_settings.json
        const fileSection = document.createElement("div");
        fileSection.style.marginTop = "1rem";
        const fileTitle = document.createElement("h3");
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
        this.content.appendChild(fileSection);
        // Cloudflare Speedtest section
        const speedtestContainer = document.createElement("div");
        speedtestContainer.style.marginTop = "1rem";
        const speedtestTitle = document.createElement("h3");
        speedtestTitle.innerText = "Connection Speed Test";
        speedtestContainer.appendChild(speedtestTitle);
        const speedtestButton = document.createElement("button");
        speedtestButton.innerText = "Test SpeedTest";
        speedtestContainer.appendChild(speedtestButton);
        const speedtestResult = document.createElement("div");
        speedtestResult.innerText = "Speed test not run yet.";
        speedtestResult.style.whiteSpace = "pre-line";
        speedtestResult.style.marginTop = "0.5rem";
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
        this.content.appendChild(speedtestContainer);
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
        this.settingsComponent.mount(this.content);
    }
    unmount(parent) {
        this.settingsComponent.unmount(this.content);
        parent.removeChild(this.wrapper);
    }
    onFinish(signal) {
        return new Promise((resolve) => {
            this.resolve = resolve;
            signal.addEventListener("abort", () => resolve(null));
        });
    }
}
class ViewerSidebar {
    constructor(app) {
        this.div = document.createElement("div");
        this.buttonDiv = document.createElement("div");
        this.sendKeycodeButton = document.createElement("button");
        this.keyboardButton = document.createElement("button");
        this.screenKeyboard = new ScreenKeyboard();
        this.lockMouseButton = document.createElement("button");
        this.fullscreenButton = document.createElement("button");
        this.statsButton = document.createElement("button");
        this.exitStreamButton = document.createElement("button");
        this.hideCursorLabel = document.createElement("label");
        this.hideCursorCheckbox = document.createElement("input");
        this.app = app;
        // Configure divs
        this.div.classList.add("sidebar-stream");
        this.buttonDiv.classList.add("sidebar-stream-buttons");
        this.div.appendChild(this.buttonDiv);
        // Send keycode
        this.sendKeycodeButton.innerText = "Send Keycode";
        this.sendKeycodeButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const key = yield showModal(new SendKeycodeModal());
            if (key == null) {
                return;
            }
            (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getInput().sendKey(true, key, 0);
            (_b = this.app.getStream()) === null || _b === void 0 ? void 0 : _b.getInput().sendKey(false, key, 0);
        }));
        this.buttonDiv.appendChild(this.sendKeycodeButton);
        // Pointer Lock
        this.lockMouseButton.innerText = "Lock Mouse";
        this.lockMouseButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            yield this.app.requestPointerLock(true);
        }));
        this.buttonDiv.appendChild(this.lockMouseButton);
        // Pop up keyboard
        this.keyboardButton.innerText = "Keyboard";
        this.keyboardButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            setSidebarExtended(false);
            this.screenKeyboard.show();
        }));
        this.buttonDiv.appendChild(this.keyboardButton);
        // Hide host cursor toggle (cursor drawn in the stream; does not hide client/browser cursor)
        this.hideCursorCheckbox.type = "checkbox";
        this.hideCursorLabel.appendChild(this.hideCursorCheckbox);
        this.hideCursorLabel.appendChild(document.createTextNode(" Hide host cursor"));
        this.hideCursorCheckbox.addEventListener("change", () => {
            var _a;
            // Sunshine only applies the shortcut when it sees separate Ctrl/Alt/Shift key events
            // (it sets shortcutFlags from those). Simulate full sequence: Ctrl down, Alt down,
            // Shift down, N down, N up, Shift up, Alt up, Ctrl up.
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
        this.buttonDiv.appendChild(this.hideCursorLabel);
        // Moonlight Settings panel
        const settingsButton = document.createElement("button");
        settingsButton.innerText = "Settings";
        settingsButton.addEventListener("click", () => {
            setSidebarExtended(false);
            showModal(new SettingsPanelModal(this.app));
        });
        this.buttonDiv.appendChild(settingsButton);
        this.screenKeyboard.addKeyDownListener(this.onKeyDown.bind(this));
        this.screenKeyboard.addKeyUpListener(this.onKeyUp.bind(this));
        this.screenKeyboard.addTextListener(this.onText.bind(this));
        this.div.appendChild(this.screenKeyboard.getHiddenElement());
        // Fullscreen
        this.fullscreenButton.innerText = "Fullscreen";
        this.fullscreenButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            if (this.app.isFullscreen()) {
                yield this.app.exitFullscreen();
            }
            else {
                yield this.app.requestFullscreen();
            }
        }));
        this.buttonDiv.appendChild(this.fullscreenButton);
        // Stats
        this.statsButton.innerText = "Stats";
        this.statsButton.addEventListener("click", () => {
            var _a;
            const stats = (_a = this.app.getStream()) === null || _a === void 0 ? void 0 : _a.getStats();
            if (stats) {
                stats.toggle();
            }
        });
        this.buttonDiv.appendChild(this.statsButton);
        // Close stream
        this.exitStreamButton.innerText = "Exit";
        this.exitStreamButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
            const stream = this.app.getStream();
            if (stream) {
                const success = yield stream.stop();
                if (!success) {
                    console.debug("Failed to close stream correctly");
                }
            }
            if (window.matchMedia('(display-mode: standalone)').matches) {
                history.back();
            }
            else {
                window.close();
            }
        }));
        this.buttonDiv.appendChild(this.exitStreamButton);
        // Select Mouse Mode
        this.mouseMode = new SelectComponent("mouseMode", [
            { value: "relative", name: "Relative" },
            { value: "follow", name: "Follow" },
            { value: "pointAndDrag", name: "Point and Drag" }
        ], {
            displayName: "Mouse Mode",
            preSelectedOption: this.app.getInputConfig().mouseMode
        });
        this.mouseMode.addChangeListener(this.onMouseModeChange.bind(this));
        this.mouseMode.mount(this.div);
        // Select Touch Mode
        this.touchMode = new SelectComponent("touchMode", [
            { value: "touch", name: "Touch" },
            { value: "mouseRelative", name: "Relative" },
            { value: "pointAndDrag", name: "Point and Drag" }
        ], {
            displayName: "Touch Mode",
            preSelectedOption: this.app.getInputConfig().touchMode
        });
        this.touchMode.addChangeListener(this.onTouchModeChange.bind(this));
        this.touchMode.mount(this.div);
    }
    onCapabilitiesChange(capabilities) {
        this.touchMode.setOptionEnabled("touch", capabilities.touch);
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
