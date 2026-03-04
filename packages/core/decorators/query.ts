import { ComposedDecoratorManager, type ComposedComponent } from "./compose";

type QueryMetadata = {
    selector: string,
    queryType: 'query' | 'queryAll',
    options: Required<QueryDecoratorOptions>
};
export type AccessorKey = string | symbol;
export type QueryResult = Element | NodeListOf<Element> | null;
export interface QueryDecoratorOptions {
    /** Search in shadow DOM. @default true */
    shadow?: boolean;
    /** Cache query results. @default true */
    cache?: boolean;
    /** Throw error if element not found. @default false */
    required?: boolean;
}

const DEFAULT_OPTIONS: Required<QueryDecoratorOptions> = {
    shadow: true,
    cache: true,
    required: false
};

function performQuery(
    element: HTMLElement,
    selector: string,
    queryType: 'query' | 'queryAll',
    options: QueryDecoratorOptions
) {
    const root = options.shadow ? (element.shadowRoot || element) : element;

    const result = queryType === 'query'
        ? root.querySelector(selector)
        : root.querySelectorAll(selector);

    if (options.required && !result) {
        throw new Error(`Required query selector "${selector}" not found`);
    }

    return result;
}

class QueryRegistry extends ComposedDecoratorManager {
    static symbol = Symbol("QueryRegistry");
    cache: WeakMap<HTMLElement, Map<AccessorKey, WeakRef<Exclude<QueryResult, null>>>> = new WeakMap();

    getSelectorMap(element: HTMLElement) {
        const value = this.cache.get(element);
        if (value) return value;

        const newMap = new Map();
        this.cache.set(element, newMap);

        return newMap;
    }

    setCache(element: HTMLElement, prop: AccessorKey, value: QueryResult) {
        if (!value) return;
        const selectorMap = this.getSelectorMap(element);
        selectorMap.set(prop, new WeakRef(value));
    }

    getCache(element: HTMLElement, prop: AccessorKey) {
        const elementCache = this.cache.get(element);
        const weakRef = elementCache?.get(prop);
        return weakRef?.deref() ?? null;
    }

    clearCache(element: HTMLElement) {
        this.cache.delete(element);
    }

    createAccessor(metadata: QueryMetadata, propName: AccessorKey) {
        const { selector, queryType, options } = metadata;

        return {
            get(this: ComposedComponent) {
                const registry = QueryRegistry.getManager(this.constructor[Symbol.metadata]);

                // Check cache first if caching is enabled
                if (!options.cache) {
                    return performQuery(this, selector, queryType, options);
                }

                let cached = registry.getCache(this, propName);

                if (cached == null) {
                    cached = performQuery(this, selector, queryType, options);
                    registry.setCache(this, propName, cached);
                }

                return cached;
            },
            set(this: ComposedComponent, value: any) {
                // Allow manual setting/clearing of cache
                if (options.cache) {
                    const registry = QueryRegistry.getManager(this.constructor[Symbol.metadata]);
                    registry.setCache(this, propName, value);
                }
            }
        };
    }
}

/**
 * Queries for a single element and caches the result.
 * @param selector CSS selector to query for
 * @param options Configuration options
 */
export function query(selector: string, options?: QueryDecoratorOptions) {
    const finalOptions = { ...DEFAULT_OPTIONS, ...options };

    return (value: any, context: ClassAccessorDecoratorContext) => {
        if (context.kind !== "accessor") {
            throw new Error("@query can only be applied to accessors");
        }

        const registry = QueryRegistry.getManager(context.metadata);
        const queryMetadata: QueryMetadata = {
            selector,
            queryType: 'query',
            options: finalOptions
        };

        return registry.createAccessor(queryMetadata, context.name);
    };
}

/**
 * Queries for multiple elements and caches the result.
 * @param selector CSS selector to query for
 * @param options Configuration options
 */
export function queryAll(selector: string, options?: QueryDecoratorOptions) {
    const finalOptions = { ...DEFAULT_OPTIONS, ...options };

    return (value: any, context: ClassAccessorDecoratorContext) => {
        if (context.kind !== "accessor") {
            throw new Error("@queryAll can only be applied to accessors");
        }

        const registry = QueryRegistry.getManager(context.metadata);
        const queryMetadata: QueryMetadata = {
            selector,
            queryType: 'queryAll',
            options: finalOptions
        };

        return registry.createAccessor(queryMetadata, context.name);
    };
}

/**
 * Clears query caches for an element (useful after DOM changes).
 * @param element The element to clear caches for
 */
export function clearQueryCache(element: ComposedComponent) {
    const registry = QueryRegistry.getManager(element.constructor[Symbol.metadata]);
    registry.clearCache(element);
}
