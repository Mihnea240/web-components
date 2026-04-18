export type TemplateDescriptorLike<T extends Node = Node, D = any> = {
    template?: (data: D | undefined) => T | undefined;
    hydrate?: (instance: T, data: D | undefined) => void;
    cleanup?: (instance: T) => void;
    defaultData?: D | undefined;
};

export class TemplateDescriptor<T extends Node = Node, D = any> {
    public templateFn: TemplateDescriptorLike<T, D>["template"];
    public hydrateFn: TemplateDescriptorLike<T, D>["hydrate"];
    public cleanupFn: TemplateDescriptorLike<T, D>["cleanup"];
    public defaultData: TemplateDescriptorLike<T, D>["defaultData"];

    constructor(init: Partial<TemplateDescriptorLike<T, D>> | Node) {
        if (init instanceof HTMLTemplateElement) {
            this.update({
                template: () => init.content.firstChild?.cloneNode(true) as any
            })
        } else if (init instanceof Node) {
            this.update({
                template: () => init.cloneNode(true) as any
            })
        } else {
            this.update(init);
        }
    }

    /**
     * Updates logic without breaking object references.
     * Essential for late-binding (HTML provides template, JS provides logic).
     */
    update(patch: Partial<TemplateDescriptorLike<T, D>>) {
        if (patch.template) this.templateFn = patch.template;
        if (patch.hydrate) this.hydrateFn = patch.hydrate;
        if (patch.cleanup) this.cleanupFn = patch.cleanup;
        if (patch.defaultData) this.defaultData = patch.defaultData;
        return this;
    }

    instantiate(data?: D): T | undefined {
        try {
            const finalData = data ?? this.defaultData;
            const el = this.templateFn?.(finalData);
            if (!el) return undefined;
            this.hydrate(el, finalData);
            return el;
        } catch (e) {
            return undefined;
        }
    }

    hydrate(instance: T, data: D | undefined) {
        try {
            this.hydrateFn?.(instance, data ?? this.defaultData);
        } catch (e) {
            console.error(`[Descriptor: Hydrate failed:`, e);
        }
    }

    destroy(instance: T) {
        try {
            this.cleanupFn?.(instance);
        } catch (e) {
            console.warn(`[Descriptor: Cleanup failed:`, e);
        } finally {
            // Use remove() if available, otherwise fallback to parentNode.removeChild
            if (typeof (instance as any).remove === "function") {
                (instance as any).remove();
            } else if (instance.parentNode) {
                instance.parentNode.removeChild(instance);
            }
        }
    }
}

export class TemplateRegistry {
    public readonly loadTimeout = 5000; // ms to wait for a descriptor to be defined before rejecting get()
    private descriptors = new Map<string, TemplateDescriptor<any, any>>();

    private pendingDescriptors = new Map<string, ReturnType<typeof Promise.withResolvers<TemplateDescriptor<any, any>>>>();

     define<T extends Node = Node, D = any>(
        name: string,
        logic: Partial<TemplateDescriptorLike<T, D>>
    ): TemplateDescriptor<T, D> {
        const existing = this.descriptors.get(name);
        if (existing) return existing.update(logic);

        const descriptor = new TemplateDescriptor<T, D>(logic);
        this.descriptors.set(name, descriptor);

        // Resolve any pending get() calls waiting for this descriptor
        const pending = this.pendingDescriptors.get(name);
        if (pending) {
            pending.resolve(descriptor);
            this.pendingDescriptors.delete(name);
        }

        return descriptor;
    }

    get(name: string) {
        return this.descriptors.get(name);
    }

    async getAsync(name: string) {

        const existing = this.descriptors.get(name);
        if (existing) return existing;

        const pending = this.pendingDescriptors.get(name);
        if (pending) return pending.promise;

        const resolver = Promise.withResolvers<TemplateDescriptor<any, any>>();
        this.pendingDescriptors.set(name, resolver);

        const timeout = setTimeout(() => {
            resolver.reject(new Error(`Descriptor "${name}" not found in registry after waiting.`));
            this.pendingDescriptors.delete(name);
        }, this.loadTimeout);

        resolver.promise.finally(() => clearTimeout(timeout));

        // Wait for the descriptor to be defined (e.g., via registry.define or registry.registerElement)
        return resolver.promise;
    }

    /**
     * Maps an actual HTMLTemplateElement to a registry binding key.
     */
    registerElement(name: string, element: HTMLTemplateElement) {
        return this.define(name, new TemplateDescriptor(element));
    }
}