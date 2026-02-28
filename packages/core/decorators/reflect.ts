import { getComposedDataSpace, addLifecycleCallback, addSetupOperation } from "./compose";

type PropertyDecoratorMetadataObject = Map<string, {
    prop: string | symbol,
    mapper?: Mapper<any>,
    listeners?: (string | symbol)[],
}>;

class PropertyRegistry {
    static readonly metadataKey = Symbol("reflect-metadata");

    constructor(public attr: string, public mapper?: Mapper<any>) {
        this.attr = attr;
        this.mapper = mapper || Mappers.String;
    }

    static getMetadata(metadata: DecoratorMetadataObject): PropertyDecoratorMetadataObject {
        const dataSpace = getComposedDataSpace(metadata);
        return dataSpace[PropertyRegistry.metadataKey] ??= new Map();
    }

    reflectorDecorator(
        value: ClassAccessorDecoratorContext,
        context: ClassAccessorDecoratorContext
    ) {
        if (context.kind !== "accessor") {
            throw new Error("@reflect can only be applied to accessors");
        }

        this.attr ??= String(context.name);

        const metadata = PropertyRegistry.getMetadata(context.metadata);
        if (metadata.has(this.attr)) {
            throw new Error(`Duplicate @reflect decorator on ${String(this.attr)}`);
        }

        metadata.set(this.attr, { prop: context.name, mapper: this.mapper });

        // Register static lifecycle callbacks - Sets will deduplicate automatically
        addLifecycleCallback(context.metadata, 'attributeChangedCallback', PropertyRegistry.attributeChangedCallback);
        addLifecycleCallback(context.metadata, 'connectedCallback', PropertyRegistry.connectedCallback);
        
        // Register setup operations for constructor-level modifications
        addSetupOperation(context.metadata, PropertyRegistry.setupPropertyDescriptors);
        addSetupOperation(context.metadata, PropertyRegistry.setupObservedAttributes);

        return value;
    }

    watcherDecorator(
        value: Function,
        context: ClassMethodDecoratorContext
    ) {
        if (context.kind !== "method") {
            throw new Error("@watch can only be applied to methods");
        }
        const metadata = PropertyRegistry.getMetadata(context.metadata);
        const propMeta = metadata.get(this.attr);
        if (!propMeta) {
            throw new Error(`@watch must be used after @reflect on ${String(this.attr)}`);
        }

        propMeta.listeners ||= [];
        propMeta.listeners.push(context.name)
    }

    static attributeChangedCallback(this: HTMLElement, attr: string, oldValue: any, newValue: any) {
        const metadata = PropertyRegistry.getMetadata(this.constructor[Symbol.metadata]);
        const propMeta = metadata.get(attr);
        if (propMeta) {
            if (oldValue === newValue) {
                return;
            }

            const { prop, mapper } = propMeta;
            const transformedValue = mapper.fromAttribute(newValue);
            this[prop] = transformedValue;
        }
    }

    static connectedCallback(this: HTMLElement) {
        const metadata = PropertyRegistry.getMetadata(this.constructor[Symbol.metadata]);
        for (const [attr, { prop, mapper }] of metadata.entries()) {
            if (this.hasAttribute(attr)) {
                const attrValue = this.getAttribute(attr);
                this[prop] = mapper.fromAttribute(attrValue);
            } else {
                const currentValue = this[prop];

                if (currentValue !== undefined && currentValue !== null) {
                    const attrVal = mapper.toAttribute(currentValue);
                    if (attrVal !== null) {
                        this.setAttribute(attr, attrVal);
                    } else {
                        this.removeAttribute(attr);
                    }
                }
            }
        }
    }

    private static setupPropertyDescriptors(constructor: Function, prototype: any) {
        const metadata = PropertyRegistry.getMetadata(constructor[Symbol.metadata]);
        // Add property descriptors to hook into getter/setter
        for (const [attr, { prop, listeners, mapper }] of metadata.entries()) {
            const descriptor = Object.getOwnPropertyDescriptor(prototype, prop);
            const { get: originalGet, set: originalSet } = descriptor || {};

            Object.defineProperty(prototype, prop, {
                get() {
                    return originalGet?.call(this);
                },
                set(value: any) {
                    const originalValue = originalGet?.call(this);
                    if (originalValue === value) {
                        return true;
                    }

                    for (const listener of listeners || []) {
                        const transformedValue = this[listener](originalValue, value);

                        if (transformedValue !== undefined) {
                            value = transformedValue;
                            if (originalValue === value) {
                                return true;
                            }
                        }
                    }

                    originalSet?.call(this, value);

                    value = mapper.toAttribute(value);
                    value === null ? this.removeAttribute(attr) : this.setAttribute(attr, value);

                    return true;
                }
            });
        }
    }

    private static setupObservedAttributes(constructor: Function, prototype: any) {
        const metadata = PropertyRegistry.getMetadata(constructor[Symbol.metadata]);
        // Overwrite observed attributes
        const attributeSet = new Set<string>(constructor["observedAttributes"] || []);
        for (const attr of metadata.keys()) {
            attributeSet.add(attr);
        }

        const attributes = Array.from(attributeSet);
        Object.defineProperty(constructor, "observedAttributes", {
            get() {
                return attributes;
            },
            configurable: true,
        });
    }
}

interface Mapper<T> {
    /** Converts a property value to an HTML attribute string (or null to remove). */
    toAttribute: (value: T) => string | null,
    /** Converts an HTML attribute string back to a property value. */
    fromAttribute: (value: string | null) => T
}

export const Mappers = {
    Number: {
        toAttribute: (value: number) => value?.toString() ?? null,
        fromAttribute: (value: string | null) => value !== null ? Number(value) : null
    } as Mapper<number>,
    Boolean: {
        toAttribute: (value: boolean) => value ? '' : null,
        fromAttribute: (value: string | null) => value !== null && value !== 'false'
    } as Mapper<boolean>,
    String: {
        toAttribute: (value: string) => value ?? null,
        fromAttribute: (value: string | null) => value
    } as Mapper<string>,
    JSON: {
        toAttribute: (value: unknown) => value !== null && value !== undefined ? JSON.stringify(value) : null,
        fromAttribute: (value: string | null) => {
            try {
                return value !== null ? JSON.parse(value) : null;
            } catch {
                return null;
            }
        }
    } as Mapper<unknown>,
    BiMap: <T>(map: Map<T, string>): Mapper<T> => {
        const inverseMap = new Map<string, T>();
        for (const [key, val] of map.entries()) {
            inverseMap.set(val, key);
        }
        return {
            toAttribute: (value: T) => map.get(value) ?? null,
            fromAttribute: (value: string | null) => value !== null ? inverseMap.get(value) as T : null
        };
    }
};

/**
 * Syncs a property to an HTML attribute.
 * @param attrName The name of the attribute to reflect to.
 * @param mapper Optional bi-directional converter (to/from).
 */
export function reflect(attrName?: string, mapper?: Mapper<any>) {
    const registry = new PropertyRegistry(attrName, mapper);
    return (value: any, context: ClassAccessorDecoratorContext) => {
        registry.reflectorDecorator(value, context);
    };
}

/**
 * Marks a method as a watcher for a specific reflected attribute.
 * @param attrName The attribute name this method should watch.
 */
export function watcher(attrName: string) {
    const registry = new PropertyRegistry(attrName);

    return (value: any, context: ClassMethodDecoratorContext) => {
        registry.watcherDecorator(value, context);
    };
}