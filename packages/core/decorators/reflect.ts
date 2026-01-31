import { getComposedDataSpace, addComposedSetupTask } from "./compose";

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

        addComposedSetupTask(context.metadata, PropertyRegistry.setup);
        this.attr ??= String(context.name);

        const metadata = PropertyRegistry.getMetadata(context.metadata);
        if (metadata.has(this.attr)) {
            throw new Error(`Duplicate @reflect decorator on ${String(this.attr)}`);
        }

        metadata.set(this.attr, { prop: context.name, mapper: this.mapper });

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

    static setup(constructor: Function, prototype: any) {
        const metadata = PropertyRegistry.getMetadata(constructor[Symbol.metadata]);
        console.log(metadata);
        PropertyRegistry.setupPropertyDescriptors(prototype, metadata);
        PropertyRegistry.setupObservedAttributes(constructor, metadata);
        PropertyRegistry.setupAttributeChangedCallback(prototype, metadata);
        PropertyRegistry.setupInitializer(prototype, metadata);

    }

    private static setupPropertyDescriptors(prototype: any, metadata: PropertyDecoratorMetadataObject) {
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

                    console.log(`Property set: ${String(prop)} = ${value}`);
                    originalSet?.call(this, value);

                    value = mapper.toAttribute(value);
                    value === null ? this.removeAttribute(attr) : this.setAttribute(attr, value);

                    return true;
                }
            });
        }
    }

    private static setupObservedAttributes(constructor: Function, metadata: PropertyDecoratorMetadataObject) {
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

    private static setupAttributeChangedCallback(prototype: any, metadata: PropertyDecoratorMetadataObject) {
        // Overwrite attributeChangedCallback
        const originalAttributeChangedCallback = prototype.attributeChangedCallback;
        prototype.attributeChangedCallback = function (attr: string, oldValue: any, newValue: any) {
            const propMeta = metadata.get(attr);
            if (propMeta) {
                if (oldValue === newValue) {
                    return;
                }

                console.log(`Attribute changed: ${attr} from ${oldValue} to ${newValue}`);
                const { prop, mapper } = propMeta;
                const transformedValue = mapper.fromAttribute(newValue);
                this[prop] = transformedValue;
            }

            originalAttributeChangedCallback?.call(this, attr, oldValue, newValue);
        }
    }

    private static setupInitializer(prototype: any, metadata: PropertyDecoratorMetadataObject) {
        // Add initializer to set initial property values from attributes
        const originalConnectedCallback = prototype.connectedCallback;
        prototype.connectedCallback = function () {
            for (const [attr, { prop, mapper }] of metadata.entries()) {
                if (this.hasAttribute(attr)) {
                    const attrValue = this.getAttribute(attr);
                    this[prop] = mapper.fromAttribute(attrValue);
                } else {
                    const currentValue = this[prop];

                    if (currentValue !== undefined && currentValue !== null) {
                        this.setAttribute(attr, mapper.toAttribute(currentValue));
                    }
                }
            }

            originalConnectedCallback?.call(this);
        }
    }
}

interface Mapper<T> {
    toAttribute: (value: T) => string | null,
    fromAttribute: (value: string | null) => T
}

export const Mappers = {
    Number: {
        toAttribute: (value: number) => value?.toString() ?? null,
        fromAttribute: (value: string | null) => value !== null ? Number(value) : null
    } as Mapper<number>,
    Boolean: {
        toAttribute: (value: boolean) => value ? '' : null,
        fromAttribute: (value: string | null) => value !== null
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