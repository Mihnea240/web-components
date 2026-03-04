import { ComposedDecoratorManager, type ComposedComponent, type ComposedComponentConstructor, type Constructor } from "./compose";


type PropertyDecoratorMetadata = {
    prop: string | symbol,
    mapper: Mapper<any>,
    listenersBefore?: (string | symbol)[],
    listenersAfter?: (string | symbol)[],
};

class PropertyRegistry extends ComposedDecoratorManager {
    static readonly symbol = Symbol("PropertyRegistry");
    private propertyRegistry = new Map<string, PropertyDecoratorMetadata>();

    constructor() {
        super();
    }

    getPropertyEntry(attr: string) {
        return this.propertyRegistry.get(attr);
    }

    addPropertyEntry(attr: string, prop: string | symbol, mapper = Mappers.String) {
        if (this.propertyRegistry.has(attr)) {
            throw new Error(`Duplicate @reflect decorator on ${attr}`);
        }

        this.propertyRegistry.set(attr, { prop, mapper });
    }

    pushListener(attr: string, methodName: string | symbol, before = false) {
        const entry = this.getPropertyEntry(attr);
        if (!entry) {
            throw new Error(`No property entry found for attribute ${attr} - did you forget to add @reflect?`);
        }

        const listenerKey = before ? "listenersBefore" : "listenersAfter";
        entry[listenerKey] ??= [];
        entry[listenerKey]!.push(methodName);
    }

    static getMetadata(metadata: DecoratorMetadataObject) {
        const registry = PropertyRegistry.getManager(metadata);
        return registry.propertyRegistry;
    }

    static attributeChangedCallback(this: ComposedComponent, attr: string, oldValue: any, newValue: any) {
        const registry = PropertyRegistry.getManager(this.constructor[Symbol.metadata]);;
        const propMeta = registry.getPropertyEntry(attr);

        if (propMeta) {
            if (oldValue === newValue) {
                return;
            }

            const { prop, mapper = Mappers.String } = propMeta;
            const transformedValue = mapper.fromAttribute(newValue);
            this[prop] = transformedValue;
        }
    }

    static connectedCallback(this: ComposedComponent) {
        const registry = PropertyRegistry.getManager(this.constructor[Symbol.metadata]);

        for (const [attr, { prop, mapper = Mappers.String }] of registry.propertyRegistry.entries()) {
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

    static setupPropertyDescriptors(constructor: ComposedComponentConstructor) {
        const registry = PropertyRegistry.getManager(constructor[Symbol.metadata]);
        const prototype = constructor.prototype;
        
        // Add property descriptors to hook into getter/setter
        for (const [attr, { prop, listenersBefore, listenersAfter, mapper}] of registry.propertyRegistry.entries()) {
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

                    // Run "before" watchers - can transform the value
                    for (const listener of listenersBefore || []) {
                        const transformedValue = this[listener](originalValue, value);

                        if (transformedValue !== undefined) {
                            value = transformedValue;
                            if (originalValue === value) {
                                return true;
                            }
                        }
                    }

                    originalSet?.call(this, value);

                    const attrValue = mapper.toAttribute(value);
                    attrValue === null ? this.removeAttribute(attr) : this.setAttribute(attr, attrValue);

                    // Run "after" watchers - pure observers, return value ignored
                    for (const listener of listenersAfter || []) {
                        this[listener](originalValue, value);
                    }

                    return true;
                }
            });
        }
    }

    static setupObservedAttributes(constructor: Constructor<ComposedComponent>) {
        const registry = PropertyRegistry.getManager((constructor as any)[Symbol.metadata]);
        
        // Overwrite observed attributes
        const attributeSet = new Set<string>(constructor["observedAttributes"] || []);
        for (const attr of registry.propertyRegistry.keys()) {
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
            fromAttribute: (value: string | null) => value !== null && inverseMap.has(value) ? inverseMap.get(value)! : (null as unknown as T)
        };
    }
};

/**
 * Syncs a property to an HTML attribute.
 * @param attrName The name of the attribute to reflect to.
 * @param mapper Optional bi-directional converter (to/from).
 */
export function reflect(attrName?: string, mapper?: Mapper<any>) {
    return (value: any, context: ClassAccessorDecoratorContext) => {
        const registry = PropertyRegistry.getManager(context.metadata);
        const attr = attrName ?? String(context.name);
        
        if (registry.getPropertyEntry(attr)) {
            throw new Error(`Duplicate @reflect decorator on ${attr}`);
        }

        registry.addPropertyEntry(attr, context.name, mapper);

        // Register hooks (will deduplicate)
        registry.addHook("attributeChangedCallback", PropertyRegistry.attributeChangedCallback);
        registry.addHook("connectedCallback", PropertyRegistry.connectedCallback);
        registry.addHook("finalize", PropertyRegistry.setupPropertyDescriptors);
        registry.addHook("finalize", PropertyRegistry.setupObservedAttributes);
    };
}

/**
 * Marks a method as a watcher for a specific reflected attribute.
 * 
 * @param attrName - The name of the attribute to observe.
 * @param after - When false (default), the watcher runs before the property is set and can transform the value by returning it.
 *                When true, the watcher runs after the property is set as a pure observer (return value ignored).
 * 
 * @example
 * // Transform/validate before setting (default behavior):
 * ```ts
 * \@reflect("count", Mappers.Number) accessor count = 0;
 * 
 * \@watcher("count")
 * validateCount(oldValue, newValue) {
 *   // Runs before property is set - can transform
 *   return Math.max(0, newValue); // Ensure non-negative
 * }
 *
 * \@watcher("count", { after: true })
 * onCountChange(oldValue, newValue) {
 *   // Runs after property is set - pure observer
 *   // this.count === newValue here
 *   console.log(`Count changed to ${this.count}`);
 * }
 * ```
 */
export function watcher(attrName: string, { after = false } = {}) {
    return (value: (oldValue: any, newValue: any) => any, context: ClassMethodDecoratorContext) => {
        if (context.kind !== "method") {
            throw new Error("@watcher can only be applied to methods");
        }

        const registry = PropertyRegistry.getManager(context.metadata);
        registry.pushListener(attrName, context.name, !after);
    };
}