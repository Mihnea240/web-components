import { event } from "@core/decorators";
import { compose, type Composed } from "@decorators/compose";
import { query } from "@decorators/query";
import { Mappers, reflect, watcher } from "@decorators/reflect";
import { shadowRoot, shadowStyle } from "@decorators/shadow";

import { TemplateDescriptor, TemplateRegistry } from "./templateDescriptor";


/**
 * Helper object returned by the spawn method.
 */
export type SpawnHelper = {
    /**
     * If the operation is synchronous, this is the instantiated element.
     * If the operation is asynchronous, this is the lazy element (if provided) or null.
     * In the async case, the promise will resolve with the instantiated element once ready, and this field will be updated,
     * in this case if the lazy element was added to the DOM, it will be replaced by the instantiated element once ready.  
     */
    element: Node | null;
    /**
     * Boolean indicating whether the element is ready to use (i.e., the operation was synchronous or the promise has resolved).
     */
    ready: boolean;
    /**
     * Promise that resolves with the instantiated element once it's ready. It will reject if instantiation fails.
     * It will try to replace the lazy element (if provided and added to the DOM) with the instantiated element once ready.
     * As such, if the lazy element is provided it can be added to the DOM immediately whithout having to manage this promise
     */
    promise: Promise<Node>;
}

export interface TemplateGenerator extends Composed<HTMLElement> { }

@compose("template-generator")
export class TemplateGenerator extends HTMLElement {
    static registry = new TemplateRegistry();

    static commentDescriptor = new TemplateDescriptor<Node>({
        template() {
            return document.createComment("Loading...");
        }
    });

    @reflect("template") accessor template: string | null = null;
    @reflect("placement") accessor placement: "shadow" | "childlist" | "before" | "after" = "childlist";
    @reflect("replace", Mappers.Boolean) accessor replace: boolean = false;

    @query('slot:not([name])') accessor defaultSlot!: HTMLSlotElement;
    @query('slot[name="lazy"]') accessor lazySlot!: HTMLSlotElement;

    private _data: any = null;
    private lastDescriptor: TemplateDescriptor | null = null;
    private descriptorOutdated = false;

    /**Descriptor used for lazy rendering while waiting for data resolution or template fetching. */
    public lazyDescriptor: TemplateDescriptor = TemplateGenerator.commentDescriptor;

    /** The descriptor of the currently rendered template, if any.*/
    public descriptor: TemplateDescriptor<any, any> | null = null;

    /**Internally managed instance for hydration porpose and long time tracking.*/
    public instance: Node | null = null;

    /**The ralative anchor used for placement. Defaults to the component itself, but can be set to any other element */
    public anchor = this;

    @shadowRoot()
    accessor root = /*html */`
            <slot></slot>
            <slot name="lazy"></slot>
        `;

    @shadowStyle()
    accessor shadowStyle = /*css */`
            :host(:not([placement="shadow"]):not([placement="childlist"])) {
                display: none !important;
            }

            ::slotted([slot="lazy"]) {
                display: none !important;
            }
        `;

    @watcher("template", { after: true })
    onTemplateChangeAfter(_old: string, newVal: string) {
        if (!newVal) return;

        console.log(`Template attribute changed to "${newVal}", fetching descriptor...`);
        this.lastDescriptor = this.descriptor;
        this.descriptorOutdated = true;

        this.onTemplateChange();
    }

    @event("slotchange", { target: el => (el as TemplateGenerator).defaultSlot })
    onSlotChange() {
        const assigned = this.defaultSlot.assignedElements({ flatten: true });
        const templateEl = assigned.find(el => el instanceof HTMLTemplateElement) as HTMLTemplateElement;

        if (!templateEl) return;
        this.lastDescriptor = this.descriptor;
        this.descriptor = new TemplateDescriptor(templateEl);

        this.onTemplateChange();
    }

    private onTemplateChange() {
        if (!this.lastDescriptor) {
            this.instantiate(this._data);
            return;
        }

        if (this.instance) {
            const helper = this.spawnAndPlace(this._data, this, this.instance);
            if (!helper) return;

            const commit = (element: Node) => {
                this.lastDescriptor?.destroy(this.instance!);
                this.instance = element;
            }

            if (helper.element) {
                commit(helper.element);
                if (!helper.ready) {
                    helper.promise.then(el => this.instance = el);
                }
            } else {
                helper.promise.then(commit);
            }

        } else {
            this.instantiate(this._data);
        }
    }

    @event("slotchange", { target: el => (el as TemplateGenerator).lazySlot })
    onLazySlotChange() {
        const assigned = this.lazySlot.assignedElements({ flatten: true })[0];

        if (!assigned || !(assigned instanceof HTMLElement)) return;
        this.lazyDescriptor = new TemplateDescriptor(assigned);
    }

    private placeElement(element: Node) {
        switch (this.placement) {
            case "shadow":
                this.shadowRoot!.appendChild(element);
                break;
            case "childlist":
                this.appendChild(element);
                break;
            case "before":
                this.parentNode?.insertBefore(element, this);
                break;
            case "after":
                this.parentNode?.insertBefore(element, this.nextSibling);
                break;
        }
    }

    private fetchDescriptor(name: string): TemplateDescriptor | Promise<TemplateDescriptor | undefined> | undefined {
        if (!name && this.descriptor) {
            return this.descriptor;
        }

        const descriptor = TemplateGenerator.registry.get(name);
        if (descriptor) {
            this.descriptor = descriptor;
            return descriptor;
        }

        return TemplateGenerator.registry.getAsync(name).then(asyncDescriptor => {
            if (asyncDescriptor) {
                this.descriptor = asyncDescriptor;
            }
            return asyncDescriptor;
        });
    }

    /**
     * Creates an instance of the current template with the provided data, without placing it in the DOM.
     * @returns A helper object containing, check SpawnHelper type for details. 
     */
    public spawn(data: any) {
        if (!this.template && !this.descriptor) {
            return;
        }

        const isPendingData = data instanceof Promise || typeof data?.then === "function";
        const descriptorOrPromise = (this.descriptorOutdated ? null : this.descriptor) ?? this.fetchDescriptor(this.template!);

        if (data === undefined) {
            return;
        }

        if (!isPendingData && !(descriptorOrPromise instanceof Promise)) {
            if (!descriptorOrPromise) {
                throw new Error(`Descriptor "${this.template}" not found.`);
            }

            const instance = descriptorOrPromise.instantiate(data);
            const helper: SpawnHelper = {
                element: instance ?? null,
                ready: true,
                promise: instance ?
                    Promise.resolve(instance) :
                    Promise.reject(new Error(`Failed to instantiate template "${this.template}".`))
            };

            return helper;
        }

        const lazySpinner = this.lazyDescriptor?.instantiate() ?? null;
        if (lazySpinner) {
            this.lazyDescriptor?.hydrate(lazySpinner, undefined);
        }

        const helper: SpawnHelper = {
            element: lazySpinner,
            ready: false,
            promise: new Promise((resolve, reject) => {
                Promise.all([descriptorOrPromise, data]).then(([descriptor, resolvedData]) => {
                    if (!descriptor) {
                        reject(new Error(`Descriptor "${this.template}" not found.`));
                        return;
                    }

                    const instance = descriptor.instantiate(resolvedData);
                    if (!instance) {
                        reject(new Error(`Failed to instantiate template "${this.template}".`));
                    } else {
                        descriptor.hydrate(instance, resolvedData);
                        helper.element = instance;
                        helper.ready = true;

                        lazySpinner?.parentNode?.replaceChild(instance, lazySpinner);
                        resolve(instance);
                    }
                }).catch(reject);
            })
        }

        return helper;
    }

    /**
     * Creates an instance of the current template with the provided data, and places it in the DOM according to the "placement" property.   
     * If an anchor element is provided, it will be used as the reference for placement instead of the default anchor.  
     * If a replace node is provided, the new instance will replace it in the DOM instead of being placed according to the "placement" property.
     */
    public spawnAndPlace(data: any, anchor: HTMLElement = this.anchor, replace: Node | null = null) {
        if (!anchor || data === undefined) {
            return;
        }

        const helper = this.spawn(data);
        if (!helper) return;

        const commit = (element: Node) => {
            replace ? replace.parentNode?.replaceChild(element, replace) : this.placeElement(element);
        }

        helper.element ?
            commit(helper.element) :
            helper.promise.then(commit).catch(e => {
                console.error(`Failed to spawn and place template instance.`, e);
            });

        return helper;
    }

    /**
     * Hydrates the provided element (or the internally managed instance if no element is provided) with the provided data using the current descriptor.
     */
    public hydrate(data: any, element: Node | undefined | null = this.instance) {
        if (!element) {
            console.warn(`No element provided for hydration, and no instance found.`, this.instance);
            return;
        }
        
        if (!this.descriptor) {
            console.warn(`No descriptor found for hydration.`);
            return;
        }

        if (data instanceof Promise || typeof data?.then === "function") {
            data.then(resolvedData => {
                this.descriptor?.hydrate(element, resolvedData);
                if (element == this.instance) this._data = resolvedData;

            }).catch(e => {
                console.error(`Failed to resolve data for hydration.`, e);
            });
        } else {
            this.descriptor.hydrate(element, data);
            if (element == this.instance) this._data = data;
        }
    }

    /**
     * Creates an internally managed instance of the current template with the provided data,
     * replacing any existing instance if the "replace" flag is set or an instance already exists.
     * The instance is placed according to the "placement" property.  
     */
    public instantiate(data: any) {
        data = data ?? this.descriptor?.defaultData;
        const helper = this.spawnAndPlace(data, this.anchor, this.instance);

        if (!helper) return;

        if (this.instance) {
            this.destroy();
        }

        this._data = data;
        const commit = (element: Node) => this.instance = element;

        if (helper.element) {
            commit(helper.element);
            if (!helper.ready) {
                helper.promise.then(commit);
            }
        } else {
            helper.promise.then(commit);
        }

        return helper;
    }

    /**
     * Removes and cleans up the internally managed instance using the current descriptor's cleanup method. 
     */
    public destroy() {
        if (!this.instance || !this.descriptor) return;
        this.descriptor.destroy(this.instance);
        this.instance = null;
    }

    connectedCallback() {
        this.onLazySlotChange();
    }

    disconnectedCallback() {
        this.destroy();
    }
}