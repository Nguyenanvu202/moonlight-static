var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { TransportChannelId } from "../../api_bindings.js";
import { CAPABILITIES_CODECS, emptyVideoCodecs, maybeVideoCodecs } from "../video.js";
import { TRANSPORT_CHANNEL_OPTIONS } from "./index.js";
export class WebRTCTransport {
    constructor(logger) {
        this.implementationName = "webrtc";
        this.peer = null;
        this.fileTransferChannel = null;
        this.onFileTransferProgress = null;
        this.onFileReceived = null;
        // Prevent renegotiation spam: track whether a negotiation is already in progress
        this.isNegotiating = false;
        this.FILE_TRANSFER_CHUNK_SIZE = 16 * 1024;
        this.FILE_TRANSFER_BUFFERED_LIMIT = 500000;
        this.onsendmessage = null;
        this.remoteDescription = null;
        this.iceCandidates = [];
        this.wasConnected = false;
        this.channels = [];
        this.videoTrackHolder = { ontrack: null, track: null };
        this.videoReceiver = null;
        this.audioTrackHolder = { ontrack: null, track: null };
        this.onconnect = null;
        this.onclose = null;
        this.logger = logger !== null && logger !== void 0 ? logger : null;
    }
    initPeer(configuration) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`Creating Client Peer`);
            if (this.peer) {
                (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug(`Cannot create Peer because a Peer already exists`);
                return;
            }
            // Configure WebRTC, forcing relay-only before any channels are created
            const baseConfig = configuration ? Object.assign({}, configuration) : {};
            // Filter ICE servers to TURN-only so no host/srflx candidates are discovered
            if (baseConfig.iceServers) {
                const before = baseConfig.iceServers.length;
                baseConfig.iceServers = baseConfig.iceServers.filter(server => {
                    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
                    return urls.some(url => typeof url === "string" && (url.startsWith("turn:") || url.startsWith("turns:")));
                });
                (_c = this.logger) === null || _c === void 0 ? void 0 : _c.debug(`Filtered ICE servers for relay-only: ${before} -> ${baseConfig.iceServers.length}`);
            }
            // Enforce relay at the ICE policy level
            baseConfig.iceTransportPolicy = "relay";
            this.peer = new RTCPeerConnection(baseConfig);
            this.peer.addEventListener("error", this.onError.bind(this));
            this.peer.addEventListener("negotiationneeded", this.onNegotiationNeeded.bind(this));
            this.peer.addEventListener("icecandidate", this.onIceCandidate.bind(this));
            this.peer.addEventListener("connectionstatechange", this.onConnectionStateChange.bind(this));
            this.peer.addEventListener("signalingstatechange", this.onSignalingStateChange.bind(this));
            this.peer.addEventListener("iceconnectionstatechange", this.onIceConnectionStateChange.bind(this));
            this.peer.addEventListener("icegatheringstatechange", this.onIceGatheringStateChange.bind(this));
            this.peer.addEventListener("track", this.onTrack.bind(this));
            this.peer.addEventListener("datachannel", this.onDataChannel.bind(this));
            // Dedicated file transfer channel on the existing streaming peer
            this.fileTransferChannel = this.setupFileSender(this.peer);
            this.initChannels();
            // Maybe we already received data
            if (this.remoteDescription) {
                yield this.handleRemoteDescription(this.remoteDescription);
            }
            else {
                yield this.onNegotiationNeeded();
            }
            yield this.tryDequeueIceCandidates();
        });
    }
    // setupFileSender(pc): create sender-side channel
    setupFileSender(pc) {
        const dc = pc.createDataChannel("fileTransfer", {
            ordered: true
        });
        dc.binaryType = "arraybuffer";
        dc.bufferedAmountLowThreshold = this.FILE_TRANSFER_BUFFERED_LIMIT / 2;
        dc.addEventListener("open", () => {
            var _a;
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("fileTransfer channel open");
        });
        dc.addEventListener("close", () => {
            var _a;
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("fileTransfer channel closed");
        });
        dc.addEventListener("error", (event) => {
            var _a;
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`fileTransfer channel error: ${event}`);
        });
        return dc;
    }
    // setupFileReceiver(dc): receiver-side chunk reassembly
    setupFileReceiver(dc) {
        dc.binaryType = "arraybuffer";
        let expectedFileName = "";
        let expectedFileSize = 0;
        let receivedBytes = 0;
        let chunks = [];
        dc.addEventListener("message", (event) => {
            var _a, _b, _c, _d, _e, _f;
            if (typeof event.data === "string") {
                try {
                    const meta = JSON.parse(event.data);
                    if (meta.type === "file-meta" && typeof meta.name === "string" && typeof meta.size === "number") {
                        expectedFileName = meta.name;
                        expectedFileSize = meta.size;
                        receivedBytes = 0;
                        chunks = [];
                        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`Receiving file over DataChannel: ${expectedFileName} (${expectedFileSize} bytes)`);
                    }
                }
                catch (_g) {
                    (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug("fileTransfer received invalid metadata JSON");
                }
                return;
            }
            if (!(event.data instanceof ArrayBuffer) || expectedFileSize <= 0) {
                return;
            }
            chunks.push(event.data);
            receivedBytes += event.data.byteLength;
            const progress = Math.min(100, Math.round((receivedBytes / expectedFileSize) * 100));
            (_c = this.onFileTransferProgress) === null || _c === void 0 ? void 0 : _c.call(this, "receive", expectedFileName, progress);
            (_d = this.logger) === null || _d === void 0 ? void 0 : _d.debug(`fileTransfer receive progress: ${expectedFileName} ${progress}% (${receivedBytes}/${expectedFileSize})`);
            if (receivedBytes >= expectedFileSize) {
                const file = new Blob(chunks);
                (_e = this.logger) === null || _e === void 0 ? void 0 : _e.debug(`fileTransfer receive complete: ${expectedFileName} (${receivedBytes} bytes)`);
                (_f = this.onFileReceived) === null || _f === void 0 ? void 0 : _f.call(this, expectedFileName, file);
                // reset receiver state for next file
                expectedFileName = "";
                expectedFileSize = 0;
                receivedBytes = 0;
                chunks = [];
            }
        });
    }
    readFileSlice(file, start, end) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(reader.error);
                reader.onload = () => resolve(reader.result);
                reader.readAsArrayBuffer(file.slice(start, end));
            });
        });
    }
    sleep(ms) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise(resolve => setTimeout(resolve, ms));
        });
    }
    // Public API for sending a file over fileTransfer DataChannel
    sendFile(file) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const dc = this.fileTransferChannel;
            if (!dc || dc.readyState !== "open") {
                throw new Error("fileTransfer DataChannel is not open");
            }
            const metadata = JSON.stringify({
                type: "file-meta",
                name: file.name,
                size: file.size
            });
            dc.send(metadata);
            let sentBytes = 0;
            while (sentBytes < file.size) {
                while (dc.bufferedAmount > this.FILE_TRANSFER_BUFFERED_LIMIT) {
                    // Backpressure control to protect stream quality
                    yield this.sleep(10);
                }
                const nextEnd = Math.min(sentBytes + this.FILE_TRANSFER_CHUNK_SIZE, file.size);
                const chunk = yield this.readFileSlice(file, sentBytes, nextEnd);
                dc.send(chunk);
                sentBytes = nextEnd;
                const progress = Math.min(100, Math.round((sentBytes / file.size) * 100));
                (_a = this.onFileTransferProgress) === null || _a === void 0 ? void 0 : _a.call(this, "send", file.name, progress);
                (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug(`fileTransfer send progress: ${file.name} ${progress}% (${sentBytes}/${file.size})`);
                // Small pacing delay to avoid media starvation when network is tight
                yield this.sleep(1);
            }
            (_c = this.logger) === null || _c === void 0 ? void 0 : _c.debug(`fileTransfer send complete: ${file.name} (${file.size} bytes)`);
        });
    }
    onError(event) {
        var _a;
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`Web Socket or WebRtcPeer Error`);
        console.error(`Web Socket or WebRtcPeer Error`, event);
    }
    sendMessage(message) {
        var _a;
        if (this.onsendmessage) {
            this.onsendmessage(message);
        }
        else {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("Failed to call onicecandidate because no handler is set");
        }
    }
    onReceiveMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            if ("Description" in message) {
                const description = message.Description;
                yield this.handleRemoteDescription({
                    type: description.ty,
                    sdp: description.sdp
                });
            }
            else if ("AddIceCandidate" in message) {
                const candidate = message.AddIceCandidate;
                yield this.addIceCandidate({
                    candidate: candidate.candidate,
                    sdpMid: candidate.sdp_mid,
                    sdpMLineIndex: candidate.sdp_mline_index,
                    usernameFragment: candidate.username_fragment
                });
            }
        });
    }
    onNegotiationNeeded() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            // We're polite
            if (!this.peer) {
                (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("OnNegotiationNeeded without a peer");
                return;
            }
            // Avoid renegotiation spam: only allow one negotiation at a time
            if (this.isNegotiating || this.peer.signalingState !== "stable") {
                (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug(`OnNegotiationNeeded ignored because negotiation is already in progress or signalingState=${this.peer.signalingState}`);
                return;
            }
            this.isNegotiating = true;
            try {
                yield this.peer.setLocalDescription();
                const localDescription = this.peer.localDescription;
                if (!localDescription) {
                    (_c = this.logger) === null || _c === void 0 ? void 0 : _c.debug("Failed to set local description in OnNegotiationNeeded");
                    return;
                }
                // Enforce relay-only candidates and prioritize relay at SDP level
                const mungedSdp = this.enforceRelayInSdp((_d = localDescription.sdp) !== null && _d !== void 0 ? _d : "");
                (_e = this.logger) === null || _e === void 0 ? void 0 : _e.debug(`OnNegotiationNeeded: Sending local description (relay-only): ${localDescription.type}`);
                this.sendMessage({
                    Description: {
                        ty: localDescription.type,
                        sdp: mungedSdp
                    }
                });
            }
            catch (err) {
                (_f = this.logger) === null || _f === void 0 ? void 0 : _f.debug(`OnNegotiationNeeded failed: ${err}`);
                // In case of error, clear negotiation flag so we can recover
                this.isNegotiating = false;
            }
        });
    }
    handleRemoteDescription(sdp) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`Received remote description: ${sdp === null || sdp === void 0 ? void 0 : sdp.type}`);
            const remoteDescription = sdp;
            this.remoteDescription = remoteDescription;
            if (!this.peer) {
                return;
            }
            this.remoteDescription = null;
            if (remoteDescription) {
                try {
                    // Remote description handling is part of negotiation; mark as negotiating to
                    // avoid conflicting local renegotiations until we reach a stable state again.
                    this.isNegotiating = true;
                    yield this.peer.setRemoteDescription(remoteDescription);
                    if (remoteDescription.type == "offer") {
                        yield this.peer.setLocalDescription();
                        const localDescription = this.peer.localDescription;
                        if (!localDescription) {
                            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug("Peer didn't have a localDescription whilst receiving an offer and trying to answer");
                            return;
                        }
                        // Enforce relay-only candidates and prioritize relay at SDP level for the answer
                        const mungedSdp = this.enforceRelayInSdp((_c = localDescription.sdp) !== null && _c !== void 0 ? _c : "");
                        (_d = this.logger) === null || _d === void 0 ? void 0 : _d.debug(`Responding to offer description (relay-only): ${localDescription.type}`);
                        this.sendMessage({
                            Description: {
                                ty: localDescription.type,
                                sdp: mungedSdp
                            }
                        });
                    }
                }
                catch (err) {
                    (_e = this.logger) === null || _e === void 0 ? void 0 : _e.debug(`handleRemoteDescription failed: ${err}`);
                    // On error, clear negotiation flag so we can recover
                    this.isNegotiating = false;
                }
            }
        });
    }
    onIceCandidate(event) {
        var _a, _b, _c, _d, _e, _f, _g;
        if (event.candidate) {
            const candidate = event.candidate.toJSON();
            // Enforce relay: drop non-relay candidates at the trickle ICE level
            if (candidate.candidate && !candidate.candidate.includes(" typ relay")) {
                (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`Dropping non-relay ICE candidate: ${candidate.candidate}`);
                return;
            }
            // Optionally, bump relay candidate priority to be highest
            if (candidate.candidate) {
                const tokens = candidate.candidate.split(" ");
                // candidate:<id> <component> <protocol> <priority> ...
                if (tokens.length > 3) {
                    // Use a very high constant for relay priority
                    tokens[3] = "2114000000";
                    candidate.candidate = tokens.join(" ");
                }
            }
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug(`Sending relay ICE candidate: ${candidate.candidate}`);
            this.sendMessage({
                AddIceCandidate: {
                    candidate: (_c = candidate.candidate) !== null && _c !== void 0 ? _c : "",
                    sdp_mid: (_d = candidate.sdpMid) !== null && _d !== void 0 ? _d : null,
                    sdp_mline_index: (_e = candidate.sdpMLineIndex) !== null && _e !== void 0 ? _e : null,
                    username_fragment: (_f = candidate.usernameFragment) !== null && _f !== void 0 ? _f : null
                }
            });
        }
        else {
            (_g = this.logger) === null || _g === void 0 ? void 0 : _g.debug("No new ice candidates");
        }
    }
    // SDP munging helper: keep only relay candidates and ensure relay-first priority
    enforceRelayInSdp(sdp) {
        if (!sdp) {
            return sdp;
        }
        const lines = sdp.split(/\r\n|\n/);
        const newLines = [];
        for (const line of lines) {
            if (!line.startsWith("a=candidate:")) {
                newLines.push(line);
                continue;
            }
            // Only keep relay candidates
            if (!line.includes(" typ relay")) {
                continue;
            }
            const tokens = line.split(" ");
            if (tokens.length > 3) {
                // tokens[3] is the priority field
                tokens[3] = "2114000000";
            }
            newLines.push(tokens.join(" "));
        }
        return newLines.join("\r\n");
    }
    addIceCandidate(candidate) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`Received ice candidate: ${candidate.candidate}`);
            if (!this.peer) {
                (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug("Buffering ice candidate");
                this.iceCandidates.push(candidate);
                return;
            }
            yield this.tryDequeueIceCandidates();
            yield this.peer.addIceCandidate(candidate);
        });
    }
    tryDequeueIceCandidates() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!this.peer) {
                (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("called tryDequeueIceCandidates without a peer");
                return;
            }
            for (const candidate of this.iceCandidates) {
                yield this.peer.addIceCandidate(candidate);
            }
            this.iceCandidates.length = 0;
        });
    }
    onConnectionStateChange() {
        var _a, _b;
        if (!this.peer) {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("OnConnectionStateChange without a peer");
            return;
        }
        let type = null;
        if (this.peer.connectionState == "connected") {
            type = "recover";
            if (this.onconnect) {
                this.onconnect();
                // Log selected ICE candidate pair details once the connection is established
                this.logSelectedCandidatePairDetails().catch(err => {
                    var _a;
                    (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`Failed to log ICE candidate pair details: ${err}`);
                });
            }
            this.wasConnected = true;
        }
        else if ((this.peer.connectionState == "failed" || this.peer.connectionState == "closed") && this.peer.iceGatheringState == "complete") {
            type = "fatal";
        }
        if (this.peer.connectionState == "failed" || this.peer.connectionState == "closed") {
            if (this.onclose) {
                if (this.wasConnected) {
                    this.onclose("failed");
                }
                else {
                    this.onclose("failednoconnect");
                }
            }
        }
        (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug(`Changing Peer State to ${this.peer.connectionState}`, {
            type: type !== null && type !== void 0 ? type : undefined
        });
    }
    // Log detailed information about the selected ICE candidate pair
    logSelectedCandidatePairDetails() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            if (!this.peer) {
                return;
            }
            try {
                const stats = yield this.peer.getStats();
                let selectedPair = null;
                const localCandidates = {};
                const remoteCandidates = {};
                for (const [, value] of stats.entries()) {
                    if (value.type === "candidate-pair" && value.nominated) {
                        // Prefer succeeded but fall back to any nominated pair
                        if (!selectedPair || (selectedPair.state !== "succeeded" && value.state === "succeeded")) {
                            selectedPair = value;
                        }
                    }
                    else if (value.type === "local-candidate") {
                        localCandidates[value.id] = value;
                    }
                    else if (value.type === "remote-candidate") {
                        remoteCandidates[value.id] = value;
                    }
                }
                if (!selectedPair) {
                    (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("No nominated ICE candidate pair found in stats");
                    return;
                }
                const local = localCandidates[selectedPair.localCandidateId];
                const remote = remoteCandidates[selectedPair.remoteCandidateId];
                const details = {
                    pair: {
                        id: selectedPair.id,
                        state: selectedPair.state,
                        nominated: selectedPair.nominated,
                        bytesSent: selectedPair.bytesSent,
                        bytesReceived: selectedPair.bytesReceived,
                        currentRoundTripTime: selectedPair.currentRoundTripTime,
                    },
                    localCandidate: local && {
                        id: local.id,
                        address: (_b = local.ip) !== null && _b !== void 0 ? _b : local.address,
                        port: local.port,
                        protocol: local.protocol,
                        candidateType: local.candidateType,
                        networkType: local.networkType,
                        relayProtocol: local.relayProtocol,
                        url: local.url,
                    },
                    remoteCandidate: remote && {
                        id: remote.id,
                        address: (_c = remote.ip) !== null && _c !== void 0 ? _c : remote.address,
                        port: remote.port,
                        protocol: remote.protocol,
                        candidateType: remote.candidateType,
                        networkType: remote.networkType,
                        relayProtocol: remote.relayProtocol,
                        url: remote.url,
                    }
                };
                (_d = this.logger) === null || _d === void 0 ? void 0 : _d.debug(`Selected ICE candidate pair: ${JSON.stringify(details)}`);
            }
            catch (err) {
                (_e = this.logger) === null || _e === void 0 ? void 0 : _e.debug(`Error while collecting ICE candidate stats: ${err}`);
            }
        });
    }
    onSignalingStateChange() {
        var _a, _b;
        if (!this.peer) {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("OnSignalingStateChange without a peer");
            return;
        }
        (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug(`Changing Peer Signaling State to ${this.peer.signalingState}`);
        // Once we return to a stable signaling state, allow new negotiations
        if (this.peer.signalingState === "stable") {
            this.isNegotiating = false;
        }
    }
    onIceConnectionStateChange() {
        var _a, _b;
        if (!this.peer) {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("OnIceConnectionStateChange without a peer");
            return;
        }
        (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug(`Changing Peer Ice State to ${this.peer.iceConnectionState}`);
    }
    onIceGatheringStateChange() {
        var _a, _b;
        if (!this.peer) {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("OnIceGatheringStateChange without a peer");
            return;
        }
        (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug(`Changing Peer Ice Gathering State to ${this.peer.iceGatheringState}`);
        if (this.peer.iceConnectionState == "new" && this.peer.iceGatheringState == "complete") {
            // we failed without connection
            if (this.onclose) {
                this.onclose("failednoconnect");
            }
        }
    }
    initChannels() {
        var _a, _b, _c;
        if (!this.peer) {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("Failed to initialize channel without peer");
            return;
        }
        if (this.channels.length > 0) {
            (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug("Already initialized channels");
            return;
        }
        for (const channelRaw in TRANSPORT_CHANNEL_OPTIONS) {
            const channel = channelRaw;
            const options = TRANSPORT_CHANNEL_OPTIONS[channel];
            // Channel not configured in our minimal set
            if (!options) {
                (_c = this.logger) === null || _c === void 0 ? void 0 : _c.debug(`Skipping unconfigured transport channel: ${channel}`);
                continue;
            }
            if (channel == "HOST_VIDEO") {
                const channel = new WebRTCInboundTrackTransportChannel(this.logger, "videotrack", "video", this.videoTrackHolder);
                this.channels[TransportChannelId.HOST_VIDEO] = channel;
                continue;
            }
            if (channel == "HOST_AUDIO") {
                const channel = new WebRTCInboundTrackTransportChannel(this.logger, "audiotrack", "audio", this.audioTrackHolder);
                this.channels[TransportChannelId.HOST_AUDIO] = channel;
                continue;
            }
            const id = TransportChannelId[channel];
            const dataChannel = options.serverCreated ? null : this.peer.createDataChannel(channel.toLowerCase(), {
                ordered: options.ordered,
                maxRetransmits: options.reliable ? undefined : 0
            });
            this.channels[id] = new WebRTCDataTransportChannel(channel, dataChannel);
        }
    }
    onTrack(event) {
        var _a;
        const track = event.track;
        const receiver = event.receiver;
        if (track.kind == "video") {
            this.videoReceiver = receiver;
        }
        receiver.jitterBufferTarget = 0;
        if ("playoutDelayHint" in receiver) {
            receiver.playoutDelayHint = 0;
        }
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`Adding receiver: ${track.kind}, ${track.id}, ${track.label}`);
        if (track.kind == "video") {
            if ("contentHint" in track) {
                track.contentHint = "motion";
            }
            this.videoTrackHolder.track = track;
            if (!this.videoTrackHolder.ontrack) {
                throw "No video track listener registered!";
            }
            this.videoTrackHolder.ontrack();
        }
        else if (track.kind == "audio") {
            this.audioTrackHolder.track = track;
            if (!this.audioTrackHolder.ontrack) {
                throw "No audio track listener registered!";
            }
            this.audioTrackHolder.ontrack();
        }
    }
    // Handle data channels created by the remote peer (server)
    onDataChannel(event) {
        var _a, _b, _c, _d;
        const remoteChannel = event.channel;
        const label = remoteChannel.label;
        (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug(`Received remote data channel: ${label}`);
        if (label === "fileTransfer") {
            this.fileTransferChannel = remoteChannel;
            this.setupFileReceiver(remoteChannel);
            return;
        }
        // Map the channel label to the corresponding TransportChannelId
        const channelKey = label.toUpperCase();
        if (channelKey in TransportChannelId) {
            const id = TransportChannelId[channelKey];
            const existingChannel = this.channels[id];
            // If we already have a channel for this ID, replace its underlying RTCDataChannel
            // with the remote one so we can receive messages from the server
            if (existingChannel && existingChannel.type === "data") {
                (_b = this.logger) === null || _b === void 0 ? void 0 : _b.debug(`Replacing underlying channel for ${label} with remote channel`);
                existingChannel.replaceChannel(remoteChannel);
            }
            else {
                (_c = this.logger) === null || _c === void 0 ? void 0 : _c.debug(`Creating new channel for ${label}`);
                this.channels[id] = new WebRTCDataTransportChannel(label, remoteChannel);
            }
        }
        else {
            (_d = this.logger) === null || _d === void 0 ? void 0 : _d.debug(`Unknown remote data channel: ${label}`);
        }
    }
    setupHostVideo(_setup) {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: check transport type
            var _a;
            let capabilities;
            if ("getCapabilities" in RTCRtpReceiver && (capabilities = RTCRtpReceiver.getCapabilities("video"))) {
                const codecs = emptyVideoCodecs();
                for (const codec in codecs) {
                    const supportRequirements = CAPABILITIES_CODECS[codec];
                    if (!supportRequirements) {
                        continue;
                    }
                    let supported = false;
                    capabilityCodecLoop: for (const codecCapability of capabilities.codecs) {
                        if (codecCapability.mimeType != supportRequirements.mimeType) {
                            continue;
                        }
                        for (const fmtpLine of supportRequirements.fmtpLine) {
                            if (!((_a = codecCapability.sdpFmtpLine) === null || _a === void 0 ? void 0 : _a.includes(fmtpLine))) {
                                continue capabilityCodecLoop;
                            }
                        }
                        supported = true;
                        break;
                    }
                    codecs[codec] = supported;
                }
                return codecs;
            }
            else {
                return maybeVideoCodecs();
            }
        });
    }
    setupHostAudio(_setup) {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: check transport type
        });
    }
    getChannel(id) {
        var _a;
        const channel = this.channels[id];
        if (!channel) {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("Failed to setup video without peer");
            throw `Failed to get channel because it is not yet initialized, Id: ${id}`;
        }
        return channel;
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("Closing WebRTC Peer");
            (_b = this.peer) === null || _b === void 0 ? void 0 : _b.close();
        });
    }
    getStats() {
        return __awaiter(this, void 0, void 0, function* () {
            const statsData = {};
            if (!this.videoReceiver) {
                return {};
            }
            const stats = yield this.videoReceiver.getStats();
            console.debug("----------------- raw video stats -----------------");
            for (const [key, value] of stats.entries()) {
                console.debug("raw video stats", key, value);
                if ("decoderImplementation" in value && value.decoderImplementation != null) {
                    statsData.decoderImplementation = value.decoderImplementation;
                }
                if ("frameWidth" in value && value.frameWidth != null) {
                    statsData.videoWidth = value.frameWidth;
                }
                if ("frameHeight" in value && value.frameHeight != null) {
                    statsData.videoHeight = value.frameHeight;
                }
                if ("framesPerSecond" in value && value.framesPerSecond != null) {
                    statsData.webrtcFps = value.framesPerSecond;
                }
                if ("jitterBufferDelay" in value && value.jitterBufferDelay != null) {
                    statsData.webrtcJitterBufferDelayMs = value.jitterBufferDelay;
                }
                if ("jitterBufferTargetDelay" in value && value.jitterBufferTargetDelay != null) {
                    statsData.webrtcJitterBufferTargetDelayMs = value.jitterBufferTargetDelay;
                }
                if ("jitterBufferMinimumDelay" in value && value.jitterBufferMinimumDelay != null) {
                    statsData.webrtcJitterBufferMinimumDelayMs = value.jitterBufferMinimumDelay;
                }
                if ("jitter" in value && value.jitter != null) {
                    statsData.webrtcJitterMs = value.jitter;
                }
                if ("totalDecodeTime" in value && value.totalDecodeTime != null) {
                    statsData.webrtcTotalDecodeTimeMs = value.totalDecodeTime;
                }
                if ("totalAssemblyTime" in value && value.totalAssemblyTime != null) {
                    statsData.webrtcTotalAssemblyTimeMs = value.totalAssemblyTime;
                }
                if ("totalProcessingDelay" in value && value.totalProcessingDelay != null) {
                    statsData.webrtcTotalProcessingDelayMs = value.totalProcessingDelay;
                }
                if ("packetsReceived" in value && value.packetsReceived != null) {
                    statsData.webrtcPacketsReceived = value.packetsReceived;
                }
                if ("packetsLost" in value && value.packetsLost != null) {
                    statsData.webrtcPacketsLost = value.packetsLost;
                }
                if ("framesDropped" in value && value.framesDropped != null) {
                    statsData.webrtcFramesDropped = value.framesDropped;
                }
                if ("keyFramesDecoded" in value && value.keyFramesDecoded != null) {
                    statsData.webrtcKeyFramesDecoded = value.keyFramesDecoded;
                }
                if ("nackCount" in value && value.nackCount != null) {
                    statsData.webrtcNackCount = value.nackCount;
                }
            }
            return statsData;
        });
    }
}
// This receives track data
class WebRTCInboundTrackTransportChannel {
    constructor(logger, type, label, trackHolder) {
        this.canReceive = true;
        this.canSend = false;
        this.trackListeners = [];
        this.logger = logger;
        this.type = type;
        this.label = label;
        this.trackHolder = trackHolder;
        this.trackHolder.ontrack = this.onTrack.bind(this);
    }
    setTrack(_track) {
        throw "WebRTCInboundTrackTransportChannel cannot addTrack";
    }
    onTrack() {
        var _a;
        const track = this.trackHolder.track;
        if (!track) {
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.debug("WebRTC TrackHolder.track is null!");
            return;
        }
        for (const listener of this.trackListeners) {
            listener(track);
        }
    }
    addTrackListener(listener) {
        if (this.trackHolder.track) {
            listener(this.trackHolder.track);
        }
        this.trackListeners.push(listener);
    }
    removeTrackListener(listener) {
        const index = this.trackListeners.indexOf(listener);
        if (index != -1) {
            this.trackListeners.splice(index, 1);
        }
    }
}
class WebRTCDataTransportChannel {
    constructor(label, channel) {
        var _a;
        this.type = "data";
        this.canReceive = true;
        this.canSend = true;
        this.sendQueue = [];
        this.receiveListeners = [];
        this.label = label;
        this.channel = channel;
        this.boundOnMessage = this.onMessage.bind(this);
        (_a = this.channel) === null || _a === void 0 ? void 0 : _a.addEventListener("message", this.boundOnMessage);
    }
    // Replace the underlying channel with a new one (e.g., from remote peer)
    // This is used when we receive a data channel from the server that should
    // replace our locally created one for receiving messages
    replaceChannel(newChannel) {
        var _a;
        // Remove listener from old channel
        (_a = this.channel) === null || _a === void 0 ? void 0 : _a.removeEventListener("message", this.boundOnMessage);
        // Add listener to new channel
        this.channel = newChannel;
        this.channel.addEventListener("message", this.boundOnMessage);
    }
    send(message) {
        console.debug(this.label, message);
        if (!this.channel) {
            throw `Failed to send message on channel ${this.label}`;
        }
        if (this.channel.readyState != "open") {
            console.debug(`Tried sending packet to ${this.label} with readyState ${this.channel.readyState}. Buffering it for the future.`);
            this.sendQueue.push(message);
        }
        else {
            this.tryDequeueSendQueue();
            this.channel.send(message);
        }
    }
    tryDequeueSendQueue() {
        var _a;
        for (const message of this.sendQueue) {
            (_a = this.channel) === null || _a === void 0 ? void 0 : _a.send(message);
        }
        this.sendQueue.length = 0;
    }
    onMessage(event) {
        const data = event.data;
        if (!(data instanceof ArrayBuffer)) {
            console.warn(`received text data on webrtc channel ${this.label}`);
            return;
        }
        for (const listener of this.receiveListeners) {
            listener(event.data);
        }
    }
    addReceiveListener(listener) {
        this.receiveListeners.push(listener);
    }
    removeReceiveListener(listener) {
        const index = this.receiveListeners.indexOf(listener);
        if (index != -1) {
            this.receiveListeners.splice(index, 1);
        }
    }
    estimatedBufferedBytes() {
        var _a, _b;
        return (_b = (_a = this.channel) === null || _a === void 0 ? void 0 : _a.bufferedAmount) !== null && _b !== void 0 ? _b : null;
    }
}
