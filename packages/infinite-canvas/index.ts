import { reflect, watcher, Mappers } from "@decorators/reflect";
import { composeElement } from "@decorators/compose";
import { event } from "@decorators/event";
import { raf, debounce } from "@decorators/batch";
import { query } from "@decorators/query";
import { styleSheet } from "@core/util/styleSheet";

@composeElement("infinite-canvas")
export class InfiniteCanvas extends HTMLElement {
    // Reflected to attributes — only updated at end of interaction
    @reflect("x", Mappers.Number) accessor committedX = 0;
    @reflect("y", Mappers.Number) accessor committedY = 0;
    @reflect("scale", Mappers.Number) accessor committedScale = 1;

    // Live getters — always read from the matrix
    get x() { return this.matrix.e; }
    get y() { return this.matrix.f; }
    get scale() { return this.matrix.a; }

    @query("[part='canvas']")
    accessor canvas: HTMLElement;

    protected matrix = new DOMMatrix();
    protected inverseMatrix = new DOMMatrix();
    protected interacting = false;

    static styleSheet = styleSheet(/*css*/`
        :host {
            display: block;
            position: relative;
            overflow: hidden;
            touch-action: none; /* Prevents browser scroll while panning */
        }
        [part="canvas"] {
            position: absolute;
            inset: 0;
            transform-origin: 0 0;
            will-change: transform;
        }
    `);

    static shadowDom = /*html*/`
        <div part="canvas"><slot></slot></div>
    `;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.adoptedStyleSheets = [InfiniteCanvas.styleSheet];
        root.innerHTML = InfiniteCanvas.shadowDom;
    }

    connectedCallback() {
        this.matrix = new DOMMatrix().translate(this.committedX, this.committedY).scale(this.committedScale);
        this.inverseMatrix = this.matrix.inverse();
        this.render();
    }

    // Rebuild matrix when committed values are changed externally (attribute or JS).
    @watcher("x")
    @watcher("y")
    @watcher("scale")
    onViewChange() {
        if (this.interacting) return;
        this.matrix = new DOMMatrix().translate(this.committedX, this.committedY).scale(this.committedScale);
        this.inverseMatrix = this.matrix.inverse();
        this.render();
    }


    /** Pan the canvas by a screen-pixel delta. */
    public pan(dx: number, dy: number) {
        this.matrix.e += dx;
        this.matrix.f += dy;
        this.inverseMatrix = this.matrix.inverse();
        this.render();
    }

    /** Zoom by a scale factor around a point in host-local coordinates. */
    public zoom(delta: number, originX: number, originY: number) {
        this.matrix = new DOMMatrix()
            .translate(originX, originY)
            .scale(delta)
            .translate(-originX, -originY)
            .multiply(this.matrix);
        this.inverseMatrix = this.matrix.inverse();
        this.render();
    }

    @event("wheel", { options: {passive: false} })
    onWheel(ev: WheelEvent) {
        ev.preventDefault();
        const zoomFactor = 1.1;
        const delta = ev.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
        const rect = this.getBoundingClientRect();
        this.zoom(delta, ev.clientX - rect.left, ev.clientY - rect.top);
        this.commitOnWheelEnd();
    }

    @debounce(300)
    protected commitOnWheelEnd() {
        this.interacting = true;
        this.commitMatrix();
        this.interacting = false;
    }

    @event("pointerdown")
    onPointerDown(ev: PointerEvent) {
        if (ev.button !== 0) return;
        this.interacting = true;
        this.setPointerCapture(ev.pointerId);
    }

    @event("pointermove")
    @raf()
    onPointerMove(ev: PointerEvent) {
        if (!this.hasPointerCapture(ev.pointerId)) return;
        this.pan(ev.movementX, ev.movementY);
    }

    @event("pointerup")
    @event("pointercancel")
    onPointerEnd(ev: PointerEvent) {
        if (!this.hasPointerCapture(ev.pointerId)) return;
        this.commitMatrix();
        this.interacting = false;
    }

    protected commitMatrix() {
        this.committedX = this.matrix.e;
        this.committedY = this.matrix.f;
        this.committedScale = this.matrix.a;
    }

    @raf()
    protected render() {
        this.canvas.style.transform = this.matrix.toString();
    }

    /**
     * Converts Screen coordinates (clientX/Y) to Canvas Space coordinates
     * Return a new DOMPoint with the transformed coordinates
     */
    public project(point: DOMPoint) {
        const rect = this.getBoundingClientRect();
        point.x -= rect.left;
        point.y -= rect.top;

        // Use the inverse matrix to transform the point back
        return point.matrixTransform(this.inverseMatrix);
    }
}