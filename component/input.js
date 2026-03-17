import { ComponentEvent } from "./index.js";
import { getLocalStreamSettings } from "./settings_menu.js";
export class ElementWithLabel {
    constructor(internalName, displayName) {
        this.div = document.createElement("div");
        this.label = document.createElement("label");
        if (displayName) {
            this.label.htmlFor = internalName;
            this.label.innerText = displayName;
            this.div.appendChild(this.label);
        }
    }
    mount(parent) {
        parent.appendChild(this.div);
    }
    unmount(parent) {
        parent.removeChild(this.div);
    }
}
export class InputComponent extends ElementWithLabel {
    constructor(internalName, type, displayName, init) {
        var _a, _b;
        super(internalName, displayName);
        this.fileLabel = null;
        this.numberSlider = null;
        this.inputEnabled = null;
        this.input = document.createElement("input");
        this.div.classList.add("input-div");
        this.input.id = internalName;
        this.input.type = type;
        if ((init === null || init === void 0 ? void 0 : init.defaultValue) != null) {
            this.input.defaultValue = init.defaultValue;
        }
        if ((init === null || init === void 0 ? void 0 : init.value) != null) {
            this.input.value = init.value;
        }
        if (init && init.checked != null) {
            this.input.checked = init.checked;
        }
        if (init && init.step != null) {
            this.input.step = init.step;
        }
        if (init && init.accept != null) {
            this.input.accept = init.accept;
        }
        if (init && init.inputMode != null) {
            this.input.inputMode = init.inputMode;
        }
        if (init && init.formRequired != null) {
            this.input.required = init.formRequired;
        }
        if (init && init.placeholer != null) {
            this.input.placeholder = init.placeholer;
        }
        if (type == "file") {
            this.fileLabel = document.createElement("div");
            this.fileLabel.innerText = this.label.innerText;
            this.fileLabel.classList.add("file-label");
            this.label.innerText = "Open File";
            this.label.classList.add("file-button");
            this.div.insertBefore(this.fileLabel, this.label);
        }
        if (init === null || init === void 0 ? void 0 : init.hasEnableCheckbox) {
            this.inputEnabled = document.createElement("input");
            this.inputEnabled.type = "checkbox";
            this.inputEnabled.defaultChecked = false;
            this.inputEnabled.addEventListener("change", () => {
                var _a, _b;
                this.setEnabled((_b = (_a = this.inputEnabled) === null || _a === void 0 ? void 0 : _a.checked) !== null && _b !== void 0 ? _b : (() => { throw "inputEnabled is null"; })());
                this.div.dispatchEvent(new ComponentEvent("ml-change", this));
            });
            this.div.appendChild(this.inputEnabled);
        }
        this.div.appendChild(this.input);
        this.input.addEventListener("change", () => {
            if (this.numberSlider) {
                this.numberSlider.value = this.input.value;
            }
            this.div.dispatchEvent(new ComponentEvent("ml-change", this));
        });
        if ((init === null || init === void 0 ? void 0 : init.numberSlider) && type != "number") {
            throw "tried to create InputComponent with number slider but type wasn't number";
        }
        if (type == "number" && (init === null || init === void 0 ? void 0 : init.numberSlider)) {
            this.numberSlider = document.createElement("input");
            this.numberSlider.type = "range";
            this.numberSlider.min = `${init.numberSlider.range_min}`;
            this.numberSlider.max = `${init.numberSlider.range_max}`;
            this.numberSlider.step = (_b = (_a = init.step) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : "";
            this.numberSlider.addEventListener("change", () => {
                if (this.numberSlider) {
                    this.input.value = this.numberSlider.value;
                }
                else {
                    throw "failed to get value of number slider because it wasn't created";
                }
                this.div.dispatchEvent(new ComponentEvent("ml-change", this));
            });
            this.div.appendChild(this.numberSlider);
        }
        if (init === null || init === void 0 ? void 0 : init.hasEnableCheckbox) {
            // The main logic is further up
            this.setEnabled(false);
        }
    }
    reset() {
        this.input.value = "";
        if (this.numberSlider) {
            this.numberSlider.value = "";
        }
    }
    setValue(value) {
        this.input.value = value;
        if (this.numberSlider) {
            this.numberSlider.value = value;
        }
    }
    getValue() {
        return this.input.value;
    }
    isChecked() {
        return this.input.checked;
    }
    getFiles() {
        return this.input.files;
    }
    setEnabled(enabled) {
        if (this.inputEnabled) {
            this.inputEnabled.checked = enabled;
        }
        this.input.disabled = !enabled;
        if (this.numberSlider) {
            this.numberSlider.disabled = !enabled;
        }
    }
    isEnabled() {
        return !this.input.disabled;
    }
    addChangeListener(listener, options) {
        this.div.addEventListener("ml-change", listener, options);
    }
    removeChangeListener(listener) {
        this.div.removeEventListener("ml-change", listener);
    }
    setPlaceholder(newPlaceholder) {
        this.input.placeholder = newPlaceholder;
    }
    mount(parent) {
        super.mount(parent);
        if (this.numberSlider) {
            this.numberSlider.value = this.input.value;
        }
    }
}
function useSelectElementPolyfill() {
    var _a, _b;
    return (_b = (_a = getLocalStreamSettings()) === null || _a === void 0 ? void 0 : _a.useSelectElementPolyfill) !== null && _b !== void 0 ? _b : false;
}
export class SelectComponent extends ElementWithLabel {
    constructor(internalName, options, init) {
        var _a;
        super(internalName, init === null || init === void 0 ? void 0 : init.displayName);
        this.preSelectedOption = "";
        if (init && init.preSelectedOption) {
            this.preSelectedOption = init.preSelectedOption;
        }
        this.options = options;
        // Create base
        if ((init === null || init === void 0 ? void 0 : init.forcePolyfill) || useSelectElementPolyfill() || !isElementSupported("select")) {
            const wrapper = document.createElement("div");
            wrapper.classList.add("select-polyfill-wrapper");
            this.div.appendChild(wrapper);
            this.div.classList.add("input-div");
            const display = document.createElement("p");
            display.classList.add("select-polyfill-display");
            if (init === null || init === void 0 ? void 0 : init.embeddedLabel) {
                display.dataset.label = init.embeddedLabel;
                display.classList.add("select-polyfill-display--two-line");
            }
            display.addEventListener("click", () => {
                if (this.strategy.name != "polyfill") {
                    throw "SelectComponent strategy is not polyfill";
                }
                this.setStrategyPolyfillOpened(!this.strategy.opened);
            });
            const list = document.createElement("div");
            list.classList.add("select-polyfill-list");
            if (init === null || init === void 0 ? void 0 : init.listClass) {
                list.classList.add(init.listClass);
            }
            wrapper.appendChild(display);
            this.strategy = {
                name: "polyfill",
                opened: false,
                wrapper,
                display,
                list,
                value: (_a = init === null || init === void 0 ? void 0 : init.preSelectedOption) !== null && _a !== void 0 ? _a : "",
                disabled: new Set(),
                closedDisplayLabel: (init === null || init === void 0 ? void 0 : init.closedDisplayLabel) || null,
                forceTop: !!(init === null || init === void 0 ? void 0 : init.forceTop)
            };
        }
        else if (init && init.hasSearch && isElementSupported("datalist")) {
            const dataListElement = document.createElement("datalist");
            dataListElement.id = `${internalName}-list`;
            const inputElement = document.createElement("input");
            inputElement.type = "text";
            inputElement.id = internalName;
            inputElement.setAttribute("list", dataListElement.id);
            if (init && init.preSelectedOption) {
                inputElement.defaultValue = init.preSelectedOption;
            }
            this.div.appendChild(inputElement);
            this.div.appendChild(dataListElement);
            this.strategy = {
                name: "datalist",
                optionRoot: dataListElement,
                inputElement,
            };
        }
        else {
            const selectElement = document.createElement("select");
            selectElement.id = internalName;
            this.div.appendChild(selectElement);
            this.strategy = {
                name: "select",
                optionRoot: selectElement,
            };
        }
        // Append values
        if (this.strategy.name == "datalist" || this.strategy.name == "select") {
            const optionRoot = this.strategy.optionRoot;
            for (const option of options) {
                const optionElement = document.createElement("option");
                if (this.strategy.name == "datalist") {
                    optionElement.value = option.name;
                }
                else if (this.strategy.name == "select") {
                    optionElement.innerText = option.name;
                    optionElement.value = option.value;
                }
                if (init && init.preSelectedOption == option.value) {
                    optionElement.selected = true;
                }
                optionRoot.appendChild(optionElement);
            }
            optionRoot.addEventListener("change", () => {
                this.dispatchChange();
            });
        }
        else if (this.strategy.name == "polyfill") {
            const optionRoot = this.strategy.list;
            for (const option of options) {
                const optionElement = document.createElement("p");
                optionElement.innerText = option.name;
                // @ts-ignore
                optionElement.value = option.value;
                optionElement.addEventListener("click", () => {
                    if (this.strategy.name != "polyfill") {
                        throw "SelectComponent strategy is not polyfill even though it was initialized using polyfill strategy";
                    }
                    if (this.strategy.disabled.has(option.value)) {
                        return;
                    }
                    this.strategy.value = option.value;
                    this.setStrategyPolyfillOpened(false);
                    this.updateStrategyPolyfill();
                    this.dispatchChange();
                });
                optionRoot.appendChild(optionElement);
            }
            this.updateStrategyPolyfill();
        }
    }
    dispatchChange() {
        this.div.dispatchEvent(new ComponentEvent("ml-change", this));
    }
    reset() {
        if (this.strategy.name == "datalist") {
            const inputElement = this.strategy.inputElement;
            inputElement.value = "";
        }
        else if (this.strategy.name == "select") {
            const selectElement = this.strategy.optionRoot;
            selectElement.value = this.preSelectedOption;
        }
        else if (this.strategy.name == "polyfill") {
            this.strategy.value = this.preSelectedOption;
            this.updateStrategyPolyfill();
        }
    }
    getValue() {
        var _a, _b;
        if (this.strategy.name == "datalist") {
            const name = this.strategy.inputElement.value;
            return (_b = (_a = this.options.find(option => option.name == name)) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : "";
        }
        else if (this.strategy.name == "select") {
            const selectElement = this.strategy.optionRoot;
            return selectElement.value;
        }
        else if (this.strategy.name == "polyfill") {
            return this.strategy.value;
        }
        throw "Invalid strategy for select input field";
    }
    setOptionEnabled(value, enabled) {
        if (this.strategy.name == "datalist" || this.strategy.name == "select") {
            const optionRoot = this.strategy.optionRoot;
            for (const optionElement of optionRoot.options) {
                if (optionElement.value == value) {
                    optionElement.disabled = !enabled;
                }
            }
        }
        else if (this.strategy.name == "polyfill") {
            const element = this.strategy.list;
            for (const optionElement of element.children) {
                // @ts-ignore
                const elementValue = optionElement.value;
                if (elementValue != value) {
                    continue;
                }
                if (enabled) {
                    this.strategy.disabled.delete(value);
                    optionElement.classList.remove("select-polyfill-option-disabled");
                }
                else {
                    this.strategy.disabled.add(value);
                    optionElement.classList.add("select-polyfill-option-disabled");
                }
            }
        }
    }
    updateStrategyPolyfill() {
        var _a;
        if (this.strategy.name != "polyfill") {
            throw "SelectComponent strategy is not polyfill";
        }
        for (const optionElement of this.strategy.list.children) {
            // @ts-ignore
            const value = optionElement.value;
            if (value == this.strategy.value) {
                optionElement.classList.add("select-polyfill-selected");
            }
            else {
                optionElement.classList.remove("select-polyfill-selected");
            }
        }
        const value = this.strategy.value;
        if (this.strategy.closedDisplayLabel) {
            this.strategy.display.innerText = this.strategy.closedDisplayLabel;
        }
        else {
            const selectedOption = this.options.find(option => option.value == value);
            this.strategy.display.innerText = (_a = selectedOption === null || selectedOption === void 0 ? void 0 : selectedOption.name) !== null && _a !== void 0 ? _a : "(Not Selected)";
        }
    }
    setStrategyPolyfillOpened(opened) {
        if (this.strategy.name != "polyfill") {
            throw "SelectComponent strategy is not polyfill";
        }
        if (opened != this.strategy.opened) {
            if (opened) {
                const list = this.strategy.list;
                const displayRect = this.strategy.display.getBoundingClientRect();
                // Teleport to body with fixed positioning to escape any overflow clipping
                document.body.appendChild(list);
                list.style.position = "fixed";
                list.style.width = displayRect.width + "px";
                list.style.left = displayRect.left + "px";
                list.style.zIndex = "9999";
                list.classList.remove("top");
                list.classList.remove("bottom");
                if (this.strategy.forceTop) {
                    list.style.bottom = (window.innerHeight - displayRect.top) + "px";
                    list.style.top = "auto";
                }
                else {
                    const spaceBelow = window.innerHeight - displayRect.bottom;
                    if (spaceBelow < 120) {
                        list.style.bottom = (window.innerHeight - displayRect.top) + "px";
                        list.style.top = "auto";
                    }
                    else {
                        list.style.top = displayRect.bottom + "px";
                        list.style.bottom = "auto";
                    }
                }
                // Close when clicking outside
                const closeHandler = (e) => {
                    if (!list.contains(e.target) && e.target !== this.strategy.display) {
                        this.setStrategyPolyfillOpened(false);
                        document.removeEventListener("mousedown", closeHandler, true);
                    }
                };
                document.addEventListener("mousedown", closeHandler, true);
            }
            else {
                if (this.strategy.list.parentNode) {
                    this.strategy.list.parentNode.removeChild(this.strategy.list);
                }
                this.strategy.list.classList.remove("top");
                this.strategy.list.classList.remove("bottom");
            }
        }
        this.strategy.opened = opened;
    }
    addChangeListener(listener, options) {
        this.div.addEventListener("ml-change", listener, options);
    }
    removeChangeListener(listener) {
        this.div.removeEventListener("ml-change", listener);
    }
}
export function isElementSupported(tag) {
    // Create a test element for the tag
    const element = document.createElement(tag);
    // Check for support of custom elements registered via
    // `document.registerElement`
    if (tag.indexOf('-') > -1) {
        // Registered elements have their own constructor, while unregistered
        // ones use the `HTMLElement` or `HTMLUnknownElement` (if invalid name)
        // constructor (http://stackoverflow.com/a/28210364/1070244)
        return (element.constructor !== window.HTMLUnknownElement &&
            element.constructor !== window.HTMLElement);
    }
    // Obtain the element's internal [[Class]] property, if it doesn't 
    // match the `HTMLUnknownElement` interface than it must be supported
    return toString.call(element) !== '[object HTMLUnknownElement]';
}
;
