export type Constructor<T = any> = new (...args: any[]) => T;
export type AccessorKey = string | symbol;

/** Instance of a class decorated with @compose */
export type Composed<T = any> = T & {
    constructor: Constructor & { [Symbol.metadata]: DecoratorMetadataObject };
};

/** Constructor of a class decorated with @compose */
export type Decorated<T = any> = Constructor<T> & {
    [Symbol.metadata]: DecoratorMetadataObject;
};

export type HookMap<T> = {
	//Used to add static props. Called with the cosntructor as paramater
	finalize: (constructor: Decorated<T>) => void;

	connectedCallback: (this: T) => void;
	disconnectedCallback: (this: T) => void;
	attributeChangedCallback: (this: T, name: string, old: string, next: string) => void;
	handleEvent: (this: T, event: Event) => void;

	// Fallback for custom user hooks
	[custom: string]: Function;
};

export abstract class ComposedDecoratorManager<BaseType extends WeakKey = any, Data = any> {
	private static namespace = Symbol("composed:");

	/**
	 * Reserves a unique symbol on the provided metadata, 
	 * where composed decorators will store their data.
	 */
	static getNamespace(metadata: DecoratorMetadata) {
		let dataSpace = metadata[this.namespace] as Record<symbol, ComposedDecoratorManager> | undefined;
		if (!dataSpace) {
			metadata[this.namespace] = dataSpace = {} as Record<symbol, ComposedDecoratorManager>;
		}
		return dataSpace;
	}

	static getManager<T extends ComposedDecoratorManager>(
		this: { new(): T; symbol: symbol },
		metadata: DecoratorMetadata
	): T;
	static getManager<T extends ComposedDecoratorManager>(
		this: { new(): T; symbol: symbol },
		metadata: null | undefined
	): null;
	static getManager<T extends ComposedDecoratorManager>(
		this: { new(): T; symbol: symbol },
		metadata: DecoratorMetadata |null | undefined
	): T | null {
		if(!metadata) return null;
		const namespace = ComposedDecoratorManager.getNamespace(metadata);
		let manager = namespace[this.symbol] as T | undefined;

		if (!manager) {
			namespace[this.symbol] = manager = new this();
		}
		return manager;
	}

	hooks: Record<PropertyKey, Set<Function>> = {};
	instanceData: WeakMap<Composed<BaseType>, Data> = new WeakMap();

	addHook<K extends keyof HookMap<Composed<BaseType>>>(methodName: K, callback: HookMap<Composed<BaseType>>[K]) {
		this.hooks[methodName] ??= new Set();
		this.hooks[methodName].add(callback);
	}

	getHooks(methodName: PropertyKey): Set<Function> {
		return this.hooks[methodName] ?? new Set();
	}

	addInstanceData(instance: Composed<BaseType>, data: Data) {
		this.instanceData.set(instance, data);
	}
	
	getInstanceData(instance: Composed<BaseType>): Data | undefined {
		return this.instanceData.get(instance);
	}

	private static collectHooks(metadata: DecoratorMetadata) {
		const namespace = ComposedDecoratorManager.getNamespace(metadata);
		const decoratorManagers = Object.getOwnPropertySymbols(namespace);

		if (decoratorManagers.length === 0) {
			return null;
		}

		const lifecycleMap: Record<string, Set<Function>> = {};
		Object.getOwnPropertySymbols(namespace).values()
			.map(sym => namespace[sym].hooks)
			.forEach(hooks => {
				for (const [methodName, callbacks] of Object.entries(hooks)) {
					lifecycleMap[methodName] ??= new Set();
					callbacks.forEach(cb => lifecycleMap[methodName].add(cb));
				}
			});

		return lifecycleMap;
	}

	private static applyHooks(prototype: any) {
		const lifecycleMap = this.collectHooks(prototype.constructor[Symbol.metadata]);
		if (!lifecycleMap) return prototype.constructor;

		const customConstructors = lifecycleMap["constructor_hook"];
		const finalizeCallbacks = lifecycleMap["finalize"];

		for (const [methodName, callbacks] of Object.entries(lifecycleMap)) {
			if (methodName === "finalize") continue;

			const originalMethod = prototype[methodName];

			prototype[methodName] = function (...args: any[]) {
				// Call all collected callbacks first
				for (const callback of callbacks) {
					callback.call(this, ...args);
				}

				// Then call original method if it exists
				originalMethod?.call(this, ...args);
			};
		}

		// Call finalize hooks on the constructor
		if (finalizeCallbacks) {
			for (const callback of finalizeCallbacks) {
				callback(prototype.constructor);
			}
		}
	}


	static compose<T extends Constructor>(
		value: T,
		context: ClassDecoratorContext<T>,
	): T & { [Symbol.metadata]: DecoratorMetadataObject } {
		const metadata = context.metadata;
		Object.defineProperty(value, Symbol.metadata, {
			value: metadata,
			configurable: true,
			enumerable: false,
		});

		return this.applyHooks(value.prototype) || value;
	}
}

// Overload: when tagName is provided, constructor must extend HTMLElement
// export function compose(tagName: string): <T extends Constructor<HTMLElement>>(
// 	constructor: T, 
// 	context: ClassDecoratorContext<T>
// ) => T & { [Symbol.metadata]: DecoratorMetadataObject };

// // Overload: when tagName is not provided, any constructor is allowed
// export function compose(tagName?: undefined): <T extends Constructor>(
// 	constructor: T, 
// 	context: ClassDecoratorContext<T>
// ) => T & { [Symbol.metadata]: DecoratorMetadataObject };

/**
 * Enables composed hooks and metadata on a class.
 * Acts as the glue for this decorator system: other decorators register hooks/metadata,
 * and `@compose` collects those hooks, wires lifecycle wrappers, runs finalize hooks,
 * and provides `Symbol.metadata` so registries can resolve their per-class managers.
 *
 * @param tagName Optional custom element tag name. If set, target class should extend `HTMLElement`.
 *
 * @example
 * ```ts
 * @compose("my-counter")
 * class MyCounter extends HTMLElement {}
 * ```
 */
export function compose(tagName?: string) {
	return function <T extends Constructor>(
		constructor: T,
		context: ClassDecoratorContext<T>
	): T & { [Symbol.metadata]: DecoratorMetadataObject } {
		const DecoratedClass = ComposedDecoratorManager.compose(constructor, context);
		
		if (tagName && constructor.prototype instanceof HTMLElement) {
			context.addInitializer(function () {
				if (!customElements.get(tagName)) {
					customElements.define(tagName, DecoratedClass);
				}
			});
		}

		return DecoratedClass;
	}
}