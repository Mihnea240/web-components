import { getComposedDataSpace, addLifecycleCallback, addSetupOperation } from "./compose";

type PropertyDecoratorMetadataObject = Map<string, {
    prop: string | symbol,
    mapper?: Mapper<any>,
    listenersBefore?: (string | symbol)[],
    listenersAfter?: (string | symbol)[],
}>;

interface WatcherDecoratorOptions {
    // If true, the watcher runs after the property is updated. If false or omitted, it runs before.
    after?: boolean;
}

const defaultWatcherOptions: WatcherDecoratorOptions = {
    after: false,
};

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
        value: (oldValue: any, newValue: any) => any,
        context: ClassMethodDecoratorContext,
        options: WatcherDecoratorOptions
    ) {
        if (context.kind !== "method") {
            throw new Error("@watch can only be applied to methods");
        }
        const metadata = PropertyRegistry.getMetadata(context.metadata);
        const propMeta = metadata.get(this.attr);
        if (!propMeta) {
            throw new Error(`@watch must be used after @reflect on ${String(this.attr)}`);
        }

        if (options.after) {
            propMeta.listenersAfter ||= [];
            propMeta.listenersAfter.push(context.name);
        } else {
            propMeta.listenersBefore ||= [];
            propMeta.listenersBefore.push(context.name);
        }
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
        for (const [attr, { prop, listenersBefore, listenersAfter, mapper }] of metadata.entries()) {
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
 * 
 * @param attrName - The name of the attribute to observe.
 * @param options - Optional configuration for the watcher.
 * @param options.after - When false (default), the watcher runs before the property is set and can transform the value by returning it.
 *                        When true, the watcher runs after the property is set as a pure observer (return value ignored).
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
export function watcher(attrName: string, options: WatcherDecoratorOptions = defaultWatcherOptions) {
    const registry = new PropertyRegistry(attrName);

    return (value: (oldValue: any, newValue: any) => any, context: ClassMethodDecoratorContext) => {
        registry.watcherDecorator(value, context, options);
    };
}