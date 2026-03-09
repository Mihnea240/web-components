import { raf } from "@core/decorators/batch";
import { compose, type Composed } from "@core/decorators/compose";
import { Mappers, reflect, watcher } from "@decorators/reflect";
import { shadowRoot, shadowStyle } from "@decorators/shadow";

import { createObservableArray } from "@core/util/arrayProxy";

export interface ListView extends Composed<HTMLElement> {}

/**@description Creates a new element that will be used to display the data */
function template(): HTMLElement {
    return document.createElement("div")
}
/**
 * @description Defines how the data is displayed in the elements created by template()
 * @param node - The element created by template()
 * @param value - The value from the list at the given index
 * @param index - The index of the value in the list
*/
function load<T>(node: HTMLElement, value: T, index: number) {
    node.textContent = value ? "" + value : ""
}

function generator(index) {
    return index;
}

const defaultFunctions = { template, load, generator };

type ListViewInitOptions = {
    template?: () => HTMLElement,
    load?: <T>(node: HTMLElement, value: T, index: number) => void,
    generator?: (index: number) => any,
};

@compose("list-view")
export class ListView extends HTMLElement {

    @reflect("size", Mappers.Number) accessor size = 0;
    @reflect("start", Mappers.Number) accessor start = 0;

    template = template;
    load = load;
    generator = generator;

    private internalList: any[] = [];
    private publicList: any[] = [];
    private listMode = true;

    @shadowRoot()
    accessor root: string = /*html */`<slot></slot>`;

    @shadowStyle()
    accessor rootStyle: string = /*css */`
        ::slotted([hidden]) {
            display: none !important;
        }
    `;

    static getListId(node: HTMLElement) {
        return Number(node.dataset.listIndex);
    }
    static getListData(node: HTMLElement) {
        const index = this.getListId(node);
        return index >= 0 ? this.prototype.data(index) : undefined;
    }

    getNode(index: number) {
        const id = index - this.start;
        return id < 0 || id >= this.size ? undefined : this.children[id] as HTMLElement;
    }

    constructor() {
        super();
        const internals = this.attachInternals();

        internals.role = "list";
    }

    init({ template, load, generator }: ListViewInitOptions = defaultFunctions) {
        this.template = template ?? this.template;
        this.load = load ?? this.load;
        this.generator = generator ?? this.generator;

    }

    set list(value: any[]) {
        if (!Array.isArray(value)) {
            throw new Error("ListView list must be an array");
        }

        this.internalList = value;

        // Infer size if not set or trying to reset to empty
        if (this.size == 0 || value.length == 0) {
            this.size = value.length;
        }

        this.publicList = createObservableArray(value, () => {
            this.size = this.internalList.length;
            if (this.size != this.internalList.length) {
                this.size = this.internalList.length;
            } else {
                this.refresh();
            }
        });
    }
    get list() {
        return this.publicList;
    }

    decorateTemplate(node: HTMLElement, index: number) {
        node.setAttribute("role", "listitem");
        node.dataset.listIndex = String(index);
    }

    decorateLoad(node: HTMLElement, value: any, index: number) {
        this.load(node, value, index);
        node.dataset.listIndex = String(index);
    }

    @watcher("size", { after: true })
    resize(oldSize, newSize: number) {
        if (oldSize > newSize) {
            for (let i = oldSize - 1; i >= newSize; i--) {
                this.removeChild(this.children[i]);
            }
        } else if (oldSize < newSize) {
            const fragment = document.createDocumentFragment();
            for (let i = oldSize; i < newSize; i++) {
                const node = this.template();
                this.decorateTemplate(node, i);
                fragment.appendChild(node);
            }
            this.appendChild(fragment);
        } else {
            return;
        }

        this.refresh();
    }

    @watcher("start", { after: true })
    changeStart(oldStart, newStart) {
        this.refresh();
    }

    @raf()
    refresh(start = this.start, size = this.size) {
        for (let i = 0; i < size; i++) {
            this.refreshItem(start + i);
        }
    }

    refreshItem(index: number) {
        const child = this.getNode(index);
        if (!child) {
            return;
        }

        const data = this.data(index);
        if (data === undefined) {
            this.toggleShow(child, true);
            return;
        }

        this.toggleShow(child, false);
        this.load(child, data, index);
        this.decorateLoad(child, data, index);
    }

    data(index: number) {
        if (this.listMode) {
            if (index < 0 || index >= this.internalList.length) {
                return undefined;
            }
            return this.internalList[index];
        }
        return this.generator(index);
    }

    toggleShow(child: HTMLElement, force?: boolean) {
        child.hidden = force === undefined ? !child.hidden : force;
    }

    swap(index1: number, index2: number, animate = false) {
        if (!this.listMode) {
            throw new Error("Cannot swap items in generator mode");
        }
        const list = this.internalList;

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
