import { event } from "@core/decorators";
import { compose, type Composed } from "@decorators/compose";
import { query } from "@decorators/query";
import { Mappers, reflect, watcher } from "@decorators/reflect";
import { shadowRoot, shadowStyle } from "@decorators/shadow";

import { TemplateDescriptor, TemplateRegistry } from "./templateDescriptor";

export type SpawnHelper = {
    element: Node | null;
    ready: boolean;
    promise: Promise<void>;
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

    @reflect("template") accessor template: string = "";
    @reflect("placement") accessor placement: "shadow" | "childlist" | "before" | "after" = "childlist";
    @reflect("replace", Mappers.Boolean) accessor replace: boolean = false;

    @query('slot:not([name])') accessor defaultSlot!: HTMLSlotElement;
    @query('slot[name="lazy"]') accessor lazySlot!: HTMLSlotElement;

    private _data: any = null;

    public lazyDescriptor: TemplateDescriptor = TemplateGenerator.commentDescriptor;
    public lazyInstance: HTMLElement | null = null;
    /**
     * The descriptor of the currently rendered template, if any.
    */
    public descriptor: TemplateDescriptor<any, any> | null = null;
    public instance: Node | null | undefined = null;
    private descriptorKey: string | null = null;

    @shadowRoot()
    accessor root = /*html */`
        <slot></slot>
        <slot name="lazy"></slot>
    `;

    @shadowStyle()
    accessor shadowStyle = /*css */`
        :host(:not([placement="shadow"]):not([placement="childlist"])) {
            display: none;
        }

        ::slotted([slot="lazy"]) {
            display: none;
        }
    `;

    @watcher("template", {after: false})
    onTemplateChange(_old: string, newVal: string) {
        if (!newVal) return;

        if (this.instance) {
            this.descriptor?.destroy(this.instance);
            this.instance = undefined;
        }
    }

    @watcher("template", { after: true })
    onAfterTemplateChange(_old: string, newVal: string) {
        if (!newVal) return;

        if (this.instance === undefined) {
            this.spawnAndPlace(this._data);
        }
    }

    @event("slotchange", { target: el => el.defaultSlot })
    onSlotChange() {
        const assigned = this.defaultSlot.assignedElements({ flatten: true });
        const templateEl = assigned.find(el => el instanceof HTMLTemplateElement) as HTMLTemplateElement;

        if (!templateEl) return;
        this.descriptor = new TemplateDescriptor(templateEl);
        this.descriptorKey = null;
        this.template = "";

        this.render();
    }

    @event("slotchange", { target: el => el.lazySlot })
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
            this.descriptorKey = null;
            return this.descriptor;
        }

        const descriptor = TemplateGenerator.registry.get(name);
        if (descriptor) {
            this.descriptor = descriptor;
            this.descriptorKey = name;
            return descriptor;
        }

        return TemplateGenerator.registry.getAsync(name).then(asyncDescriptor => {
            if (asyncDescriptor) {
                this.descriptor = asyncDescriptor;
                this.descriptorKey = name;
            }
            return asyncDescriptor;
        });
    }

    public spawn(data: any) {
        const isPendingData = data instanceof Promise || typeof data?.then === "function";
        const descriptorOrPromise = this.fetchDescriptor(this.template);

        if (!isPendingData && !(descriptorOrPromise instanceof Promise)) {
            if (!descriptorOrPromise) {
                throw new Error(`Descriptor "${this.template}" not found.`);
            }

            const helper: SpawnHelper = {
                element: descriptorOrPromise.instantiate(data) ?? null,
                ready: true,
                promise: Promise.resolve()
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
                        return;
                    } else {
                        descriptor.hydrate(instance, resolvedData);
                        helper.element = instance;
                        helper.ready = true;

                        if (lazySpinner?.isConnected) {
                            if (lazySpinner.parentNode) {
                                lazySpinner.parentNode.replaceChild(instance, lazySpinner);
                            }
                        }
                        resolve();
                    }
                }).catch(reject);
            })
        }

        return helper;
    }

    public spawnAndPlace(data: any, anchor: HTMLElement = this) {
        if (!anchor.isConnected) {
            console.warn(`Anchor element is not connected to the DOM.`, anchor);
            return;
        }

        const helper = this.spawn(data);
        if (helper.element) {
            this.placeElement(helper.element);
        } else {
            helper.promise.then(() => {
                if (helper.element) {
                    this.placeElement(helper.element);
                }
            }).catch(e => {
                console.error(`Failed to spawn and place template instance.`, e);
            });
        }
    }

    public hydrate(data: any, element: Node | undefined | null = this.instance) {
        if (!element) {
            console.warn(`No element provided for hydration, and no instance found.`, this.instance);
            return;
        }

        if (!this.descriptor) {
            console.warn(`No descriptor found for hydration.`, this.descriptorKey);
            return;
        }

        if(data instanceof Promise || typeof data?.then === "function") {
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
     * If the data is a Promise, the lazy template (if provided) will be rendered until the Promise resolves, at which point it will be replaced with the final instance.
     */
    public instantiate(data: any) {
        const helper = this.spawn(data);

        if (helper.element) {
            if(this.instance || this.replace) {
                this.descriptor?.destroy(this.instance);
            }

            this.placeElement(this.instance = helper.element);
        }

        return helper;
    }

    public destroy() {
        if(!this.instance || !this.descriptor) return;
        this.descriptor.destroy(this.instance);
        this.instance = null;
    }

    connectedCallback() {
        // this.onSlotChange();
        this.onLazySlotChange();
    }

    disconnectedCallback() {
        this.destroy();
    }
}