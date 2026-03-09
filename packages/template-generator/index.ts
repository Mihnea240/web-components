import { event } from "@core/decorators";
import { raf } from "@decorators/batch";
import { compose, type Composed } from "@decorators/compose";
import { query } from "@decorators/query";
import { Mappers, reflect, watcher } from "@decorators/reflect";
import { shadowRoot, shadowStyle } from "@decorators/shadow";

export class TemplateDescriptor<T extends HTMLElement = HTMLElement, D = any> {
    constructor(
        public name: string,
        public template: (data?: D) => T | undefined,
        public hydrate?: (instance: T | undefined, data?: D) => void,
        public cleanup?: (instance: T | undefined) => void,
        public defaultData?: D
    ) { }

    instantiate(data: D) {
        const instance = this.template(data);
        this.hydrate?.(instance, data);
        return instance;
    }

    destroy(instance: T) {
        this.cleanup?.(instance);
        instance?.remove();
    }
}

export type TempalateDescriptorLike<T = HTMLElement, D = any> = {
    name: string;
    template: (data?: D) => T | undefined;
    hydrate?: (instance: T | undefined, data?: D) => void;
    cleanup?: (instance: T | undefined) => void;
    defaultData?: D;
};

export class TemplateRegistry {
    private templates: Map<string, TemplateDescriptor<any, any>> = new Map();

    register<T extends HTMLElement, D = any>(descriptor: TempalateDescriptorLike<T, D>) {
        const instance = new TemplateDescriptor(
            descriptor.name,
            descriptor.template,
            descriptor.hydrate,
            descriptor.cleanup,
            descriptor.defaultData
        );
        this.templates.set(instance.name, instance);
    }

    registerTemplateElement(elementId: string) {
        const normalizedId = elementId.startsWith("#") ? elementId.slice(1) : elementId;
        const descriptorName = `#${normalizedId}`;

        const template = document.getElementById(normalizedId) as HTMLTemplateElement | null;
        if (!template) {
            console.warn(`Template with id "${normalizedId}" not found.`);
        }

        const templateFunction = () => {
            if (!template) return;
            return template.content.firstElementChild!.cloneNode(true) as HTMLElement;
        }

        const descriptor = this.get(descriptorName);
        if (descriptor && !descriptor.template) {
            descriptor.template = templateFunction;
            return;

        }

        this.register({
            name: descriptorName,
            template: templateFunction,
        });
    }

    get(name: string) {
        return this.templates.get(name);
    }

    delete(name: string) {
        this.templates.delete(name);
    }
}

export interface TemplateGenerator extends Composed<HTMLElement> { }

@compose("template-generator")
export class TemplateGenerator extends HTMLElement {
    static registry = new TemplateRegistry();

    /**
     * Sets the name of the template to be used.
     * If the name starts with "#", it will be treated as an element ID, and the corresponding template will be registered automatically.
     * There can be a descriptor with that name already registered, in which case the template function will be updated with the new one generated from the template element. This allows for dynamic updates of templates defined in the HTML. 
     */
    @reflect("template") accessor template: string = "";
    /**
     * Defines where the instantiated template will be placed relative to the <template-generator> element:
     *  * @default "childlist"
     * 
     * - `shadow` — Render in shadow DOM
     * - `childlist` — Append as child alongside existing children
     * - `before` — Insert as previous sibling
     * - `after` — Insert as next sibling
     */
    @reflect("placement") accessor placement: "shadow" | "childlist" | "before" | "after" = "childlist";
    /**
     * @default true
     * When false, the generated item will by rehydrated when calling `load(data)` with new data.
     * When true, the generated item will be replaced with a new instance created from the template.
     */
    @reflect("replace", Mappers.Boolean) accessor replace: boolean = false;
    @reflect("lazy", Mappers.Boolean) accessor lazy: boolean = false;

    @shadowRoot()
    accessor root: string = /*html */`
        <slot name="lazy"></slot>
        <slot></slot>
    `;

    @shadowStyle()
    accessor shadowStyle: string = /*css */`
        :host:not([palcement="shadow"], [placement="childlist"]) {
            display: none;
        }
    `;

    @query('slot[name="template"]')
    accessor templateSlot!: HTMLSlotElement;

    @query('slot[name="lazy"]')
    accessor lazySlot!: HTMLSlotElement;

    @query('slot:not([name])')
    accessor defaultSlot!: HTMLSlotElement;

    public templateFragment: DocumentFragment | null = null;
    public watchedElement: HTMLElement | null = null;

    private lastTemplate: string = "";
    private outdated: boolean = true;

    constructor() {
        super();
    }

    @watcher("template")
    updateTemplate(_old: string, newVal: string) {
        if (!newVal) return;

        if (newVal[0] === "#") {
            TemplateGenerator.registry.registerTemplateElement(newVal);
        }

        this.outdated = true;
    }

    @raf()
    hydrate(data?: any) {
        const descriptor = TemplateGenerator.registry.get(this.template);

        if (!descriptor) {
            console.warn(`No template registered with name "${this.template}".`);
            return;
        }

        if (this.outdated) {
            const lastDescriptor = TemplateGenerator.registry.get(this.lastTemplate);
            if (lastDescriptor && this.watchedElement) {
                lastDescriptor.destroy(this.watchedElement);
                this.watchedElement = null;
            }

            this.watchedElement = this.instantiate(data);
            this.outdated = false;

            if (this.watchedElement) {
                descriptor.hydrate?.(this.watchedElement, data);
            }

            return;
        }

        if (this.replace) {
            if (this.watchedElement) {
                descriptor.destroy(this.watchedElement);
            }
            this.watchedElement = this.instantiate(data);
        } else {
            if (!this.watchedElement) {
                this.watchedElement = this.instantiate(data);
            } else {
                descriptor.hydrate?.(this.watchedElement, data);
            }
        }

    }

    private instantiate(data?: any) {
        const descriptor = TemplateGenerator.registry.get(this.template);
        if (!descriptor) return;

        const instance = descriptor.instantiate(data ?? descriptor.defaultData);
        if (!instance) return;

        this.lastTemplate = this.template;
        this.placeElement(instance);
        return instance;
    }

    private placeElement(element: HTMLElement) {
        switch (this.placement) {
            case "shadow":
                this.shadowRoot!.appendChild(element);
                return true;
            case "childlist":
                this.appendChild(element);
                return true;
            case "before":
                this.parentElement?.insertBefore(element, this);
                return !!this.parentElement;
            case "after":
                this.parentElement?.insertBefore(element, this.nextSibling);
                return !!this.parentElement;
        }
    }

    getDescriptor() {
        return TemplateGenerator.registry.get(this.template);
    }

    @event("slotchange", { target: el => el.defaultSlot, selector: "template" })
    onTemplateAdd() {
        const assigned = this.defaultSlot.assignedElements({ flatten: true });
        const templateEl = assigned.find(el => el.tagName.toLowerCase() === "template") as HTMLTemplateElement | undefined;

        console.log("Template slot changed. Found template:", templateEl);
        if (!templateEl) {
            return;
        }
        if(!templateEl.id) {
            templateEl.id = `__template_${Math.random().toString(16).slice(2)}`;
        }

        this.template = `#${templateEl.id}`;
    }

    connectedCallback() {
        if (!this.template) {
            this.onTemplateAdd();
        }
    }

    disconnectedCallback() {
        const descriptor = TemplateGenerator.registry.get(this.template);
        if (descriptor && this.watchedElement) {
            descriptor.destroy(this.watchedElement);
            this.watchedElement = null;
        }
    }
}