var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { TransportChannelId } from "../api_bindings.js";
import { showErrorPopup } from "../component/error.js";
import { buildAudioPipeline } from "./audio/pipeline.js";
import { BIG_BUFFER, ByteBuffer } from "./buffer.js";
import { defaultStreamInputConfig, StreamInput } from "./input.js";
import { Logger } from "./log.js";
import { gatherPipeInfo, getPipe } from "./pipeline/index.js";
import { StreamStats } from "./stats.js";
import { WebSocketTransport } from "./transport/web_socket.js";
import { WebRTCTransport } from "./transport/webrtc.js";
import { allVideoCodecs, andVideoCodecs, createSupportedVideoFormatsBits, emptyVideoCodecs, getSelectedVideoCodec, hasAnyCodec } from "./video.js";
import { buildVideoPipeline } from "./video/pipeline.js";
export function getStreamerSize(settings, viewerScreenSize) {
    let width, height;
    if (settings.videoSize == "720p") {
        width = 1280;
        height = 720;
    }
    else if (settings.videoSize == "1080p") {
        width = 1920;
        height = 1080;
    }
    else if (settings.videoSize == "1440p") {
        width = 2560;
        height = 1440;
    }
    else if (settings.videoSize == "4k") {
        width = 3840;
        height = 2160;
    }
    else if (settings.videoSize == "custom") {
        width = settings.videoSizeCustom.width;
        height = settings.videoSizeCustom.height;
    }
    else { // native
        width = viewerScreenSize[0];
        height = viewerScreenSize[1];
    }
    return [width, height];
}
function getVideoCodecHint(settings) {
    let videoCodecHint = emptyVideoCodecs();
    if (settings.videoCodec == "h264") {
        videoCodecHint.H264 = true;
        videoCodecHint.H264_HIGH8_444 = true;
    }
    else if (settings.videoCodec == "h265") {
        videoCodecHint.H265 = true;
        videoCodecHint.H265_MAIN10 = true;
        videoCodecHint.H265_REXT8_444 = true;
        videoCodecHint.H265_REXT10_444 = true;
    }
    else if (settings.videoCodec == "av1") {
        videoCodecHint.AV1 = true;
        videoCodecHint.AV1_MAIN8 = true;
        videoCodecHint.AV1_MAIN10 = true;
        videoCodecHint.AV1_REXT8_444 = true;
        videoCodecHint.AV1_REXT10_444 = true;
    }
    else if (settings.videoCodec == "auto") {
        videoCodecHint = allVideoCodecs();
    }
    return videoCodecHint;
}
export class Stream {
    constructor(api, hostId, appId, settings, viewerScreenSize) {
        this.logger = new Logger();
        this.divElement = document.createElement("div");
        this.eventTarget = new EventTarget();
        this.iceServers = null;
        this.videoRenderer = null;
        this.audioPlayer = null;
        this.dragOverHandler = (event) => this.onDragOver(event);
        this.dropHandler = (event) => this.onDrop(event);
        this.transport = null;
        // -- Raw Web Socket stuff
        this.wsSendBuffer = [];
        this.logger.addInfoListener((info, type) => {
            this.debugLog(info, { type: type !== null && type !== void 0 ? type : undefined });
        });
        this.api = api;
        this.hostId = hostId;
        this.appId = appId;
        this.settings = settings;
        this.hostUploadRelativeDir =
            typeof settings.hostUploadRelativeDir === "string" ? settings.hostUploadRelativeDir : "";
        this.streamerSize = getStreamerSize(settings, viewerScreenSize);
        // Configure web socket
        const wsApiHost = api.host_url.replace(/^http(s)?:/, "ws$1:");
        this.ws = new WebSocket(`${wsApiHost}/host/stream`);
        this.ws.addEventListener("error", this.onError.bind(this));
        this.ws.addEventListener("open", this.onWsOpen.bind(this));
        this.ws.addEventListener("close", this.onWsClose.bind(this));
        this.ws.addEventListener("message", this.onRawWsMessage.bind(this));
        this.sendWsMessage({
            Init: {
                host_id: this.hostId,
                app_id: this.appId,
                video_frame_queue_size: this.settings.videoFrameQueueSize,
                audio_sample_queue_size: this.settings.audioSampleQueueSize,
            }
        });
        // Stream Input
        const streamInputConfig = defaultStreamInputConfig();
        Object.assign(streamInputConfig, {
            mouseScrollMode: this.settings.mouseScrollMode,
            controllerConfig: this.settings.controllerConfig
        });
        this.input = new StreamInput(streamInputConfig);
        // Stream Stats
        this.stats = new StreamStats();
        this.setupFileDropUpload();
    }
    setupFileDropUpload() {
        this.divElement.addEventListener("dragover", this.dragOverHandler);
        this.divElement.addEventListener("drop", this.dropHandler);
    }
    onDragOver(event) {
        event.preventDefault();
    }
    onDrop(event) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            event.preventDefault();
            const files = (_a = event.dataTransfer) === null || _a === void 0 ? void 0 : _a.files;
            if (!files || files.length == 0) {
                return;
            }
            // Upload only the first file for now
            yield this.uploadFileToHost(files[0]);
        });
    }
    emitFileTransferProgress(percent, loaded, total, source = "file") {
        const detail = { type: "fileTransferProgress", percent, source };
        if (loaded !== undefined)
            detail.loaded = loaded;
        if (total !== undefined)
            detail.total = total;
        const event = new CustomEvent("stream-info", { detail });
        this.eventTarget.dispatchEvent(event);
    }
    emitFileTransferProgressEnd(source = "file") {
        const event = new CustomEvent("stream-info", {
            detail: { type: "fileTransferProgressEnd", source },
        });
        this.eventTarget.dispatchEvent(event);
    }
    /**
     * POST raw body to /host/upload or /host/clipboard with the same XHR progress path as file upload.
     */
    postHostPayloadWithProgress(path, body, source, options) {
        const total = body.size;
        return new Promise((resolve, reject) => {
            this.emitFileTransferProgress(0, 0, total, source);
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `${this.api.host_url}${path}`);
            if (this.api.bearer) {
                xhr.setRequestHeader("Authorization", `Bearer ${this.api.bearer}`);
            }
            if (path === "/host/clipboard") {
                xhr.setRequestHeader("Content-Type", "text/plain;charset=UTF-8");
            }
            if (options.extraHeaders) {
                const extra = options.extraHeaders;
                for (const k of Object.keys(extra)) {
                    xhr.setRequestHeader(k, extra[k]);
                }
            }
            xhr.upload.onprogress = (event) => {
                if (!event.lengthComputable) {
                    return;
                }
                const percent = Math.round((event.loaded / event.total) * 100);
                this.emitFileTransferProgress(percent, event.loaded, event.total, source);
                const tag = source === "clipboard" ? "[Clipboard]" : "[Upload]";
                this.debugLog(`${tag} ${options.logLabel}: ${percent}% (${event.loaded}/${event.total} B)`);
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    this.emitFileTransferProgress(100, total, total, source);
                    this.debugLog(`${source === "clipboard" ? "[Clipboard]" : "[Upload]"} Completed: ${options.logLabel}`);
                    resolve();
                }
                else {
                    this.emitFileTransferProgressEnd(source);
                    this.debugLog(`${source === "clipboard" ? "[Clipboard]" : "[Upload]"} Failed (${xhr.status}): ${options.logLabel}`);
                    reject(new Error(`POST ${path} failed with status ${xhr.status}`));
                }
            };
            xhr.onerror = () => {
                this.emitFileTransferProgressEnd(source);
                this.debugLog(`${source === "clipboard" ? "[Clipboard]" : "[Upload]"} Network error: ${options.logLabel}`);
                reject(new Error(`POST ${path} network error`));
            };
            xhr.send(body);
        });
    }
    /** Upload one file to the host (drag/drop, paste from file clipboard, etc.). */
    uploadFileToHost(file) {
        const extraHeaders = {
            "X-File-Name": encodeURIComponent(file.name),
        };
        const dir = this.hostUploadRelativeDir.trim();
        if (dir.length > 0) {
            extraHeaders["X-Host-Relative-Dir"] = encodeURIComponent(dir);
        }
        return this.postHostPayloadWithProgress("/host/upload", file, "file", {
            logLabel: file.name,
            extraHeaders,
        });
    }
    /**
     * Optional: write plain text to moonlight-clipboard-sync.txt on the host (HTTP).
     * Not used for normal paste — use Ctrl/Cmd+Shift+V in the viewer to send clipboard text to the host.
     */
    syncClipboardToHost(text) {
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        return this.postHostPayloadWithProgress("/host/clipboard", blob, "clipboard", {
            logLabel: "text to host",
        });
    }
    debugLog(message, additional) {
        for (const line of message.split("\n")) {
            const event = new CustomEvent("stream-info", {
                detail: { type: "addDebugLine", line, additional }
            });
            this.eventTarget.dispatchEvent(event);
        }
    }
    onMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if ("DebugLog" in message) {
                const debugLog = message.DebugLog;
                this.debugLog(debugLog.message, {
                    type: (_a = debugLog.ty) !== null && _a !== void 0 ? _a : undefined
                });
            }
            else if ("UpdateApp" in message) {
                const event = new CustomEvent("stream-info", {
                    detail: { type: "app", app: message.UpdateApp.app }
                });
                this.eventTarget.dispatchEvent(event);
            }
            else if ("ConnectionComplete" in message) {
                const capabilities = message.ConnectionComplete.capabilities;
                const formatRaw = message.ConnectionComplete.format;
                const width = message.ConnectionComplete.width;
                const height = message.ConnectionComplete.height;
                const fps = message.ConnectionComplete.fps;
                const audioSampleRate = message.ConnectionComplete.audio_sample_rate;
                const audioChannelCount = message.ConnectionComplete.audio_channel_count;
                const audioStreams = message.ConnectionComplete.audio_streams;
                const audioCoupledStreams = message.ConnectionComplete.audio_coupled_streams;
                const audioSamplesPerFrame = message.ConnectionComplete.audio_samples_per_frame;
                const audioMapping = message.ConnectionComplete.audio_mapping;
                const format = getSelectedVideoCodec(formatRaw);
                if (format == null) {
                    this.debugLog(`Video Format ${formatRaw} was not found! Couldn't start stream!`, { type: "fatal" });
                    return;
                }
                const event = new CustomEvent("stream-info", {
                    detail: { type: "connectionComplete", capabilities }
                });
                this.eventTarget.dispatchEvent(event);
                this.input.onStreamStart(capabilities, [width, height]);
                this.stats.setVideoInfo(format !== null && format !== void 0 ? format : "Unknown", width, height, fps);
                // HDR state will be set when server sends HdrModeUpdate message
                // Don't initialize from settings.hdr because that's just the user's preference,
                // not the actual HDR state (which depends on host support, display, and codec)
                if (this.settings.hdr) {
                    this.debugLog("HDR requested by user, waiting for host confirmation...");
                }
                // we should allow streaming without audio
                if (!this.audioPlayer) {
                    showErrorPopup("Failed to find supported audio player -> audio is missing.");
                }
                if (!this.videoRenderer || !this.audioPlayer) {
                    throw "Video renderer or audio player not initialized!";
                }
                yield Promise.all([
                    this.videoRenderer.setup({
                        codec: format,
                        fps,
                        width,
                        height,
                    }),
                    this.audioPlayer.setup({
                        sampleRate: audioSampleRate,
                        channels: audioChannelCount,
                        streams: audioStreams,
                        coupledStreams: audioCoupledStreams,
                        samplesPerFrame: audioSamplesPerFrame,
                        mapping: audioMapping,
                    })
                ]);
            }
            else if ("ConnectionTerminated" in message) {
                const code = message.ConnectionTerminated.error_code;
                this.debugLog(`ConnectionTerminated with code ${code}`, { type: "fatalDescription" });
            }
            // -- WebRTC Config
            else if ("Setup" in message) {
                const iceServers = message.Setup.ice_servers;
                this.iceServers = iceServers;
                this.debugLog(`window.isSecureContext: ${window.isSecureContext}`);
                this.debugLog(`Using WebRTC Ice Servers: ${createPrettyList(iceServers.map(server => server.urls).reduce((list, url) => list.concat(url), []))}`);
                yield this.startConnection();
            }
            // -- WebRTC
            else if ("WebRtc" in message) {
                const webrtcMessage = message.WebRtc;
                if (this.transport instanceof WebRTCTransport) {
                    this.transport.onReceiveMessage(webrtcMessage);
                }
                else {
                    this.debugLog(`Received WebRTC message but transport is currently ${(_b = this.transport) === null || _b === void 0 ? void 0 : _b.implementationName}`);
                }
            }
        });
    }
    startConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            this.debugLog(`Using transport: ${this.settings.dataTransport}`);
            this.resetKeyboardState("before connection start");
            if (this.settings.dataTransport == "auto") {
                let shutdownReason = yield this.tryWebRTCTransport();
                if (shutdownReason == "failednoconnect") {
                    this.debugLog("Failed to establish WebRTC connection. Falling back to Web Socket transport.", { type: "ifErrorDescription" });
                    yield this.tryWebSocketTransport();
                }
            }
            else if (this.settings.dataTransport == "webrtc") {
                yield this.tryWebRTCTransport();
            }
            else if (this.settings.dataTransport == "websocket") {
                yield this.tryWebSocketTransport();
            }
            this.debugLog("Tried all configured transport options but no connection was possible", { type: "fatal" });
        });
    }
    resetKeyboardState(reason) {
        this.debugLog(`[Keyboard] Resetting keyboard state (${reason})`);
        this.input.onInputContextLost();
    }
    setTransport(transport) {
        if (this.transport) {
            this.resetKeyboardState("before transport switch");
            this.transport.close();
        }
        this.transport = transport;
        this.resetKeyboardState("after transport switch");
        this.input.setTransport(this.transport);
        this.stats.setTransport(this.transport);
        if (transport instanceof WebRTCTransport) {
            transport.onFileTransferProgress = (_direction, _fileName, progressPercent) => {
                this.emitFileTransferProgress(progressPercent);
            };
            transport.onFileReceived = (fileName, blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = fileName;
                a.rel = "noopener";
                a.click();
                URL.revokeObjectURL(url);
                this.emitFileTransferProgressEnd();
            };
        }
        const rtt = this.transport.getChannel(TransportChannelId.RTT);
        if (rtt.type == "data") {
            rtt.addReceiveListener((data) => {
                const buffer = new ByteBuffer(data.byteLength);
                buffer.putU8Array(new Uint8Array(data));
                buffer.flip();
                const ty = buffer.getU8();
                if (ty == 0) {
                    rtt.send(data);
                }
            });
        }
        else {
            this.debugLog("Failed to get rtt as data transport channel. Cannot respond to rtt packets");
        }
        // Setup GENERAL channel listener for HDR mode updates
        const generalChannel = this.transport.getChannel(TransportChannelId.GENERAL);
        this.debugLog(`[GENERAL] Setting up GENERAL channel listener, type=${generalChannel.type}`);
        if (generalChannel.type === "data") {
            generalChannel.addReceiveListener((data) => {
                this.onGeneralChannelMessage(data);
            });
            this.debugLog(`[GENERAL] GENERAL channel listener registered`);
        }
        else {
            this.debugLog(`[GENERAL] Cannot register listener, channel type is not 'data'`);
        }
    }
    onGeneralChannelMessage(data) {
        this.debugLog(`[GENERAL] Received message on GENERAL channel, size=${data.byteLength}`);
        const buffer = new Uint8Array(data);
        if (buffer.length < 2) {
            this.debugLog(`[GENERAL] Message too short: ${buffer.length} bytes`);
            return;
        }
        const textLength = (buffer[0] << 8) | buffer[1];
        if (buffer.length < 2 + textLength) {
            this.debugLog(`[GENERAL] Message incomplete: expected ${2 + textLength} bytes, got ${buffer.length}`);
            return;
        }
        const text = new TextDecoder().decode(buffer.slice(2, 2 + textLength));
        this.debugLog(`[GENERAL] Parsed message: ${text}`);
        try {
            const message = JSON.parse(text);
            this.handleGeneralMessage(message);
        }
        catch (err) {
            this.debugLog(`Failed to parse general message: ${err}`);
        }
    }
    handleGeneralMessage(message) {
        if ("HdrModeUpdate" in message) {
            const hdrUpdate = message.HdrModeUpdate;
            if (hdrUpdate) {
                const enabled = hdrUpdate.enabled;
                this.debugLog(`HDR mode ${enabled ? "enabled" : "disabled"}`);
                this.setHdrMode(enabled);
            }
        }
        else if ("ConnectionStatusUpdate" in message) {
            const statusUpdate = message.ConnectionStatusUpdate;
            if (statusUpdate) {
                const status = statusUpdate.status;
                const event = new CustomEvent("stream-info", {
                    detail: { type: "connectionStatus", status }
                });
                this.eventTarget.dispatchEvent(event);
            }
        }
    }
    setHdrMode(enabled) {
        this.stats.setHdrEnabled(enabled);
        if (this.videoRenderer) {
            if ("setHdrMode" in this.videoRenderer && typeof this.videoRenderer.setHdrMode === "function") {
                this.videoRenderer.setHdrMode(enabled);
            }
        }
    }
    sendGeneralMessage(message) {
        var _a;
        const general = (_a = this.transport) === null || _a === void 0 ? void 0 : _a.getChannel(TransportChannelId.GENERAL);
        if (!general || general.type != "data") {
            return false;
        }
        const text = JSON.stringify(message);
        const buffer = BIG_BUFFER;
        buffer.reset();
        buffer.putU16(text.length);
        buffer.putUtf8Raw(text);
        buffer.flip();
        general.send(buffer.getRemainingBuffer().buffer);
        return true;
    }
    tryWebRTCTransport() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            this.debugLog("Trying WebRTC transport");
            this.sendWsMessage({
                SetTransport: "WebRTC"
            });
            if (!this.iceServers) {
                this.debugLog(`Failed to try WebRTC Transport: no ice servers available`);
                return "failednoconnect";
            }
            const transport = new WebRTCTransport(this.logger);
            transport.onsendmessage = (message) => this.sendWsMessage({ WebRtc: message });
            transport.initPeer({
                iceServers: this.iceServers,
                iceTransportPolicy: "relay",
            });
            this.setTransport(transport);
            // Wait for negotiation
            const result = yield (new Promise((resolve, _reject) => {
                transport.onconnect = () => resolve(true);
                transport.onclose = () => {
                    this.resetKeyboardState("transport closed during negotiation");
                    resolve(false);
                };
            }));
            this.debugLog(`WebRTC negotiation success: ${result}`);
            if (!result) {
                return "failednoconnect";
            }
            // Print pipe support
            const pipesInfo = yield gatherPipeInfo();
            this.logger.debug(`Supported Pipes: {`);
            let isFirst = true;
            for (const [key, value] of pipesInfo.entries()) {
                this.logger.debug(`${isFirst ? "" : ","}"${(_a = getPipe(key)) === null || _a === void 0 ? void 0 : _a.name}": ${JSON.stringify(value)}`);
                isFirst = false;
            }
            this.logger.debug(`}`);
            const videoCodecSupport = yield this.createPipelines();
            if (!videoCodecSupport) {
                this.debugLog("No video pipeline was found for the codec that was specified. If you're unsure which codecs are supported use H264.", { type: "fatalDescription" });
                yield transport.close();
                return "failednoconnect";
            }
            yield this.startStream(videoCodecSupport);
            return new Promise((resolve, reject) => {
                transport.onclose = (shutdown) => {
                    this.resetKeyboardState(`transport closed (${shutdown})`);
                    resolve(shutdown);
                };
            });
        });
    }
    tryWebSocketTransport() {
        return __awaiter(this, void 0, void 0, function* () {
            this.debugLog("Trying Web Socket transport");
            this.sendWsMessage({
                SetTransport: "WebSocket"
            });
            const transport = new WebSocketTransport(this.ws, BIG_BUFFER, this.logger);
            this.setTransport(transport);
            const videoCodecSupport = yield this.createPipelines();
            if (!videoCodecSupport) {
                this.debugLog("Failed to start stream because no video pipeline with support for the specified codec was found!", { type: "fatalDescription" });
                return;
            }
            yield this.startStream(videoCodecSupport);
            return new Promise((resolve, reject) => {
                transport.onclose = (shutdown) => {
                    this.resetKeyboardState(`transport closed (${shutdown})`);
                    resolve(shutdown);
                };
            });
        });
    }
    createPipelines() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            // Print supported pipes
            const pipesInfo = yield gatherPipeInfo();
            this.logger.debug(`Supported Pipes: {`);
            let isFirst = true;
            for (const [pipe, info] of pipesInfo) {
                this.logger.debug(`${isFirst ? "" : ","}"${pipe.name}": ${JSON.stringify(info)}`);
                isFirst = false;
            }
            this.logger.debug(`}`);
            // Create pipelines
            const [supportedVideoCodecs] = yield Promise.all([this.createVideoRenderer(), this.createAudioPlayer()]);
            const videoPipelineName = `${(_a = this.transport) === null || _a === void 0 ? void 0 : _a.getChannel(TransportChannelId.HOST_VIDEO).type} (transport) -> ${(_b = this.videoRenderer) === null || _b === void 0 ? void 0 : _b.implementationName} (renderer)`;
            this.debugLog(`Using video pipeline: ${videoPipelineName}`);
            const audioPipelineName = `${(_c = this.transport) === null || _c === void 0 ? void 0 : _c.getChannel(TransportChannelId.HOST_AUDIO).type} (transport) -> ${(_d = this.audioPlayer) === null || _d === void 0 ? void 0 : _d.implementationName} (player)`;
            this.debugLog(`Using audio pipeline: ${audioPipelineName}`);
            this.stats.setVideoPipeline(videoPipelineName, this.videoRenderer);
            this.stats.setAudioPipeline(audioPipelineName, this.audioPlayer);
            return supportedVideoCodecs;
        });
    }
    createVideoRenderer() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.videoRenderer) {
                this.debugLog("Found an old video renderer -> cleaning it up");
                this.videoRenderer.unmount(this.divElement);
                this.videoRenderer.cleanup();
                this.videoRenderer = null;
            }
            if (!this.transport) {
                this.debugLog("Failed to setup video without transport");
                return null;
            }
            const codecHint = getVideoCodecHint(this.settings);
            this.debugLog(`Codec Hint by the user: ${JSON.stringify(codecHint)}`);
            if (!hasAnyCodec(codecHint)) {
                this.debugLog("Couldn't find any supported video format. Change the codec option to H264 in the settings if you're unsure which codecs are supported.", { type: "fatalDescription" });
                return null;
            }
            const transportCodecSupport = yield this.transport.setupHostVideo({
                type: ["videotrack", "data"]
            });
            this.debugLog(`Transport supports these video codecs: ${JSON.stringify(transportCodecSupport)}`);
            const videoSettings = {
                supportedVideoCodecs: andVideoCodecs(codecHint, transportCodecSupport),
                canvasRenderer: this.settings.canvasRenderer,
                forceVideoElementRenderer: this.settings.forceVideoElementRenderer,
                canvasVsync: this.settings.canvasVsync
            };
            let pipelineCodecSupport;
            const video = this.transport.getChannel(TransportChannelId.HOST_VIDEO);
            if (video.type == "videotrack") {
                const { videoRenderer, supportedCodecs, error } = yield buildVideoPipeline("videotrack", videoSettings, this.logger);
                if (error) {
                    return null;
                }
                pipelineCodecSupport = supportedCodecs;
                videoRenderer.mount(this.divElement);
                video.addTrackListener((track) => {
                    videoRenderer.setTrack(track);
                });
                this.videoRenderer = videoRenderer;
            }
            else if (video.type == "data") {
                const { videoRenderer, supportedCodecs, error } = yield buildVideoPipeline("data", videoSettings, this.logger);
                if (error) {
                    return null;
                }
                pipelineCodecSupport = supportedCodecs;
                videoRenderer.mount(this.divElement);
                video.addReceiveListener((data) => {
                    videoRenderer.submitPacket(data);
                    // data pipeline support requesting idrs over video channel
                    if (videoRenderer.pollRequestIdr()) {
                        const buffer = new ByteBuffer(1);
                        buffer.putU8(0);
                        buffer.flip();
                        video.send(buffer.getRemainingBuffer().buffer);
                    }
                });
                this.videoRenderer = videoRenderer;
            }
            else {
                this.debugLog(`Failed to create video pipeline with transport channel of type ${video.type} (${this.transport.implementationName})`);
                return null;
            }
            return pipelineCodecSupport;
        });
    }
    createAudioPlayer() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (this.audioPlayer) {
                this.debugLog("Found an old audio player -> cleaning it up");
                this.audioPlayer.unmount(this.divElement);
                this.audioPlayer.cleanup();
                this.audioPlayer = null;
            }
            if (!this.transport) {
                this.debugLog("Failed to setup audio without transport");
                return false;
            }
            this.transport.setupHostAudio({
                type: ["audiotrack", "data"]
            });
            const audio = (_a = this.transport) === null || _a === void 0 ? void 0 : _a.getChannel(TransportChannelId.HOST_AUDIO);
            if (audio.type == "audiotrack") {
                const { audioPlayer, error } = yield buildAudioPipeline("audiotrack", this.settings, this.logger);
                if (error) {
                    return false;
                }
                audioPlayer.mount(this.divElement);
                audio.addTrackListener((track) => audioPlayer.setTrack(track));
                this.audioPlayer = audioPlayer;
            }
            else if (audio.type == "data") {
                const { audioPlayer, error } = yield buildAudioPipeline("data", this.settings, this.logger);
                if (error) {
                    return false;
                }
                audioPlayer.mount(this.divElement);
                audio.addReceiveListener((data) => {
                    audioPlayer.submitPacket(data);
                });
                this.audioPlayer = audioPlayer;
            }
            else {
                this.debugLog(`Cannot find audio pipeline for transport type "${audio.type}"`);
                return false;
            }
            return true;
        });
    }
    startStream(videoCodecSupport) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            this.resetKeyboardState("before stream start");
            const message = {
                StartStream: {
                    bitrate: this.settings.bitrate,
                    packet_size: this.settings.packetSize,
                    fps: this.settings.fps,
                    width: this.streamerSize[0],
                    height: this.streamerSize[1],
                    play_audio_local: this.settings.playAudioLocal,
                    video_supported_formats: createSupportedVideoFormatsBits(videoCodecSupport),
                    video_colorspace: "Rec709",
                    video_color_range_full: false,
                    hdr: (_a = this.settings.hdr) !== null && _a !== void 0 ? _a : false,
                }
            };
            this.debugLog(`Starting stream with info: ${JSON.stringify(message)}`);
            this.debugLog(`Stream video codec info: ${JSON.stringify(videoCodecSupport)}`);
            // Log HDR requirements if HDR is requested
            if (this.settings.hdr) {
                const hasHdrCodec = videoCodecSupport.H265_MAIN10 || videoCodecSupport.AV1_MAIN10;
                if (!hasHdrCodec) {
                    this.debugLog(`Warning: HDR requested but no 10-bit codec available. HDR requires H265_MAIN10 or AV1_MAIN10 support.`);
                }
                else {
                    this.debugLog(`HDR codec available: H265_MAIN10=${videoCodecSupport.H265_MAIN10}, AV1_MAIN10=${videoCodecSupport.AV1_MAIN10}`);
                }
            }
            this.sendWsMessage(message);
        });
    }
    mount(parent) {
        parent.appendChild(this.divElement);
    }
    unmount(parent) {
        this.resetKeyboardState("stream unmount");
        this.divElement.removeEventListener("dragover", this.dragOverHandler);
        this.divElement.removeEventListener("drop", this.dropHandler);
        parent.removeChild(this.divElement);
    }
    getVideoRenderer() {
        return this.videoRenderer;
    }
    getAudioPlayer() {
        return this.audioPlayer;
    }
    onWsOpen() {
        this.debugLog(`Web Socket Open`);
        for (const raw of this.wsSendBuffer.splice(0)) {
            this.ws.send(raw);
        }
    }
    onWsClose() {
        this.debugLog(`Web Socket Closed`);
        this.resetKeyboardState("websocket closed");
    }
    onError(event) {
        this.debugLog(`Web Socket or WebRtcPeer Error`);
        this.resetKeyboardState("transport error");
        console.error(`Web Socket or WebRtcPeer Error`, event);
    }
    sendWsMessage(message) {
        const raw = JSON.stringify(message);
        if (this.ws.readyState == WebSocket.OPEN) {
            this.ws.send(raw);
        }
        else {
            this.wsSendBuffer.push(raw);
        }
    }
    onRawWsMessage(event) {
        const message = event.data;
        if (typeof message == "string") {
            const json = JSON.parse(message);
            this.onMessage(json);
        }
    }
    stop() {
        this.resetKeyboardState("before stream stop");
        if (!this.sendGeneralMessage("Stop")) {
            return Promise.resolve(false);
        }
        // Wait for the message to get sent
        return new Promise((resolve, _reject) => {
            setTimeout(() => resolve(true), 100);
        });
    }
    // -- Class Api
    addInfoListener(listener) {
        this.eventTarget.addEventListener("stream-info", listener);
    }
    removeInfoListener(listener) {
        this.eventTarget.removeEventListener("stream-info", listener);
    }
    getInput() {
        return this.input;
    }
    getStats() {
        return this.stats;
    }
    getStreamerSize() {
        return this.streamerSize;
    }
}
function createPrettyList(list) {
    let isFirst = true;
    let text = "[";
    for (const item of list) {
        if (!isFirst) {
            text += ", ";
        }
        isFirst = false;
        text += item;
    }
    text += "]";
    return text;
}
