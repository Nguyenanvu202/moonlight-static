import { ComponentEvent } from "./index.js";
import { InputComponent, SelectComponent } from "./input.js";
const VIDEO_PRESETS = [
    { id: "720p", width: 1280, height: 720, baseLabel: "1280 x 720 | HD", minMbps: 10, maxMbps: 25 },
    { id: "1080p", width: 1920, height: 1080, baseLabel: "1920 x 1080 | FHD", minMbps: 20, maxMbps: 40 },
    { id: "1440p", width: 2560, height: 1440, baseLabel: "2560 x 1440 | QHD", minMbps: 35, maxMbps: 55 },
    { id: "4k", width: 3840, height: 2160, baseLabel: "3840 x 2160 | 4K", minMbps: 50, maxMbps: 70 },
    { id: "native", baseLabel: "Native (host)", minMbps: 20, maxMbps: 60 },
    { id: "custom", baseLabel: "Custom…", minMbps: 10, maxMbps: 70 },
];
function getVideoPresetOptions() {
    var _a;
    const lastTierMbps = (_a = (typeof window !== "undefined" && window.mlLastSpeedtestTierMbps)) !== null && _a !== void 0 ? _a : 40;
    return VIDEO_PRESETS.map(preset => {
        const clamped = Math.max(preset.minMbps, Math.min(lastTierMbps, preset.maxMbps));
        return { value: preset.id, name: `${preset.baseLabel} | ${clamped} Mbps` };
    });
}
import DEFAULT_SETTINGS from "../default_settings.js";
export function defaultSettings() {
    // We are deep cloning this
    if ("structuredClone" in window) {
        return structuredClone(DEFAULT_SETTINGS);
    }
    else {
        return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
}
export function getLocalStreamSettings() {
    let settings = null;
    try {
        const settingsLoadedJson = localStorage.getItem("mlSettings");
        if (settingsLoadedJson == null) {
            return null;
        }
        const settingsLoaded = JSON.parse(settingsLoadedJson);
        settings = defaultSettings();
        Object.assign(settings, settingsLoaded);
    }
    catch (e) {
        localStorage.removeItem("mlSettings");
    }
    // Migration
    if ((settings === null || settings === void 0 ? void 0 : settings.pageStyle) == "old") {
        settings.pageStyle = "moonlight";
    }
    return settings;
}
export function setLocalStreamSettings(settings) {
    localStorage.setItem("mlSettings", JSON.stringify(settings));
}
export class StreamSettingsComponent {
    constructor(settings) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        this.divElement = document.createElement("div");
        this.sidebarHeader = document.createElement("h2");
        this.streamHeader = document.createElement("h2");
        this.audioHeader = document.createElement("h2");
        this.mouseHeader = document.createElement("h2");
        this.controllerHeader = document.createElement("h2");
        this.otherHeader = document.createElement("h2");
        const defaultSettings_ = defaultSettings();
        // Root div
        this.divElement.classList.add("settings");
        // Section wrappers for layout (sidebar + content panels)
        this.sidebarSection = document.createElement("div");
        this.sidebarSection.className = "settings-section";
        this.sidebarSection.setAttribute("data-section", "sidebar");
        this.streamSection = document.createElement("div");
        this.streamSection.className = "settings-section";
        this.streamSection.setAttribute("data-section", "video");
        this.audioSection = document.createElement("div");
        this.audioSection.className = "settings-section";
        this.audioSection.setAttribute("data-section", "audio");
        this.mouseSection = document.createElement("div");
        this.mouseSection.className = "settings-section";
        this.mouseSection.setAttribute("data-section", "mouse");
        this.controllerSection = document.createElement("div");
        this.controllerSection.className = "settings-section";
        this.controllerSection.setAttribute("data-section", "controller");
        this.otherSection = document.createElement("div");
        this.otherSection.className = "settings-section";
        this.otherSection.setAttribute("data-section", "other");
        // Sidebar
        this.sidebarHeader.innerText = "Sidebar";
        this.sidebarSection.appendChild(this.sidebarHeader);
        this.sidebarEdge = new SelectComponent("sidebarEdge", [
            { value: "left", name: "Left" },
            { value: "right", name: "Right" },
            { value: "up", name: "Up" },
            { value: "down", name: "Down" },
        ], {
            displayName: "Sidebar Edge",
            preSelectedOption: (_a = settings === null || settings === void 0 ? void 0 : settings.sidebarEdge) !== null && _a !== void 0 ? _a : defaultSettings_.sidebarEdge,
            forcePolyfill: true,
            listClass: "sidebar-stream-select-list",
        });
        this.sidebarEdge.addChangeListener(this.onSettingsChange.bind(this));
        this.sidebarEdge.mount(this.sidebarSection);
        this.divElement.appendChild(this.sidebarSection);
        // Video
        this.streamHeader.innerText = "Video";
        this.streamSection.appendChild(this.streamHeader);
        // Bitrate
        this.bitrate = new InputComponent("bitrate", "number", "Bitrate", {
            defaultValue: defaultSettings_.bitrate.toString(),
            value: (_b = settings === null || settings === void 0 ? void 0 : settings.bitrate) === null || _b === void 0 ? void 0 : _b.toString(),
            step: "100",
            numberSlider: {
                range_min: 1000,
                range_max: 10000,
            }
        });
        this.bitrate.addChangeListener(this.onSettingsChange.bind(this));
        this.bitrate.mount(this.streamSection);
        // Packet Size
        this.packetSize = new InputComponent("packetSize", "number", "Packet Size", {
            defaultValue: defaultSettings_.packetSize.toString(),
            value: (_c = settings === null || settings === void 0 ? void 0 : settings.packetSize) === null || _c === void 0 ? void 0 : _c.toString(),
            step: "100"
        });
        this.packetSize.addChangeListener(this.onSettingsChange.bind(this));
        this.packetSize.mount(this.streamSection);
        // Fps
        this.fps = new InputComponent("fps", "number", "Fps", {
            defaultValue: defaultSettings_.fps.toString(),
            value: (_d = settings === null || settings === void 0 ? void 0 : settings.fps) === null || _d === void 0 ? void 0 : _d.toString(),
            step: "100"
        });
        this.fps.addChangeListener(this.onSettingsChange.bind(this));
        this.fps.mount(this.streamSection);
        // Video Preset (single combobox: resolution + bitrate recommendation from speedtest)
        this.videoSize = new SelectComponent("videoPreset", getVideoPresetOptions(), {
            displayName: "Video Preset",
            preSelectedOption: (_e = settings === null || settings === void 0 ? void 0 : settings.videoSize) !== null && _e !== void 0 ? _e : defaultSettings_.videoSize,
            forcePolyfill: true,
            listClass: "sidebar-stream-select-list",
        });
        this.videoSize.addChangeListener(this.onSettingsChange.bind(this));
        this.videoSize.mount(this.streamSection);
        this.videoSizeWidth = new InputComponent("videoSizeWidth", "number", "Video Width", {
            defaultValue: defaultSettings_.videoSizeCustom.width.toString(),
            value: settings === null || settings === void 0 ? void 0 : settings.videoSizeCustom.width.toString(),
        });
        this.videoSizeWidth.addChangeListener(this.onSettingsChange.bind(this));
        this.videoSizeWidth.mount(this.streamSection);
        this.videoSizeHeight = new InputComponent("videoSizeHeight", "number", "Video Height", {
            defaultValue: defaultSettings_.videoSizeCustom.height.toString(),
            value: settings === null || settings === void 0 ? void 0 : settings.videoSizeCustom.height.toString(),
        });
        this.videoSizeHeight.addChangeListener(this.onSettingsChange.bind(this));
        this.videoSizeHeight.mount(this.streamSection);
        // Video Sample Queue Size
        this.videoSampleQueueSize = new InputComponent("videoFrameQueueSize", "number", "Video Frame Queue Size", {
            defaultValue: defaultSettings_.videoFrameQueueSize.toString(),
            value: (_f = settings === null || settings === void 0 ? void 0 : settings.videoFrameQueueSize) === null || _f === void 0 ? void 0 : _f.toString()
        });
        this.videoSampleQueueSize.addChangeListener(this.onSettingsChange.bind(this));
        this.videoSampleQueueSize.mount(this.streamSection);
        // Codec
        this.videoCodec = new SelectComponent("videoCodec", [
            { value: "h264", name: "H264" },
            { value: "auto", name: "Auto (Experimental)" },
            { value: "h265", name: "H265" },
            { value: "av1", name: "AV1 (Experimental)" },
        ], {
            displayName: "Video Codec",
            preSelectedOption: (_g = settings === null || settings === void 0 ? void 0 : settings.videoCodec) !== null && _g !== void 0 ? _g : defaultSettings_.videoCodec,
            forcePolyfill: true,
            listClass: "sidebar-stream-select-list",
        });
        this.videoCodec.addChangeListener(this.onSettingsChange.bind(this));
        this.videoCodec.mount(this.streamSection);
        // Force Video Element renderer
        this.forceVideoElementRenderer = new InputComponent("forceVideoElementRenderer", "checkbox", "Force Video Element Renderer (WebRTC only)", {
            checked: (_h = settings === null || settings === void 0 ? void 0 : settings.forceVideoElementRenderer) !== null && _h !== void 0 ? _h : defaultSettings_.forceVideoElementRenderer
        });
        this.forceVideoElementRenderer.addChangeListener(this.onSettingsChange.bind(this));
        this.forceVideoElementRenderer.mount(this.streamSection);
        // Use Canvas Renderer
        this.canvasRenderer = new InputComponent("canvasRenderer", "checkbox", "Use Canvas Renderer", {
            defaultValue: defaultSettings_.canvasRenderer.toString(),
            checked: settings === null || settings === void 0 ? void 0 : settings.canvasRenderer
        });
        this.canvasRenderer.addChangeListener(this.onSettingsChange.bind(this));
        this.canvasRenderer.mount(this.streamSection);
        // Canvas VSync (Canvas only: sync draw to display refresh to reduce tearing; off = lower latency)
        this.canvasVsync = new InputComponent("canvasVsync", "checkbox", "Canvas VSync (reduce tearing)", {
            checked: (_j = settings === null || settings === void 0 ? void 0 : settings.canvasVsync) !== null && _j !== void 0 ? _j : defaultSettings_.canvasVsync
        });
        this.canvasVsync.addChangeListener(this.onSettingsChange.bind(this));
        this.canvasVsync.mount(this.streamSection);
        // HDR
        this.hdr = new InputComponent("hdr", "checkbox", "Enable HDR", {
            checked: (_k = settings === null || settings === void 0 ? void 0 : settings.hdr) !== null && _k !== void 0 ? _k : defaultSettings_.hdr
        });
        this.hdr.addChangeListener(this.onSettingsChange.bind(this));
        this.hdr.mount(this.streamSection);
        this.divElement.appendChild(this.streamSection);
        // Audio local
        this.audioHeader.innerText = "Audio";
        this.audioSection.appendChild(this.audioHeader);
        this.playAudioLocal = new InputComponent("playAudioLocal", "checkbox", "Play Audio Local", {
            checked: settings === null || settings === void 0 ? void 0 : settings.playAudioLocal
        });
        this.playAudioLocal.addChangeListener(this.onSettingsChange.bind(this));
        this.playAudioLocal.mount(this.audioSection);
        // Audio Sample Queue Size
        this.audioSampleQueueSize = new InputComponent("audioSampleQueueSize", "number", "Audio Sample Queue Size", {
            defaultValue: defaultSettings_.audioSampleQueueSize.toString(),
            value: (_l = settings === null || settings === void 0 ? void 0 : settings.audioSampleQueueSize) === null || _l === void 0 ? void 0 : _l.toString()
        });
        this.audioSampleQueueSize.addChangeListener(this.onSettingsChange.bind(this));
        this.audioSampleQueueSize.mount(this.audioSection);
        this.divElement.appendChild(this.audioSection);
        // Mouse
        this.mouseHeader.innerText = "Mouse";
        this.mouseSection.appendChild(this.mouseHeader);
        this.mouseScrollMode = new SelectComponent("mouseScrollMode", [
            { value: "highres", name: "High Res" },
            { value: "normal", name: "Normal" }
        ], {
            displayName: "Scroll Mode",
            preSelectedOption: (settings === null || settings === void 0 ? void 0 : settings.mouseScrollMode) || defaultSettings_.mouseScrollMode,
            forcePolyfill: true,
            listClass: "sidebar-stream-select-list",
        });
        this.mouseScrollMode.addChangeListener(this.onSettingsChange.bind(this));
        this.mouseScrollMode.mount(this.mouseSection);
        this.divElement.appendChild(this.mouseSection);
        // Controller
        if (window.isSecureContext) {
            this.controllerHeader.innerText = "Controller";
        }
        else {
            this.controllerHeader.innerText = "Controller (Disabled: Secure Context Required)";
        }
        this.controllerSection.appendChild(this.controllerHeader);
        this.controllerInvertAB = new InputComponent("controllerInvertAB", "checkbox", "Invert A and B", {
            checked: settings === null || settings === void 0 ? void 0 : settings.controllerConfig.invertAB
        });
        this.controllerInvertAB.addChangeListener(this.onSettingsChange.bind(this));
        this.controllerInvertAB.mount(this.controllerSection);
        this.controllerInvertXY = new InputComponent("controllerInvertXY", "checkbox", "Invert X and Y", {
            checked: settings === null || settings === void 0 ? void 0 : settings.controllerConfig.invertXY
        });
        this.controllerInvertXY.addChangeListener(this.onSettingsChange.bind(this));
        this.controllerInvertXY.mount(this.controllerSection);
        // Controller Send Interval
        this.controllerSendIntervalOverride = new InputComponent("controllerSendIntervalOverride", "number", "Override Controller State Send Interval", {
            hasEnableCheckbox: true,
            defaultValue: "20",
            value: (_m = settings === null || settings === void 0 ? void 0 : settings.controllerConfig.sendIntervalOverride) === null || _m === void 0 ? void 0 : _m.toString(),
            numberSlider: {
                range_min: 10,
                range_max: 120
            }
        });
        this.controllerSendIntervalOverride.setEnabled((settings === null || settings === void 0 ? void 0 : settings.controllerConfig.sendIntervalOverride) != null);
        this.controllerSendIntervalOverride.addChangeListener(this.onSettingsChange.bind(this));
        this.controllerSendIntervalOverride.mount(this.controllerSection);
        this.divElement.appendChild(this.controllerSection);
        if (!window.isSecureContext) {
            this.controllerInvertAB.setEnabled(false);
            this.controllerInvertXY.setEnabled(false);
        }
        // Other
        this.otherHeader.innerText = "Other";
        this.otherSection.appendChild(this.otherHeader);
        this.dataTransport = new SelectComponent("transport", [
            { value: "auto", name: "Auto" },
            { value: "webrtc", name: "WebRTC" },
            { value: "websocket", name: "Web Socket (Experimental)" },
        ], {
            displayName: "Data Transport",
            preSelectedOption: (_o = settings === null || settings === void 0 ? void 0 : settings.dataTransport) !== null && _o !== void 0 ? _o : defaultSettings_.dataTransport,
            forcePolyfill: true,
            listClass: "sidebar-stream-select-list",
        });
        this.dataTransport.addChangeListener(this.onSettingsChange.bind(this));
        this.dataTransport.mount(this.otherSection);
        this.toggleFullscreenWithKeybind = new InputComponent("toggleFullscreenWithKeybind", "checkbox", "Toggle Fullscreen and Mouse Lock with Ctrl + Shift + I", {
            checked: settings === null || settings === void 0 ? void 0 : settings.toggleFullscreenWithKeybind
        });
        this.toggleFullscreenWithKeybind.addChangeListener(this.onSettingsChange.bind(this));
        this.toggleFullscreenWithKeybind.mount(this.otherSection);
        this.pageStyle = new SelectComponent("pageStyle", [
            { value: "standard", name: "Standard" },
            { value: "moonlight", name: "Moonlight" },
        ], {
            displayName: "Style",
            preSelectedOption: (_p = settings === null || settings === void 0 ? void 0 : settings.pageStyle) !== null && _p !== void 0 ? _p : defaultSettings_.pageStyle,
            forcePolyfill: true,
            listClass: "sidebar-stream-select-list",
        });
        this.pageStyle.addChangeListener(this.onSettingsChange.bind(this));
        this.pageStyle.mount(this.otherSection);
        this.useSelectElementPolyfill = new InputComponent("useSelectElementPolyfill", "checkbox", "Use Custom Dropdown Implementation", {
            checked: (_q = settings === null || settings === void 0 ? void 0 : settings.useSelectElementPolyfill) !== null && _q !== void 0 ? _q : defaultSettings_.useSelectElementPolyfill
        });
        this.useSelectElementPolyfill.addChangeListener(this.onSettingsChange.bind(this));
        this.useSelectElementPolyfill.mount(this.otherSection);
        this.divElement.appendChild(this.otherSection);
        this.onSettingsChange();
    }
    onSettingsChange() {
        const presetId = this.videoSize.getValue();
        if (presetId === "custom") {
            this.videoSizeWidth.setEnabled(true);
            this.videoSizeHeight.setEnabled(true);
        }
        else {
            this.videoSizeWidth.setEnabled(false);
            this.videoSizeHeight.setEnabled(false);
            const preset = VIDEO_PRESETS.find(p => p.id === presetId);
            if ((preset === null || preset === void 0 ? void 0 : preset.width) != null && (preset === null || preset === void 0 ? void 0 : preset.height) != null) {
                this.videoSizeWidth.setValue(preset.width.toString());
                this.videoSizeHeight.setValue(preset.height.toString());
            }
        }
        this.divElement.dispatchEvent(new ComponentEvent("ml-settingschange", this));
    }
    addChangeListener(listener) {
        this.divElement.addEventListener("ml-settingschange", listener);
    }
    removeChangeListener(listener) {
        this.divElement.removeEventListener("ml-settingschange", listener);
    }
    getStreamSettings() {
        const settings = defaultSettings();
        settings.sidebarEdge = this.sidebarEdge.getValue();
        settings.bitrate = parseInt(this.bitrate.getValue());
        settings.packetSize = parseInt(this.packetSize.getValue());
        settings.fps = parseInt(this.fps.getValue());
        const presetId = this.videoSize.getValue();
        if (presetId === "custom") {
            settings.videoSize = "custom";
            settings.videoSizeCustom = {
                width: parseInt(this.videoSizeWidth.getValue()),
                height: parseInt(this.videoSizeHeight.getValue()),
            };
        }
        else {
            settings.videoSize = presetId;
            const preset = VIDEO_PRESETS.find(p => p.id === presetId);
            if ((preset === null || preset === void 0 ? void 0 : preset.width) != null && (preset === null || preset === void 0 ? void 0 : preset.height) != null) {
                settings.videoSizeCustom = { width: preset.width, height: preset.height };
            }
            else {
                settings.videoSizeCustom = defaultSettings().videoSizeCustom;
            }
        }
        settings.videoFrameQueueSize = parseInt(this.videoSampleQueueSize.getValue());
        settings.videoCodec = this.videoCodec.getValue();
        settings.forceVideoElementRenderer = this.forceVideoElementRenderer.isChecked();
        settings.canvasRenderer = this.canvasRenderer.isChecked();
        settings.canvasVsync = this.canvasVsync.isChecked();
        settings.playAudioLocal = this.playAudioLocal.isChecked();
        settings.audioSampleQueueSize = parseInt(this.audioSampleQueueSize.getValue());
        settings.mouseScrollMode = this.mouseScrollMode.getValue();
        settings.controllerConfig.invertAB = this.controllerInvertAB.isChecked();
        settings.controllerConfig.invertXY = this.controllerInvertXY.isChecked();
        if (this.controllerSendIntervalOverride.isEnabled()) {
            settings.controllerConfig.sendIntervalOverride = parseInt(this.controllerSendIntervalOverride.getValue());
        }
        else {
            settings.controllerConfig.sendIntervalOverride = null;
        }
        settings.dataTransport = this.dataTransport.getValue();
        settings.toggleFullscreenWithKeybind = this.toggleFullscreenWithKeybind.isChecked();
        settings.pageStyle = this.pageStyle.getValue();
        settings.hdr = this.hdr.isChecked();
        settings.useSelectElementPolyfill = this.useSelectElementPolyfill.isChecked();
        return settings;
    }
    mount(parent) {
        parent.appendChild(this.divElement);
    }
    unmount(parent) {
        parent.removeChild(this.divElement);
    }
}
