import { getComposedDataSpace, addLifecycleCallback, addSetupOperation } from "./compose";

type QueryMetadataObject = {
    queries: Map<string | symbol, {
        selector: string,
        queryType: 'query' | 'queryAll',
        options: QueryDecoratorOptions
    }>,
    cache: WeakMap<HTMLElement, Map<string | symbol, WeakRef<any>>>
};

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

class QueryRegistry {
    static readonly metadataKey = Symbol("query-metadata");
    static readonly cacheKey = Symbol("query-cache");

    constructor(
        public selector: string,
        public queryType: 'query' | 'queryAll',
        public options?: QueryDecoratorOptions
    ) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    static getMetadata(metadata: DecoratorMetadataObject): QueryMetadataObject {
        const dataSpace = getComposedDataSpace(metadata);
        if (!dataSpace[QueryRegistry.metadataKey]) {
            dataSpace[QueryRegistry.metadataKey] = {
                queries: new Map(),
                cache: new WeakMap()
            };
        }
        return dataSpace[QueryRegistry.metadataKey];
    }

    queryDecorator(
        value: any,
        context: ClassAccessorDecoratorContext | ClassFieldDecoratorContext
    ) {
        if (context.kind !== "accessor" && context.kind !== "field") {
            throw new Error("@query/@queryAll can only be applied to accessors or fields");
        }

        const metadata = QueryRegistry.getMetadata(context.metadata);

        metadata.queries.set(context.name, {
            selector: this.selector,
            queryType: this.queryType,
            options: this.options
        });

        // Register setup operations for property descriptors
        addSetupOperation(context.metadata, QueryRegistry.setupPropertyDescriptors);

        return value;
    }

    private static performQuery(
        element: HTMLElement,
        selector: string,
        queryType: 'query' | 'queryAll',
        options: QueryDecoratorOptions
    ): Element | NodeListOf<Element> | null {
        const root = options.shadow ? (element.shadowRoot || element) : element;

        const result = queryType === 'query'
            ? root.querySelector(selector)
            : root.querySelectorAll(selector);

        if (options.required && !result) {
            throw new Error(`Required query selector "${selector}" not found`);
        }

        return result;
    }

    private static setCache(element: HTMLElement, prop: string | symbol, value: any) {
        const metadata = QueryRegistry.getMetadata(element.constructor[Symbol.metadata]);
        let elementCache = metadata.cache.get(element);
        if (!elementCache) {
            elementCache = new Map();
            metadata.cache.set(element, elementCache);
        }
        // Store as WeakRef to allow GC of removed DOM nodes
        if (value && typeof value === 'object') {
            elementCache.set(prop, new WeakRef(value));
        }
    }

    private static getCache(element: HTMLElement, prop: string | symbol): any {
        const metadata = QueryRegistry.getMetadata(element.constructor[Symbol.metadata]);
        const elementCache = metadata.cache.get(element);
        const weakRef = elementCache?.get(prop);
        
        return weakRef?.deref();
    }

    private static setupPropertyDescriptors(constructor: Function, prototype: any) {
        const metadata = QueryRegistry.getMetadata(constructor[Symbol.metadata]);

        for (const [prop, { selector, queryType, options }] of metadata.queries.entries()) {
            Object.defineProperty(prototype, prop, {
                get() {
                    // Check cache first if caching is enabled
                    if (!options.cache) {
                        return QueryRegistry.performQuery(this, selector, queryType, options);
                    }

                    let cached = QueryRegistry.getCache(this, prop);

                    if (cached == undefined) {
                        cached = QueryRegistry.performQuery(this, selector, queryType, options);
                        QueryRegistry.setCache(this, prop, cached);
                    }

                    return cached;
                },
                set(value) {
                    // Allow manual setting/clearing of cache
                    if (options.cache) {
                        QueryRegistry.setCache(this, prop, value);
                    }
                },
                configurable: true,
                enumerable: true
            });
        }
    }

    // Helper method to clear all query caches (can be called manually)
    static clearAllCaches(element: HTMLElement) {
        const metadata = QueryRegistry.getMetadata(element.constructor[Symbol.metadata]);
        metadata.cache.delete(element);
    }
}

/**
 * Queries for a single element and caches the result.
 * @param selector CSS selector to query for
 * @param options Configuration options
 */
export function query(selector: string, options?: QueryDecoratorOptions) {
    const registry = new QueryRegistry(selector, 'query', options);
    return (value: any, context: ClassAccessorDecoratorContext) => {
        registry.queryDecorator(value, context);
    };
}

/**
 * Queries for multiple elements and caches the result.
 * @param selector CSS selector to query for
 * @param options Configuration options
 */
export function queryAll(selector: string, options?: QueryDecoratorOptions) {
    const registry = new QueryRegistry(selector, 'queryAll', options);
    return (value: any, context: ClassAccessorDecoratorContext) => {
        registry.queryDecorator(value, context);
    };
}

/**
 * Clears query caches for an element (useful after DOM changes).
 * @param element The element to clear caches for
 */
export function clearQueryCache(element: HTMLElement) {
    QueryRegistry.clearAllCaches(element);
}
