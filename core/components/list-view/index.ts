import { query } from "@core/decorators";
import { raf } from "@core/decorators/batch";
import { compose, type Composed } from "@core/decorators/compose";
import { event } from "@decorators/event";
import { Mappers, reflect, watcher } from "@decorators/reflect";
import { shadowRoot, shadowStyle } from "@decorators/shadow";

import { createObservableArray } from "@core/util/arrayProxy";
import { TemplateGenerator } from "../template-generator";
import { ListViewDragController } from "./drag_controller";
import { DropStrategy } from "./drop_strategy";


TemplateGenerator.registry.define("list-view:list-identity", {
    template: () => document.createElement("div"),
    hydrate: (node, data) => {
        node.textContent = String(data);
    }
});

export type DataGenerator = (index: number) => any;

export interface ListView extends Composed<HTMLElement> { }

/**
 * ListView web component.
 * @customElement list-view
 * @attr size - Number of items to display.
 * @attr start - Start index for the list.
 * @slot template - Custom template for list items.
 * @slot default - Default slot for fallback content.
 * @event slotchange - Fired when the template slot changes.
 */
@compose("list-view")
export class ListView extends HTMLElement {
    getInstanceId(node: HTMLElement): number | null {
        const index = Number(node.getAttribute("aria-posinset"))
        return index ? index - 1 : null;
    }

    getListData(node: HTMLElement) {
        const index = this.getInstanceId(node);
        return index ? this.data(index) : null;
    }

    @reflect("size", Mappers.Number) accessor size = 0;
    @reflect("start", Mappers.Number) accessor start = 0;
    @reflect("dragging", Mappers.Boolean) accessor dragging = false;
    @reflect("dropping", Mappers.Boolean) accessor dropping = false;

    generator: DataGenerator | null = null;
    templategenerator!: TemplateGenerator;
    dropStrategy: DropStrategy | null = null;
    readonly dragHandler: ListViewDragController;

    private listMode = true;
    private indexToNode = new Map<number, HTMLElement>();
    private nodePool = new Set<HTMLElement>();
    private listRefrence: any[] | null = null;
    private listProxy: any[] | null = null;

    @query("slot[name='template']") accessor templateSlot!: HTMLSlotElement;
    @query("slot:not([name])") accessor defaultSlot!: HTMLSlotElement;

    @event("slotchange", { target: el => (el as ListView).templateSlot })
    onTemplateSlotChange() {
        const assigned = this.templateSlot.assignedElements();
        this.templategenerator = (assigned.length > 0 ? assigned[0] : this.templateSlot.children[0]) as TemplateGenerator;
        this.templategenerator.anchor = this;
    }

    @shadowRoot()
    accessor root: string = /*html */`
        <slot name="template">
            <template-generator id="dafault-generator" template="list-view:list-identity"><template-generator>
        </slot>
        <slot></slot>
    `;

    @shadowStyle()
    accessor rootStyle: string = /*css */`
        ::slotted([hidden]) {
            display: none !important;
        }

        /* :host([dragging]){
            pointer-events: none;
        } */
    `;

    constructor() {
        super();
        const internals = this.attachInternals();
        internals.role = "list";
        this.dragHandler = new ListViewDragController(this);
    }

    set list(value: any[] | null | DataGenerator) {
        if (!value) return;
        if (typeof value === "function") {
            if (value === this.generator) return;

            this.listMode = false;
            this.generator = value;

            this.clear();
            this.render();
        } else {
            if (value === this.listRefrence) return;

            this.listMode = true;
            this.listRefrence = value;
            this.listProxy = createObservableArray(value, this);

            // this.size ||= this.listRefrence.length;
            this.clear();
            this.render();
        }
    }

    get list() {
        return this.listMode ? this.listProxy : null;
    }

    @watcher("size")
    onBeforeSizeChange(oldSize, newSize) {
        if (this.listRefrence && this.listMode && newSize > this.listRefrence.length) {
            return this.listRefrence.length;
        }
    }

    @watcher("size", { after: true })
    resize(oldSize, newSize: number) {
        this.render();
    }

    @watcher("start", { after: true })
    changeStart(oldStart, newStart) {
        this.render();
    }

    //Utilities
    *shouldBeVisibleIndexs() {
        const dataSize = this.getDataSize();
        const end = Math.min(this.start + this.size, dataSize);
        for (let i = end - 1; i >= this.start; i--) yield i;
    }

    isVizible(index: number) {
        return index >= this.start && index < this.start + this.size && index < this.getDataSize();
    }

    getNode(index: number) {
        return this.indexToNode.get(index);
    }

    data(index: number) {
        switch (this.listMode) {
            case true: return this.listRefrence![index];
            case false: return this.generator!(index);
        }
    }

    private decorateInstance(node: HTMLElement, index: number) {
        node.setAttribute("role", "listitem");
        node.setAttribute("aria-posinset", String(index + 1));
        node.setAttribute("aria-setsize", String(this.getDataSize()));
    }

    protected placeNode(node: Node, index: number) {
        const anchor = this.getNode(index + 1);
        if (anchor) {
            this.insertBefore(node, anchor);
        } else {
            this.appendChild(node);
        }
    }

    private stashNode(node: HTMLElement, index: number) {
        this.nodePool.add(node);
        node.hidden = true;
        this.indexToNode.delete(index);
    }

    getDataSize() {
        return this.listMode ? this.listRefrence!.length : (this.generator ? Infinity : 0);
    }

    private shiftIndexToNodes(afterIndex: number, shift: number) {
        const newMap = new Map<number, HTMLElement>();
        for (const [key, value] of this.indexToNode) {
            if (key < afterIndex) {
                newMap.set(key, value);
            } else {
                newMap.set(key + shift, value);
            }
        }

        this.indexToNode = newMap;
    }

    private syncVisibleAria() {
        for (const [index, node] of this.indexToNode) {
            this.decorateInstance(node, index);
        }
    }

    //Proxy handlers
    onUpdate(index: number) {
        if (this.isVizible(index)) {
            this.refreshItem(index);
        }
    }

    onSplice(start: number, deleteCount: number, addCount: number) {
        const oldLength = this.listRefrence ? this.listRefrence.length - addCount + deleteCount : null;

        for (let i = start; i < start + deleteCount; i++) {
            const node = this.getNode(i);
            if (node) {
                this.stashNode(node, i);
            }
        }

        this.shiftIndexToNodes(start + deleteCount, addCount - deleteCount);

        if (oldLength !== null && this.size === oldLength) {
            this.size = this.listRefrence!.length;
            return;
        }

        this.render();
    }

    onRemove(index: number, count: number) {
        this.onSplice(index, count, 0);
    }

    onAdd(index: number, count: number) {
        this.onSplice(index, 0, count);
    }

    @raf()
    render() {
        for (const [index, node] of this.indexToNode) {
            if (!this.isVizible(index)) {
                this.stashNode(node, index);
            }
        }

        for (const index of this.shouldBeVisibleIndexs()) {
            // console.log("should be visible", index);
            if (!this.indexToNode.has(index)) {
                const data = this.data(index);
                let node = this.nodePool.values().next().value;

                if (node) {
                    this.nodePool.delete(node);
                    this.indexToNode.set(index, node);

                    node.hidden = false;
                    this.decorateInstance(node, index);
                    // Hydrate might be unsafe it it receives a promise and sets the node to the spinner in the dom
                    this.templategenerator.hydrate(data, node);

                    this.placeNode(node, index);

                    continue;
                }

                const helper = this.templategenerator.spawn(data);
                node = helper?.element as HTMLElement;

                this.decorateInstance(node, index);
                this.indexToNode.set(index, node);

                this.placeNode(node, index);
            }
        }

        this.syncVisibleAria();
    }

    clear() {
        this.indexToNode.values().forEach(node => node.remove());
        this.indexToNode.clear();
    }

    @raf()
    refresh(start = this.start, size = this.size) {
        for (let i = 0; i < size; i++) {
            this.refreshItem(start + i);
        }
    }

    refreshItem(index: number) {
        const node = this.getNode(index) as HTMLElement;
        this.decorateInstance(node, index);
        this.templategenerator.hydrate(this.data(index), node);
    }

    //Drag and drop

    @event("dragenter")
    onDragEnter(e: DragEvent) {
        this.dragHandler.onDragEnter(e);
    }

    @event("dragstart")
    onDragStart(e: DragEvent) {
        this.dragHandler.onDragStart(e);
    }

    @event("dragover")
    onDragOver(e: DragEvent) {
        this.dragHandler.onDragOver(e);
    }

    @event("drop")
    onDrop(e: DragEvent) {
        this.dragHandler.onDrop(e);
    }

    @event("dragleave")
    onDragLeave(e: DragEvent) {
        this.dragHandler.onDragLeave(e);
    }

    @event("dragend")
    onDragEnd(e: DragEvent) {
        this.dragHandler.onDragEnd(e);
    }

    swap(index1: number, index2: number, animate = false) {
        if (!this.listRefrence || !this.listMode) {
            throw new Error("Cannot swap items in generator mode");
        }
        const list = this.listRefrence;

        if (index1 < 0 || index1 >= list.length || index2 < 0 || index2 >= list.length) {
            throw new Error("Index out of bounds");
        }

        if (index1 === index2) {
            return;
        }

        if (animate) {
            const node1 = this.getNode(index1);
            const node2 = this.getNode(index2);
            if (node1 && node2) {
                const animation = this.swapAnimation(node1, node2);
                animation.onfinish = () => {
                    this.swap(index1, index2, false);
                }
            }

            return;
        }

        [list[index1], list[index2]] = [list[index2], list[index1]];
        this.refreshItem(index1);
        this.refreshItem(index2);
    }

    private swapAnimation(node1: HTMLElement, node2: HTMLElement) {
        const rect1 = node1.getBoundingClientRect();
        const rect2 = node2.getBoundingClientRect();

        const originTransform = { transform: "translate(0, 0)" };
        const animationOptions = {
            duration: 300,
            easing: "ease"
        }

        const animation = node1.animate([
            originTransform,
            { transform: `translate(${rect2.left - rect1.left}px, ${rect2.top - rect1.top}px)` }
        ], animationOptions);

        node2.animate([
            originTransform,
            { transform: `translate(${rect1.left - rect2.left}px, ${rect1.top - rect2.top}px)` }
        ], animationOptions);

        return animation;
    }
}
