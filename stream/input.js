import { StreamControllerCapabilities, StreamKeys, StreamMouseButton, TransportChannelId } from "../api_bindings.js";
import { ByteBuffer, I16_MAX, U16_MAX, U8_MAX } from "./buffer.js";
import { emptyGamepadState, extractGamepadState, SUPPORTED_BUTTONS } from "./gamepad.js";
import { convertToKey, convertToModifiers } from "./keyboard.js";
import { convertToButton } from "./mouse.js";
// Smooth scrolling multiplier
const TOUCH_HIGH_RES_SCROLL_MULTIPLIER = 10;
// Normal scrolling multiplier
const TOUCH_SCROLL_MULTIPLIER = 1;
// Distance until a touch cannot be a click anymore
const TOUCH_AS_CLICK_MAX_DISTANCE = 2;
// Time till it's registered as a click, else it might be scrolling
const TOUCH_AS_CLICK_MIN_TIME_MS = 100;
// Everything greater than this is a right click
const TOUCH_AS_CLICK_MAX_TIME_MS = 350;
// How much to move to open up the screen keyboard when having three touches at the same time
const TOUCHES_AS_KEYBOARD_DISTANCE = 100;
// How long is the first tap allowed to be for it to maybe be a double tap
const DOUBLE_TAP_FIRST_TAP_MAX_TIME_MS = 100;
// How much time is allowed after a touch release for a new tap to count both taps as a double tap
const DOUBLE_TAP_SECOND_TAP_MAX_TIME_MS = 200;
const CONTROLLER_RUMBLE_INTERVAL_MS = 60;
function trySendChannel(channel, buffer) {
    if (!channel) {
        return;
    }
    buffer.flip();
    const readBuffer = buffer.getRemainingBuffer();
    if (readBuffer.length == 0) {
        throw "illegal buffer size";
    }
    channel.send(readBuffer.buffer);
}
export function defaultStreamInputConfig() {
    return {
        mouseMode: "follow",
        mouseScrollMode: "highres",
        touchMode: "mouseRelative",
        controllerConfig: {
            invertAB: false,
            invertXY: false,
            sendIntervalOverride: null
        }
    };
}
export class StreamInput {
    constructor(config) {
        this.eventTarget = new EventTarget();
        this.buffer = new ByteBuffer(1024);
        this.connected = false;
        this.capabilities = { touch: true };
        // Size of the streamer device
        this.streamerSize = [0, 0];
        this.keyboard = null;
        this.mouseReliable = null;
        this.mouseAbsolute = null;
        this.mouseRelative = null;
        this.touch = null;
        this.controllers = null;
        this.controllerInputs = [];
        this.touchSupported = null;
        // -- Keyboard
        this.pressedByCode = new Map();
        this.recentModifierState = null;
        this.lastKeyboardEventAtMs = 0;
        this.expectedCapsLockState = null;
        this.inferredHostCapsLockState = null;
        this.lastCapsLockSyncAtMs = 0;
        // -- Touch
        this.touchTracker = new Map();
        // The current action of all touches on screen
        // - default -> the default action for this touch mode / we're still trying to figure out what the user is trying to do
        // - drag -> mouse is down and only relative movement is done
        // - scroll -> we're currently scrolling using primary touch
        // - screenKeyboard -> this current action is trying to pull up the on screen keyboard
        this.touchMouseAction = "default";
        // The touch that is selected as the primary / controller of the action
        // Used in touch mode "relative" and "pointAndDrag"
        // E.g. scrolling movement
        this.primaryTouch = null;
        // If the next touch is a double tap?
        this.nextTouchDoubleTap = false;
        // -- Controller
        // Wait for stream to connect and then send controllers
        this.bufferedControllers = [];
        this.gamepads = [];
        this.gamepadRumbleInterval = null;
        this.lastGamepadUpdate = performance.now();
        // -- Controller rumble
        this.gamepadRumbleCurrent = [];
        this.config = defaultStreamInputConfig();
        if (config) {
            this.setConfig(config);
        }
    }
    getDataChannel(transport, id) {
        const channel = transport.getChannel(id);
        if (channel.type == "data") {
            return channel;
        }
        throw `Failed to get channel ${id} as data transport channel`;
    }
    setTransport(transport) {
        this.keyboard = this.getDataChannel(transport, TransportChannelId.KEYBOARD);
        this.mouseReliable = this.getDataChannel(transport, TransportChannelId.MOUSE_RELIABLE);
        this.mouseAbsolute = this.getDataChannel(transport, TransportChannelId.MOUSE_ABSOLUTE);
        this.mouseRelative = this.getDataChannel(transport, TransportChannelId.MOUSE_RELATIVE);
        if (this.touch) {
            this.touch.removeReceiveListener(this.onTouchData.bind(this));
        }
        this.touch = this.getDataChannel(transport, TransportChannelId.TOUCH);
        this.touch.addReceiveListener(this.onTouchData.bind(this));
        if (this.controllers) {
            this.controllers.removeReceiveListener(this.onTouchData.bind(this));
        }
        this.controllers = this.getDataChannel(transport, TransportChannelId.CONTROLLERS);
        this.controllers.addReceiveListener(this.onControllerData.bind(this));
        this.controllerInputs.length = 0;
        for (let i = 0; i < 16; i++) {
            const channelId = TransportChannelId[`CONTROLLER${i}`];
            this.controllerInputs[i] = this.getDataChannel(transport, channelId);
        }
    }
    setConfig(config) {
        Object.assign(this.config, config);
        // Touch
        this.primaryTouch = null;
        this.touchTracker.clear();
    }
    getConfig() {
        return this.config;
    }
    getCapabilities() {
        return this.capabilities;
    }
    isConnected() {
        return this.connected;
    }
    // -- External Event Listeners
    addScreenKeyboardVisibleEvent(listener) {
        this.eventTarget.addEventListener("ml-screenkeyboardvisible", listener);
    }
    // -- On Stream Start
    onStreamStart(capabilities, streamerSize) {
        this.connected = true;
        this.capabilities = capabilities;
        this.streamerSize = streamerSize;
        this.registerBufferedControllers();
        this.inferredHostCapsLockState = false;
        this.sendReleaseAllKeys();
    }
    onKeyDown(event) {
        this.sendKeyEvent(true, event);
    }
    onKeyUp(event) {
        this.sendKeyEvent(false, event);
    }
    /** Send clipboard plain text to the host (same path as paste event text). */
    pastePlainText(text) {
        if (!text) {
            return;
        }
        console.debug("PASTE TEXT", text);
        this.raiseAllKeys();
        this.sendText(text);
    }
    onPaste(event) {
        const data = event.clipboardData;
        if (!data) {
            return;
        }
        console.debug("PASTE", data);
        const text = data.getData("text/plain");
        if (text) {
            this.pastePlainText(text);
        }
    }
    sendKeyEvent(isDown, event) {
        var _a;
        this.updateExpectedCapsLockState(event);
        this.updateRecentModifierState(event);
        const key = convertToKey(event);
        if (key == null) {
            return;
        }
        // Keep lock-state aligned before forwarding regular key events.
        if (key !== StreamKeys.VK_CAPITAL) {
            this.maybeSyncCapsLockState();
        }
        const code = event.code || `__vk_${key}`;
        if (isDown) {
            if (event.repeat) {
                console.debug("[Keyboard]: Ignoring repeated keydown", code, key);
                return;
            }
            if (this.pressedByCode.has(code)) {
                return;
            }
            this.pressedByCode.set(code, {
                vk: key,
                modifiers: convertToModifiers(event),
                isModifier: this.isModifierCode(code),
            });
        }
        else {
            const pressedState = this.pressedByCode.get(code);
            if (!pressedState) {
                return;
            }
            this.pressedByCode.delete(code);
            this.sendKey(false, pressedState.vk, pressedState.modifiers);
            return;
        }
        const modifiers = convertToModifiers(event);
        if ("debug" in console) {
            console.debug(isDown ? "DOWN" : "UP", event.code, convertToKey(event), convertToModifiers(event).toString(16));
        }
        this.sendKey(isDown, key, modifiers);
        // Keep a best-effort host-side lock state model for lock-key toggles.
        if (key === StreamKeys.VK_CAPITAL && isDown) {
            if (this.inferredHostCapsLockState == null) {
                this.inferredHostCapsLockState = (_a = this.expectedCapsLockState) !== null && _a !== void 0 ? _a : null;
            }
            else {
                this.inferredHostCapsLockState = !this.inferredHostCapsLockState;
            }
        }
    }
    raiseAllKeys() {
        for (const value of this.pressedByCode.values()) {
            this.sendKey(false, value.vk, value.modifiers);
        }
        this.pressedByCode.clear();
    }
    sendReleaseAllKeys() {
        this.buffer.reset();
        this.buffer.putU8(2);
        trySendChannel(this.keyboard, this.buffer);
    }
    resetAllKeys() {
        this.raiseAllKeys();
        this.sendReleaseAllKeys();
    }
    onInputContextLost() {
        this.resetAllKeys();
        // Host lock state may have changed while unfocused; force re-learning.
        this.inferredHostCapsLockState = null;
        this.lastCapsLockSyncAtMs = 0;
    }
    watchdogTick(shouldForceRelease) {
        if (shouldForceRelease) {
            this.resetAllKeys();
            return;
        }
        if (this.pressedByCode.size == 0) {
            return;
        }
        const now = Date.now();
        const staleMs = now - this.lastKeyboardEventAtMs;
        // Reconcile modifier keys against the last known browser modifier state.
        if (this.recentModifierState && staleMs >= StreamInput.WATCHDOG_STALE_MODIFIER_GRACE_MS) {
            for (const [code, pressed] of this.pressedByCode.entries()) {
                if (!pressed.isModifier) {
                    continue;
                }
                const isStillPressed = this.getModifierStateByCode(code, this.recentModifierState);
                if (!isStillPressed) {
                    this.sendKey(false, pressed.vk, pressed.modifiers);
                    this.pressedByCode.delete(code);
                }
            }
        }
        // If a key has been held a long time without fresh keyboard activity, release it defensively.
        if (staleMs >= StreamInput.WATCHDOG_STUCK_KEY_MS) {
            this.resetAllKeys();
        }
    }
    isModifierCode(code) {
        return code.startsWith("Shift")
            || code.startsWith("Control")
            || code.startsWith("Alt")
            || code.startsWith("Meta")
            || code === "CapsLock";
    }
    getModifierStateByCode(code, state) {
        if (code.startsWith("Shift")) {
            return state.shift;
        }
        if (code.startsWith("Control")) {
            return state.ctrl;
        }
        if (code.startsWith("Alt")) {
            return state.alt;
        }
        if (code.startsWith("Meta")) {
            return state.meta;
        }
        if (code === "CapsLock") {
            return state.capsLock;
        }
        return true;
    }
    updateRecentModifierState(event) {
        this.lastKeyboardEventAtMs = Date.now();
        if (typeof event.getModifierState !== "function") {
            return;
        }
        this.recentModifierState = {
            shift: event.getModifierState("Shift"),
            ctrl: event.getModifierState("Control"),
            alt: event.getModifierState("Alt"),
            meta: event.getModifierState("Meta"),
            capsLock: event.getModifierState("CapsLock"),
        };
    }
    updateExpectedCapsLockState(event) {
        if (typeof event.getModifierState !== "function") {
            return;
        }
        this.expectedCapsLockState = event.getModifierState("CapsLock");
        if (this.inferredHostCapsLockState == null) {
            this.inferredHostCapsLockState = this.expectedCapsLockState;
        }
    }
    maybeSyncCapsLockState() {
        if (this.expectedCapsLockState == null || this.inferredHostCapsLockState == null) {
            return;
        }
        if (this.expectedCapsLockState === this.inferredHostCapsLockState) {
            return;
        }
        const now = Date.now();
        if (now - this.lastCapsLockSyncAtMs < StreamInput.CAPS_LOCK_SYNC_COOLDOWN_MS) {
            return;
        }
        this.sendKey(true, StreamKeys.VK_CAPITAL, 0);
        this.sendKey(false, StreamKeys.VK_CAPITAL, 0);
        this.inferredHostCapsLockState = this.expectedCapsLockState;
        this.lastCapsLockSyncAtMs = now;
    }
    // Note: key = StreamKeys.VK_, modifiers = StreamKeyModifiers.
    sendKey(isDown, key, modifiers) {
        this.buffer.reset();
        this.buffer.putU8(0);
        this.buffer.putBool(isDown);
        this.buffer.putU8(modifiers);
        this.buffer.putU16(key);
        trySendChannel(this.keyboard, this.buffer);
    }
    sendText(text) {
        this.buffer.putU8(1);
        this.buffer.putU8(text.length);
        this.buffer.putUtf8Raw(text);
        trySendChannel(this.keyboard, this.buffer);
    }
    // -- Mouse
    onMouseDown(event, rect) {
        const button = convertToButton(event);
        if (button == null) {
            return;
        }
        if (this.config.mouseMode == "relative" || this.config.mouseMode == "follow") {
            this.sendMouseButton(true, button);
        }
        else if (this.config.mouseMode == "pointAndDrag") {
            this.sendMousePositionClientCoordinates(event.clientX, event.clientY, rect, true, button);
        }
    }
    onMouseUp(event) {
        const button = convertToButton(event);
        if (button == null) {
            return;
        }
        if (this.config.mouseMode == "relative" || this.config.mouseMode == "follow") {
            this.sendMouseButton(false, button);
        }
        else if (this.config.mouseMode == "pointAndDrag") {
            this.sendMouseButton(false, button);
        }
    }
    onMouseMove(event, rect) {
        if (this.config.mouseMode == "relative") {
            this.sendMouseMoveClientCoordinates(event.movementX, event.movementY, rect);
        }
        else if (this.config.mouseMode == "follow") {
            this.sendMousePositionClientCoordinates(event.clientX, event.clientY, rect, false);
        }
        else if (this.config.mouseMode == "pointAndDrag") {
            if (event.buttons) {
                // some button pressed
                this.sendMouseMoveClientCoordinates(event.movementX, event.movementY, rect);
            }
        }
    }
    onMouseWheel(event) {
        if (this.config.mouseScrollMode == "highres") {
            this.sendMouseWheelHighRes(event.deltaX, -event.deltaY);
        }
        else if (this.config.mouseScrollMode == "normal") {
            this.sendMouseWheel(event.deltaX, -event.deltaY);
        }
    }
    sendMouseMove(movementX, movementY) {
        this.buffer.reset();
        this.buffer.putU8(0);
        this.buffer.putI16(movementX);
        this.buffer.putI16(movementY);
        trySendChannel(this.mouseRelative, this.buffer);
    }
    sendMouseMoveClientCoordinates(movementX, movementY, rect) {
        const scaledMovementX = movementX / rect.width * this.streamerSize[0];
        const scaledMovementY = movementY / rect.height * this.streamerSize[1];
        this.sendMouseMove(scaledMovementX, scaledMovementY);
    }
    sendMousePosition(x, y, referenceWidth, referenceHeight, reliable) {
        var _a;
        this.buffer.reset();
        this.buffer.putU8(1);
        this.buffer.putI16(x);
        this.buffer.putI16(y);
        this.buffer.putI16(referenceWidth);
        this.buffer.putI16(referenceHeight);
        if (reliable) {
            trySendChannel(this.mouseReliable, this.buffer);
        }
        else {
            const PACKET_SIZE = 1 + 2 + 2 + 2 + 2;
            const estimatedBufferedBytes = (_a = this.mouseAbsolute) === null || _a === void 0 ? void 0 : _a.estimatedBufferedBytes();
            if (this.mouseAbsolute && estimatedBufferedBytes != null && estimatedBufferedBytes > PACKET_SIZE) {
                return;
            }
            trySendChannel(this.mouseAbsolute, this.buffer);
        }
    }
    sendMousePositionClientCoordinates(clientX, clientY, rect, reliable, mouseButton) {
        const position = this.calcNormalizedPosition(clientX, clientY, rect);
        if (position) {
            const [x, y] = position;
            this.sendMousePosition(x * 4096.0, y * 4096.0, 4096.0, 4096.0, reliable);
            if (mouseButton != undefined) {
                this.sendMouseButton(true, mouseButton);
            }
        }
    }
    // Note: button = StreamMouseButton.
    sendMouseButton(isDown, button) {
        this.buffer.reset();
        this.buffer.putU8(2);
        this.buffer.putBool(isDown);
        this.buffer.putU8(button);
        trySendChannel(this.mouseReliable, this.buffer);
    }
    sendMouseWheelHighRes(deltaX, deltaY) {
        this.buffer.reset();
        this.buffer.putU8(3);
        this.buffer.putI16(deltaX);
        this.buffer.putI16(deltaY);
        trySendChannel(this.mouseRelative, this.buffer);
    }
    sendMouseWheel(deltaX, deltaY) {
        this.buffer.reset();
        this.buffer.putU8(4);
        this.buffer.putI8(deltaX);
        this.buffer.putI8(deltaY);
        trySendChannel(this.mouseRelative, this.buffer);
    }
    onTouchData(data) {
        const buffer = new ByteBuffer(new Uint8Array(data));
        this.touchSupported = buffer.getBool();
    }
    updateTouchTracker(touch) {
        const oldTouch = this.touchTracker.get(touch.identifier);
        if (!oldTouch) {
            this.touchTracker.set(touch.identifier, {
                startTime: Date.now(),
                originX: touch.clientX,
                originY: touch.clientY,
                x: touch.clientX,
                y: touch.clientY,
                mouseClicked: null,
                mouseMoved: false,
            });
        }
        else {
            oldTouch.x = touch.clientX;
            oldTouch.y = touch.clientY;
        }
    }
    calcTouchTime(touch) {
        return Date.now() - touch.startTime;
    }
    calcTouchOriginDistance(touch, oldTouch) {
        if ("clientX" in touch) {
            return Math.hypot(touch.clientX - oldTouch.originX, touch.clientY - oldTouch.originY);
        }
        else {
            return Math.hypot(touch.x - oldTouch.originX, touch.y - oldTouch.originY);
        }
    }
    onTouchStart(event, rect) {
        for (const touch of event.changedTouches) {
            this.updateTouchTracker(touch);
        }
        if (this.config.touchMode == "touch") {
            for (const touch of event.changedTouches) {
                this.sendTouch(0, touch, rect);
            }
        }
        else if (this.config.touchMode == "mouseRelative" || this.config.touchMode == "pointAndDrag") {
            // Set primary touch if it doesn't exists currently
            for (const touch of event.changedTouches) {
                if (this.primaryTouch == null) {
                    this.primaryTouch = touch.identifier;
                    this.touchMouseAction = "default";
                }
            }
            const primaryTouch = this.primaryTouch != null && this.touchTracker.get(this.primaryTouch);
            // Detect dragging in mouse relative
            if (this.config.touchMode == "mouseRelative" && primaryTouch && this.nextTouchDoubleTap) {
                if (primaryTouch.mouseClicked == null) {
                    this.sendMouseButton(true, StreamMouseButton.LEFT);
                    primaryTouch.mouseClicked = StreamMouseButton.LEFT;
                }
                this.touchMouseAction = "drag";
                this.nextTouchDoubleTap = false;
            }
            // Detect scrolling
            if (this.primaryTouch != null && this.touchTracker.size == 2) {
                if (primaryTouch && !primaryTouch.mouseMoved && primaryTouch.mouseClicked == null) {
                    this.touchMouseAction = "scroll";
                    // only on point and drag: set the pointer in the middle of the two touches
                    if (this.config.touchMode == "pointAndDrag") {
                        let middleX = 0;
                        let middleY = 0;
                        for (const touch of this.touchTracker.values()) {
                            middleX += touch.x;
                            middleY += touch.y;
                        }
                        // Tracker size = 2 so there will only be 2 elements
                        middleX /= 2;
                        middleY /= 2;
                        primaryTouch.mouseMoved = true;
                        this.sendMousePositionClientCoordinates(middleX, middleY, rect, true);
                    }
                }
            }
            // Detect on screen keyboard
            else if (this.touchTracker.size == 3) {
                this.touchMouseAction = "screenKeyboard";
            }
        }
    }
    onTouchUpdate(rect) {
        if (this.config.touchMode == "pointAndDrag") {
            if (this.primaryTouch == null) {
                return;
            }
            const touch = this.touchTracker.get(this.primaryTouch);
            if (!touch) {
                return;
            }
            const time = this.calcTouchTime(touch);
            if (this.touchMouseAction == "default" && !touch.mouseMoved && time >= TOUCH_AS_CLICK_MIN_TIME_MS) {
                this.sendMousePositionClientCoordinates(touch.originX, touch.originY, rect, true);
                touch.mouseMoved = true;
            }
        }
    }
    onTouchMove(event, rect) {
        if (this.config.touchMode == "touch") {
            for (const touch of event.changedTouches) {
                this.sendTouch(1, touch, rect);
            }
        }
        else if (this.config.touchMode == "mouseRelative" || this.config.touchMode == "pointAndDrag") {
            for (const touch of event.changedTouches) {
                if (this.primaryTouch != touch.identifier) {
                    continue;
                }
                const oldTouch = this.touchTracker.get(this.primaryTouch);
                if (!oldTouch) {
                    continue;
                }
                const movementX = touch.clientX - oldTouch.x;
                const movementY = touch.clientY - oldTouch.y;
                if (this.touchMouseAction == "default") {
                    const touchOriginDistance = this.calcTouchOriginDistance(touch, oldTouch);
                    // Normal mouse relative movement
                    if (this.config.touchMode == "mouseRelative") {
                        this.sendMouseMoveClientCoordinates(movementX, movementY, rect);
                        if (touchOriginDistance > TOUCH_AS_CLICK_MAX_DISTANCE) {
                            oldTouch.mouseMoved = true;
                        }
                    }
                    // Point and Drag
                    // If we are over the touch as click distance go to the origin and drag
                    else if (this.config.touchMode == "pointAndDrag" && touchOriginDistance > TOUCH_AS_CLICK_MAX_DISTANCE) {
                        if (!oldTouch.mouseMoved) {
                            this.sendMousePositionClientCoordinates(oldTouch.originX, oldTouch.originY, rect, true);
                            oldTouch.mouseMoved = true;
                        }
                        if (oldTouch.mouseClicked == null) {
                            this.sendMouseButton(true, StreamMouseButton.LEFT);
                            oldTouch.mouseClicked = StreamMouseButton.LEFT;
                        }
                        this.touchMouseAction = "drag";
                    }
                }
                else if (this.touchMouseAction == "drag") {
                    // Do the dragging
                    this.sendMouseMoveClientCoordinates(movementX, movementY, rect);
                }
                else if (this.touchMouseAction == "scroll") {
                    // inverting horizontal scroll
                    if (this.config.mouseScrollMode == "highres") {
                        this.sendMouseWheelHighRes(-movementX * TOUCH_HIGH_RES_SCROLL_MULTIPLIER, movementY * TOUCH_HIGH_RES_SCROLL_MULTIPLIER);
                    }
                    else if (this.config.mouseScrollMode == "normal") {
                        this.sendMouseWheel(-movementX * TOUCH_SCROLL_MULTIPLIER, movementY * TOUCH_SCROLL_MULTIPLIER);
                    }
                }
                else if (this.touchMouseAction == "screenKeyboard") {
                    // calculate if we should open the screen keyboard
                    const distanceY = touch.clientY - oldTouch.originY;
                    if (distanceY < -TOUCHES_AS_KEYBOARD_DISTANCE) {
                        const customEvent = new CustomEvent("ml-screenkeyboardvisible", {
                            detail: { visible: true }
                        });
                        this.eventTarget.dispatchEvent(customEvent);
                    }
                    else if (distanceY > TOUCHES_AS_KEYBOARD_DISTANCE) {
                        const customEvent = new CustomEvent("ml-screenkeyboardvisible", {
                            detail: { visible: false }
                        });
                        this.eventTarget.dispatchEvent(customEvent);
                    }
                }
            }
        }
        for (const touch of event.changedTouches) {
            this.updateTouchTracker(touch);
        }
    }
    onTouchEnd(event, rect) {
        if (this.config.touchMode == "touch") {
            for (const touch of event.changedTouches) {
                this.sendTouch(2, touch, rect);
            }
        }
        else if (this.config.touchMode == "mouseRelative" || this.config.touchMode == "pointAndDrag") {
            for (const touch of event.changedTouches) {
                if (this.primaryTouch != touch.identifier) {
                    continue;
                }
                const oldTouch = this.touchTracker.get(this.primaryTouch);
                this.primaryTouch = null;
                if (oldTouch) {
                    const touchTime = this.calcTouchTime(oldTouch);
                    const touchOriginDistance = this.calcTouchOriginDistance(touch, oldTouch);
                    const maybeDoubleTap = touchTime < DOUBLE_TAP_FIRST_TAP_MAX_TIME_MS;
                    // point and drag: Before making a click we should move the mouse to the position
                    if (this.config.touchMode == "pointAndDrag" && !oldTouch.mouseMoved) {
                        this.sendMousePositionClientCoordinates(touch.clientX, touch.clientY, rect, true);
                    }
                    const doClick = (maybeDoubleTap) => {
                        // See if we should make a click
                        if (touchOriginDistance < TOUCH_AS_CLICK_MAX_DISTANCE &&
                            // mouse relative:
                            // - when having moved the mouse we shouldn't allow a click
                            // - when it's maybe a double click we shouldn't do a click
                            !(this.config.mouseMode == "relative" && !oldTouch.mouseMoved) &&
                            !maybeDoubleTap) {
                            // Should we right or left click?
                            let mouseButton;
                            if (touchTime > TOUCH_AS_CLICK_MAX_TIME_MS) {
                                mouseButton = StreamMouseButton.RIGHT;
                            }
                            else {
                                mouseButton = StreamMouseButton.LEFT;
                            }
                            this.sendMouseButton(true, mouseButton);
                            oldTouch.mouseClicked = mouseButton;
                        }
                        // Reset mouse click to neutral
                        if (oldTouch.mouseClicked != null) {
                            this.sendMouseButton(false, oldTouch.mouseClicked);
                        }
                    };
                    doClick(maybeDoubleTap);
                    if (maybeDoubleTap) {
                        this.nextTouchDoubleTap = true;
                        // Schedule the click if it's not a double tap
                        setTimeout(() => {
                            if (this.primaryTouch == null) {
                                // no click present -> no double click -> We need to do the actual click
                                doClick(false);
                                // it cannot be a double tap
                                this.nextTouchDoubleTap = false;
                            }
                        }, DOUBLE_TAP_SECOND_TAP_MAX_TIME_MS);
                    }
                    else {
                        this.nextTouchDoubleTap = false;
                    }
                }
            }
        }
        for (const touch of event.changedTouches) {
            this.touchTracker.delete(touch.identifier);
        }
    }
    onTouchCancel(event, rect) {
        this.onTouchEnd(event, rect);
    }
    calcNormalizedPosition(clientX, clientY, rect) {
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        if (x < 0 || x > 1.0 || y < 0 || y > 1.0) {
            // invalid touch
            return null;
        }
        return [x, y];
    }
    sendTouch(type, touch, rect) {
        this.buffer.reset();
        this.buffer.putU8(type);
        this.buffer.putU32(touch.identifier);
        const position = this.calcNormalizedPosition(touch.clientX, touch.clientY, rect);
        if (!position) {
            return;
        }
        const [x, y] = position;
        this.buffer.putF32(x);
        this.buffer.putF32(y);
        this.buffer.putF32(touch.force);
        this.buffer.putF32(touch.radiusX);
        this.buffer.putF32(touch.radiusY);
        this.buffer.putU16(touch.rotationAngle);
        trySendChannel(this.touch, this.buffer);
    }
    isTouchSupported() {
        return this.touchSupported;
    }
    getCurrentPredictedTouchAction() {
        return this.touchMouseAction;
    }
    registerBufferedControllers() {
        const gamepads = navigator.getGamepads();
        for (const index of this.bufferedControllers.splice(0)) {
            const gamepad = gamepads[index];
            if (gamepad) {
                this.onGamepadConnect(gamepad);
            }
        }
    }
    collectActuators(gamepad) {
        const actuators = [];
        if ("vibrationActuator" in gamepad && gamepad.vibrationActuator) {
            actuators.push(gamepad.vibrationActuator);
        }
        if ("hapticActuators" in gamepad && gamepad.hapticActuators) {
            const hapticActuators = gamepad.hapticActuators;
            actuators.push(...hapticActuators);
        }
        return actuators;
    }
    onGamepadConnect(gamepad) {
        if (!this.connected) {
            this.bufferedControllers.push(gamepad.index);
            return;
        }
        if (this.gamepads.find(value => (value === null || value === void 0 ? void 0 : value.gamepadIndex) == gamepad.index)) {
            return;
        }
        let id = -1;
        for (let i = 0; i < this.gamepads.length; i++) {
            if (this.gamepads[i] == null) {
                this.gamepads[i] = { gamepadIndex: gamepad.index, oldState: emptyGamepadState() };
                id = i;
                break;
            }
        }
        if (id == -1) {
            id = this.gamepads.length;
            this.gamepads.push({ gamepadIndex: gamepad.index, oldState: emptyGamepadState() });
        }
        // Start Rumble interval
        if (this.gamepadRumbleInterval == null) {
            this.gamepadRumbleInterval = window.setInterval(this.onGamepadRumbleInterval.bind(this), CONTROLLER_RUMBLE_INTERVAL_MS - 10);
        }
        // Reset rumble
        this.gamepadRumbleCurrent[0] = { lowFrequencyMotor: 0, highFrequencyMotor: 0, leftTrigger: 0, rightTrigger: 0 };
        let capabilities = 0;
        // Rumble capabilities
        for (const actuator of this.collectActuators(gamepad)) {
            if ("effects" in actuator) {
                const supportedEffects = actuator.effects;
                for (const effect of supportedEffects) {
                    if (effect == "dual-rumble") {
                        capabilities = StreamControllerCapabilities.CAPABILITY_RUMBLE;
                    }
                    else if (effect == "trigger-rumble") {
                        capabilities = StreamControllerCapabilities.CAPABILITY_TRIGGER_RUMBLE;
                    }
                }
            }
            else if ("type" in actuator && (actuator.type == "vibration" || actuator.type == "dual-rumble")) {
                capabilities = StreamControllerCapabilities.CAPABILITY_RUMBLE;
            }
            else if ("playEffect" in actuator && typeof actuator.playEffect == "function") {
                // we're just hoping at this point
                capabilities = StreamControllerCapabilities.CAPABILITY_RUMBLE | StreamControllerCapabilities.CAPABILITY_TRIGGER_RUMBLE;
            }
            else if ("pulse" in actuator && typeof actuator.pulse == "function") {
                capabilities = StreamControllerCapabilities.CAPABILITY_RUMBLE;
            }
        }
        this.sendControllerAdd(this.gamepads.length - 1, SUPPORTED_BUTTONS, capabilities);
        if (gamepad.mapping != "standard") {
            console.warn(`[Gamepad]: Unable to read values of gamepad with mapping ${gamepad.mapping}`);
        }
    }
    onGamepadDisconnect(event) {
        var _a;
        const index = this.gamepads.findIndex(value => (value === null || value === void 0 ? void 0 : value.gamepadIndex) == event.gamepad.index);
        if (index != -1) {
            const id = (_a = this.gamepads[index]) === null || _a === void 0 ? void 0 : _a.gamepadIndex;
            if (id != null) {
                this.sendControllerRemove(id);
            }
            this.gamepads[index] = null;
        }
    }
    onGamepadUpdate() {
        if (this.config.controllerConfig.sendIntervalOverride != null) {
            const now = performance.now();
            if (now - this.lastGamepadUpdate < (1000 / this.config.controllerConfig.sendIntervalOverride)) {
                return;
            }
            this.lastGamepadUpdate = performance.now();
        }
        for (let gamepadId = 0; gamepadId < this.gamepads.length; gamepadId++) {
            const oldGamepadState = this.gamepads[gamepadId];
            if (oldGamepadState == null) {
                return;
            }
            const gamepad = navigator.getGamepads()[oldGamepadState.gamepadIndex];
            if (!gamepad) {
                continue;
            }
            if (gamepad.mapping != "standard") {
                continue;
            }
            const state = extractGamepadState(gamepad, this.config.controllerConfig);
            if (state == oldGamepadState.oldState) {
                continue;
            }
            oldGamepadState.oldState = state;
            this.sendController(gamepadId, state);
        }
    }
    onControllerData(data) {
        var _a, _b;
        this.buffer.reset();
        this.buffer.putU8Array(new Uint8Array(data));
        this.buffer.flip();
        // TODO: maybe move this into their respective controller channels?
        const ty = this.buffer.getU8();
        if (ty == 0) {
            // Rumble
            const id = this.buffer.getU8();
            const lowFrequencyMotor = this.buffer.getU16() / U16_MAX;
            const highFrequencyMotor = this.buffer.getU16() / U16_MAX;
            const gamepadIndex = (_a = this.gamepads[id]) === null || _a === void 0 ? void 0 : _a.gamepadIndex;
            if (gamepadIndex == null) {
                return;
            }
            this.setGamepadEffect(gamepadIndex, "dual-rumble", { lowFrequencyMotor, highFrequencyMotor });
        }
        else if (ty == 1) {
            // Trigger Rumble
            const id = this.buffer.getU8();
            const leftTrigger = this.buffer.getU16() / U16_MAX;
            const rightTrigger = this.buffer.getU16() / U16_MAX;
            const gamepadIndex = (_b = this.gamepads[id]) === null || _b === void 0 ? void 0 : _b.gamepadIndex;
            if (gamepadIndex == null) {
                return;
            }
            this.setGamepadEffect(gamepadIndex, "trigger-rumble", { leftTrigger, rightTrigger });
        }
    }
    setGamepadEffect(id, _ty, params) {
        const rumble = this.gamepadRumbleCurrent[id];
        Object.assign(rumble, params);
    }
    onGamepadRumbleInterval() {
        var _a;
        for (let id = 0; id < this.gamepads.length; id++) {
            const gamepadIndex = (_a = this.gamepads[id]) === null || _a === void 0 ? void 0 : _a.gamepadIndex;
            if (gamepadIndex == null) {
                continue;
            }
            const rumble = this.gamepadRumbleCurrent[gamepadIndex];
            const gamepad = navigator.getGamepads()[gamepadIndex];
            if (gamepad && rumble) {
                this.refreshGamepadRumble(rumble, gamepad);
            }
        }
    }
    refreshGamepadRumble(rumble, gamepad) {
        // Browsers are making this more complicated than it is
        const actuators = this.collectActuators(gamepad);
        for (const actuator of actuators) {
            if ("effects" in actuator) {
                const supportedEffects = actuator.effects;
                for (const effect of supportedEffects) {
                    if (effect == "dual-rumble") {
                        actuator.playEffect("dual-rumble", {
                            duration: CONTROLLER_RUMBLE_INTERVAL_MS,
                            weakMagnitude: rumble.lowFrequencyMotor,
                            strongMagnitude: rumble.highFrequencyMotor
                        });
                    }
                    else if (effect == "trigger-rumble") {
                        actuator.playEffect("trigger-rumble", {
                            duration: CONTROLLER_RUMBLE_INTERVAL_MS,
                            leftTrigger: rumble.leftTrigger,
                            rightTrigger: rumble.rightTrigger
                        });
                    }
                }
            }
            else if ("type" in actuator && (actuator.type == "vibration" || actuator.type == "dual-rumble")) {
                actuator.playEffect(actuator.type, {
                    duration: CONTROLLER_RUMBLE_INTERVAL_MS,
                    weakMagnitude: rumble.lowFrequencyMotor,
                    strongMagnitude: rumble.highFrequencyMotor
                });
            }
            else if ("playEffect" in actuator && typeof actuator.playEffect == "function") {
                actuator.playEffect("dual-rumble", {
                    duration: CONTROLLER_RUMBLE_INTERVAL_MS,
                    weakMagnitude: rumble.lowFrequencyMotor,
                    strongMagnitude: rumble.highFrequencyMotor
                });
                actuator.playEffect("trigger-rumble", {
                    duration: CONTROLLER_RUMBLE_INTERVAL_MS,
                    leftTrigger: rumble.leftTrigger,
                    rightTrigger: rumble.rightTrigger
                });
            }
            else if ("pulse" in actuator && typeof actuator.pulse == "function") {
                const weak = Math.min(Math.max(rumble.lowFrequencyMotor, 0), 1);
                const strong = Math.min(Math.max(rumble.highFrequencyMotor, 0), 1);
                const average = (weak + strong) / 2.0;
                actuator.pulse(average, CONTROLLER_RUMBLE_INTERVAL_MS);
            }
        }
    }
    // -- Controller Sending
    sendControllerAdd(id, supportedButtons, capabilities) {
        this.buffer.reset();
        this.buffer.putU8(0);
        this.buffer.putU8(id);
        this.buffer.putU32(supportedButtons);
        this.buffer.putU16(capabilities);
        trySendChannel(this.controllers, this.buffer);
    }
    sendControllerRemove(id) {
        this.buffer.reset();
        this.buffer.putU8(1);
        this.buffer.putU8(id);
        trySendChannel(this.controllers, this.buffer);
    }
    // Values
    // - Trigger: range 0..1
    // - Stick: range -1..1
    sendController(id, state) {
        const PACKET_SIZE_BYTES = 1 + 4 + 1 + 1 + 2 + 2 + 2 + 2;
        const controllerChannel = this.controllerInputs[id];
        const estimatedBufferedBytes = controllerChannel === null || controllerChannel === void 0 ? void 0 : controllerChannel.estimatedBufferedBytes();
        if (controllerChannel && estimatedBufferedBytes != null && estimatedBufferedBytes > PACKET_SIZE_BYTES) {
            // Only send packets when we can handle them
            console.debug(`dropping controller packet for ${id} because the buffer amount is large enough: ${controllerChannel.estimatedBufferedBytes()}`);
            return;
        }
        this.buffer.reset();
        this.buffer.putU8(0);
        this.buffer.putU32(state.buttonFlags);
        this.buffer.putU8(Math.max(0.0, Math.min(1.0, state.leftTrigger)) * U8_MAX);
        this.buffer.putU8(Math.max(0.0, Math.min(1.0, state.rightTrigger)) * U8_MAX);
        this.buffer.putI16(Math.max(-1.0, Math.min(1.0, state.leftStickX)) * I16_MAX);
        this.buffer.putI16(Math.max(-1.0, Math.min(1.0, -state.leftStickY)) * I16_MAX);
        this.buffer.putI16(Math.max(-1.0, Math.min(1.0, state.rightStickX)) * I16_MAX);
        this.buffer.putI16(Math.max(-1.0, Math.min(1.0, -state.rightStickY)) * I16_MAX);
        trySendChannel(this.controllerInputs[id], this.buffer);
    }
}
StreamInput.CAPS_LOCK_SYNC_COOLDOWN_MS = 400;
StreamInput.WATCHDOG_STALE_MODIFIER_GRACE_MS = 350;
StreamInput.WATCHDOG_STUCK_KEY_MS = 5000;
