import { reflect, watcher, Mappers } from "@decorators/reflect";
import { compose } from "@decorators/compose";
import { event } from "@decorators/event";
import { styleSheet } from "@core/util/styleSheet";
import { raf } from "@core/decorators/batch";

type SiblingSizeMetadata = {
    element: HTMLElement;
    size: number;
    min: number;
    max: number;
};

class ElementSizeData {
    public element: HTMLElement;
    public size: number;
    public min: number;
    public max: number;

    constructor(element: HTMLElement, isRow: boolean = true) {
        this.update(element, isRow);
    }

    update(element: HTMLElement, isRow: boolean = true) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        this.element = element;
        this.size = isRow ? rect.width : rect.height;
        this.min = parseFloat(isRow ? style.minWidth : style.minHeight) || 0;
        this.max = parseFloat(isRow ? style.maxWidth : style.maxHeight) || Infinity;
    }
}

@compose("size-modifier")
export class SizeModifier extends HTMLElement {
    // --- Public API ---
    @reflect("direction", Mappers.String)
    accessor direction: "row" | "column" = "row";

    @reflect("updates", Mappers.String)
    accessor updates: "width" | "height" | "flex-basis" = "flex-basis";

    /** "cascade" pushes all siblings, "neighbor" only affects immediate two */
    @reflect("cascade", Mappers.Boolean)
    accessor cascade: boolean = true;

    @reflect("active", Mappers.Boolean)
    accessor active: boolean = false;

    private prevSiblings: ElementSizeData[] = [];
    private nextSiblings: ElementSizeData[] = [];
    private internals: ElementInternals;

    static styleSheet = styleSheet(/*css*/`
            :host {
                display: block;
                flex: 0 0 6px;
                user-select: none;
                --webkit-user-drag: none;
            }
            :host([direction="row"]) { width: 6px; height: 100%; cursor: ew-resize; min-width: 6px; max-width: 6px; }
            :host([direction="column"]) { width: 100%; height: 6px; cursor: ns-resize; min-height: 6px; max-height: 6px; }
        `);

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).adoptedStyleSheets = [SizeModifier.styleSheet];
        this.internals = this.attachInternals();
        this.internals.role = "separator";
        this.internals.ariaOrientation = "vertical";
    }

    @watcher("direction")
    updateDirection(_old: string | null, newVal: string | null) {
        this.internals.ariaOrientation = newVal === "column" ? "horizontal" : "vertical";
    }

    @watcher("active")
    updateActiveState(_old: boolean, newVal: boolean) {
        this.internals.ariaPressed = String(newVal);
        document.body.style.cursor = newVal
            ? (this.direction === "row" ? "ew-resize" : "ns-resize")
            : "";
    }

    @event("pointerdown")
    onPointerDown(ev: PointerEvent) {
        this.active = true;
        this.setPointerCapture(ev.pointerId);

        this.probeSiblings();
    }

    @event("pointermove")
    @raf()
    onPointerMove(ev: PointerEvent) {
        if (!this.active) return;

        const delta = this.direction === "row" ? ev.movementX : ev.movementY;
        this.cascadeSizeChange(delta);
    }

    @event("pointerup")
    @event("pointercancel")
    onPointerUp() {
        this.active = false;
    }

    private cascadeSizeChange(delta: number) {
        if (delta === 0) return;
        const prevConsumed = this.getConsumedDelta(this.prevSiblings, delta);

        let nextConsumed: number;
        if (this.nextSiblings.length > 0) {
            nextConsumed = this.getConsumedDelta(this.nextSiblings, -delta);
        } else {
            // Trailing divider — next side is free space inside the parent.
            nextConsumed = -Math.sign(delta) * Math.min(Math.abs(delta), this.parentFreeSpace());
        }

        // Cap to the limiting side so space is strictly conserved.
        const move = Math.sign(delta) * Math.min(Math.abs(prevConsumed), Math.abs(nextConsumed));
        if (move === 0) return;

        this.getConsumedDelta(this.prevSiblings, move, true);
        if (this.nextSiblings.length > 0) {
            this.getConsumedDelta(this.nextSiblings, -move, true);
        }
    }

    private parentFreeSpace(): number {
        const parent = this.parentElement;
        if (!parent) return 0;
        const isRow = this.direction === "row";
        const parentSize = isRow ? parent.clientWidth : parent.clientHeight;
        let used = 0;
        for (const child of Array.from(parent.children)) {
            const el = child as HTMLElement;
            used += isRow ? el.offsetWidth : el.offsetHeight;
        }
        return Math.max(0, parentSize - used);
    }

    private getConsumedDelta(datas: ElementSizeData[], delta: number, apply = false) {
        let consumed = 0;
        for (const data of datas) {
            const available = delta < 0 ? data.size - data.min : data.max - data.size;
            const toConsume = Math.min(Math.abs(delta - consumed), available);
            consumed += toConsume * Math.sign(delta);

            if (apply) {
                this.updateElement(data, data.size + toConsume * Math.sign(delta));
            }

            if (Math.abs(consumed) >= Math.abs(delta)) break;
        }

        return consumed;
    }

    private updateElement(data: any, newSize: number) {
        data.element.style[this.updates] = `${data.size = newSize}px`;
        // Force flex-basis to be the anchor if using flex
        if (this.updates === 'flex-basis') {
            data.element.style.flexGrow = '0';
            data.element.style.flexShrink = '1';
        }
    }

    private probeSiblings() {
        const parent = this.parentElement;
        if (!parent) return;
        this.applyParentContext();

        const isDivider = (el: HTMLElement) => el.tagName.toLowerCase() === "size-modifier";
        const children = Array.from(parent.children) as HTMLElement[];
        const index = children.indexOf(this);
        const isRow = this.direction === "row";

        const updateOrNew = (data: ElementSizeData | undefined, el: HTMLElement) =>
            data ? (data.update(el, isRow), data) : new ElementSizeData(el, isRow);

        // Walk backwards for prev (nearest-first), forwards for next.
        let pi = 0;
        for (let i = index - 1; i >= 0; i--) {
            if (isDivider(children[i])) continue;
            if (this.cascade || pi === 0) {
                this.prevSiblings[pi] = updateOrNew(this.prevSiblings[pi], children[i]);
                pi++;
            }
        }
        this.prevSiblings.length = pi;

        let ni = 0;
        for (let i = index + 1; i < children.length; i++) {
            if (isDivider(children[i])) continue;
            if (this.cascade || ni === 0) {
                this.nextSiblings[ni] = updateOrNew(this.nextSiblings[ni], children[i]);
                ni++;
            }
        }
        this.nextSiblings.length = ni;
    }

    private applyParentContext() {
        const parent = this.parentElement;
        if (!parent) return;

        const style = getComputedStyle(parent);
        const isRow = style.flexDirection === "row" || style.flexDirection === "row-reverse";
        this.direction = isRow ? "row" : "column";

        this.updates = style.display === "flex" ? "flex-basis" : (isRow ? "width" : "height");
    }

    connectedCallback() {
        this.applyParentContext();
    }
}