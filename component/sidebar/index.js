import { showErrorPopup } from "../error.js";
let sidebarExtended = false;
const sidebarRoot = document.getElementById("sidebar-root");
const sidebarParent = document.getElementById("sidebar-parent");
const sidebarButton = document.getElementById("sidebar-button");
sidebarButton === null || sidebarButton === void 0 ? void 0 : sidebarButton.addEventListener("click", toggleSidebar);
let suppressNextSidebarToggle = false;
let activePointerId = null;
let dragStartY = 0;
let dragStartOffsetY = 0;
let isDraggingSidebarButton = false;
let sidebarDragOffsetY = 0;
const DRAG_TOGGLE_SUPPRESS_THRESHOLD_PX = 5;
sidebarButton === null || sidebarButton === void 0 ? void 0 : sidebarButton.addEventListener("pointerdown", onSidebarButtonPointerDown);
sidebarButton === null || sidebarButton === void 0 ? void 0 : sidebarButton.addEventListener("pointermove", onSidebarButtonPointerMove);
sidebarButton === null || sidebarButton === void 0 ? void 0 : sidebarButton.addEventListener("pointerup", onSidebarButtonPointerUpOrCancel);
sidebarButton === null || sidebarButton === void 0 ? void 0 : sidebarButton.addEventListener("pointercancel", onSidebarButtonPointerUpOrCancel);
sidebarButton === null || sidebarButton === void 0 ? void 0 : sidebarButton.addEventListener("lostpointercapture", onSidebarButtonPointerUpOrCancel);
window.addEventListener("ml-modal-visibility", () => {
    // Keep sidebar collapsed whenever a modal (e.g. Settings) is opened/closed.
    setSidebarExtended(false);
});
let sidebarComponent = null;
export function setSidebarStyle(style) {
    var _a;
    // Default values
    const edge = (_a = style.edge) !== null && _a !== void 0 ? _a : "left";
    // Set edge
    sidebarRoot === null || sidebarRoot === void 0 ? void 0 : sidebarRoot.classList.remove("sidebar-edge-left", "sidebar-edge-right", "sidebar-edge-up", "sidebar-edge-down");
    sidebarRoot === null || sidebarRoot === void 0 ? void 0 : sidebarRoot.classList.add(`sidebar-edge-${edge}`);
}
export function toggleSidebar() {
    if (suppressNextSidebarToggle) {
        suppressNextSidebarToggle = false;
        return;
    }
    setSidebarExtended(!isSidebarExtended());
}
function onSidebarButtonPointerDown(event) {
    if (!sidebarButton) {
        return;
    }
    activePointerId = event.pointerId;
    dragStartY = event.clientY;
    dragStartOffsetY = sidebarDragOffsetY;
    isDraggingSidebarButton = false;
    sidebarButton.setPointerCapture(event.pointerId);
}
function onSidebarButtonPointerMove(event) {
    if (activePointerId == null || event.pointerId !== activePointerId) {
        return;
    }
    const deltaY = event.clientY - dragStartY;
    if (Math.abs(deltaY) > DRAG_TOGGLE_SUPPRESS_THRESHOLD_PX) {
        isDraggingSidebarButton = true;
        suppressNextSidebarToggle = true;
    }
    if (isDraggingSidebarButton) {
        sidebarDragOffsetY = dragStartOffsetY + deltaY;
    }
}
function onSidebarButtonPointerUpOrCancel(event) {
    if (activePointerId == null || event.pointerId !== activePointerId) {
        return;
    }
    if (sidebarButton === null || sidebarButton === void 0 ? void 0 : sidebarButton.hasPointerCapture(event.pointerId)) {
        sidebarButton.releasePointerCapture(event.pointerId);
    }
    activePointerId = null;
    isDraggingSidebarButton = false;
}
let outsideClickHandler = null;
export function setSidebarExtended(extended) {
    const isShownInDom = !!(sidebarRoot === null || sidebarRoot === void 0 ? void 0 : sidebarRoot.classList.contains("sidebar-show"));
    if (extended == sidebarExtended && extended === isShownInDom) {
        return;
    }
    if (extended) {
        sidebarRoot === null || sidebarRoot === void 0 ? void 0 : sidebarRoot.classList.add("sidebar-show");
        outsideClickHandler = (e) => {
            if (sidebarRoot && !sidebarRoot.contains(e.target)) {
                setSidebarExtended(false);
            }
        };
        setTimeout(() => document.addEventListener("mousedown", outsideClickHandler, true), 0);
    }
    else {
        sidebarRoot === null || sidebarRoot === void 0 ? void 0 : sidebarRoot.classList.remove("sidebar-show");
        if (outsideClickHandler) {
            document.removeEventListener("mousedown", outsideClickHandler, true);
            outsideClickHandler = null;
        }
    }
    sidebarExtended = extended;
}
export function isSidebarExtended() {
    return sidebarExtended;
}
export function setSidebar(sidebar) {
    if (sidebarParent == null || sidebarRoot == null) {
        showErrorPopup("failed to get sidebar");
        return;
    }
    // Always reset to collapsed when sidebar is (re)mounted or removed.
    // This keeps the panel hidden until the user clicks the arrow button.
    setSidebarExtended(false);
    if (sidebarComponent) {
        // unmount
        sidebarComponent === null || sidebarComponent === void 0 ? void 0 : sidebarComponent.unmount(sidebarParent);
        sidebarComponent = null;
        sidebarRoot.style.visibility = "hidden";
    }
    if (sidebar) {
        // mount
        sidebarComponent = sidebar;
        sidebar === null || sidebar === void 0 ? void 0 : sidebar.mount(sidebarParent);
        sidebarRoot.style.visibility = "visible";
    }
}
export function getSidebarRoot() {
    return sidebarRoot;
}
export function getSidebarDragOffsetY() {
    return sidebarDragOffsetY;
}
// initialize defaults
setSidebarStyle({
    edge: "left"
});
setSidebar(null);
