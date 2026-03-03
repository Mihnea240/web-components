// export const SETUP_SYMBOL = Symbol("composed-setup");
// export type SetupComposedTask = (constructor: Function, proto: any) => void;
// export type LifecycleCallback = (this: HTMLElement, ...args: any[]) => void;

// (Symbol as any).metadata ??= Symbol.for("metadata");

// export function getComposedDataSpace(metadata: DecoratorMetadata): {
// 	lifecycleCallbacks: Record<string, Set<LifecycleCallback>>,
// 	setupOperations: Set<(constructor: Function, prototype: any) => void>
// } {
// 	let meta = metadata[SETUP_SYMBOL] as {
// 		lifecycleCallbacks: Record<string, Set<LifecycleCallback>>,
// 		setupOperations: Set<(constructor: Function, prototype: any) => void>
// 	};
// 	if (!meta) {
// 		meta = {
// 			lifecycleCallbacks: {},
// 			setupOperations: new Set()
// 		};
// 		metadata[SETUP_SYMBOL] = meta;
// 	}
// 	return meta;
// }

// export function addLifecycleCallback(metadata: DecoratorMetadata, methodName: string, callback: LifecycleCallback) {
// 	const dataSpace = getComposedDataSpace(metadata);
// 	dataSpace.lifecycleCallbacks[methodName] ??= new Set();
// 	dataSpace.lifecycleCallbacks[methodName].add(callback);
// }

// export function addSetupOperation(metadata: DecoratorMetadata, operation: (constructor: Function, prototype: any) => void) {
// 	const dataSpace = getComposedDataSpace(metadata);
// 	dataSpace.setupOperations.add(operation);
// }

// export function composeElement(tagName: string) {
// 	return function <T extends WebComponentConstructor>(
// 		constructor: T,
// 		context: ClassDecoratorContext<T>
// 	): T | void {

// 		const metadata = context.metadata
// 		if (metadata) {
// 			Object.defineProperty(constructor, Symbol.metadata, {
// 				value: metadata,
// 				configurable: true,
// 				enumerable: false,
// 			});
// 		}
// 		const dataSpace = getComposedDataSpace(metadata);

// 		// Run all setup operations (constructor/prototype modifications)
// 		for (const operation of dataSpace.setupOperations) {
// 			operation(constructor, constructor.prototype);
// 		}

// 		// Create efficient single wrappers for lifecycle methods
// 		setupLifecycleWrappers(constructor.prototype, dataSpace.lifecycleCallbacks);

// 		// Schedule registration after class (including static fields) is fully initialized
// 		context.addInitializer(function () {
// 			if (!customElements.get(tagName)) {
// 				customElements.define(tagName, constructor);
// 			}
// 		});

// 		return constructor;
// 	}

// }

// function setupLifecycleWrappers(prototype: any, lifecycleCallbacks: Record<string, Set<LifecycleCallback>>) {
// 	for (const [methodName, callbacks] of Object.entries(lifecycleCallbacks)) {
// 		if (callbacks.size === 0) continue;

// 		const originalMethod = prototype[methodName];

// 		prototype[methodName] = function (...args: any[]) {
// 			// Call all collected callbacks first
// 			for (const callback of callbacks) {
// 				callback.call(this, ...args);
// 			}

// 			// Then call original method if it exists
// 			originalMethod?.call(this, ...args);
// 		};
// 	}
// }

export type WebComponentConstructor = new (...args: any[]) => HTMLElement;
export type HookMap = {
    // Statics (The Class Definition)
    finalize: (constructor: WebComponentConstructor) => void;
    
    connectedCallback: () => void;
    disconnectedCallback: () => void;
	attributeChangedCallback: (name: string, old: string, next: string) => void;
	handleEvent: (event: Event) => void;
    
    // Fallback for custom user hooks
    [custom: string]: Function;
};

export abstract class ComposedDecoratorManager {
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

	hooks: Record<PropertyKey , Set<Function>> = {};
	static symbol;

	static getManager<T extends ComposedDecoratorManager>(
		this: { new(): T; symbol: symbol },
		metadata: DecoratorMetadata
	): T {
		if (!this.symbol) {
			throw new Error("ComposedDecoratorManager subclasses must have a unique static symbol property.");
		}

		const namespace = ComposedDecoratorManager.getNamespace(metadata);
		let manager = namespace[this.symbol] as T | undefined;
		if (!manager) {
			manager = new this();
			namespace[this.symbol] = manager;
		}
		return manager;
	}


	addHook<K extends keyof HookMap>(methodName: K, callback: HookMap[K]) {
		this.hooks[methodName] ??= new Set();
		this.hooks[methodName].add(callback);
	}

	getHooks(methodName: PropertyKey ): Set<Function> {
		return this.hooks[methodName] ?? new Set();
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
		const lifecycleMap = this.collectHooks(prototype[Symbol.metadata] as DecoratorMetadata);

		if (!lifecycleMap) return prototype.constructor;

		const cutomConstructors = lifecycleMap["constructor"];

		for (const [methodName, callbacks] of Object.entries(lifecycleMap)) {
			if (methodName === "constructor") continue;

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

		if (cutomConstructors) {
			const Wrapper = class extends prototype.constructor {
				constructor(...args: any[]) {
					super(...args);
					for (const callback of cutomConstructors) {
						callback.call(this, ...args);
					}
				}
			}

			Object.defineProperty(Wrapper, 'name', { value: prototype.constructor.name });
			return Wrapper;
		}

		return prototype.constructor;
	}


	static compose<T extends WebComponentConstructor>(
		value: T,
		context: ClassDecoratorContext<T>,
	): T {
		const metadata = context.metadata;
		Object.defineProperty(value, Symbol.metadata, {
			value: metadata,
			configurable: true,
			enumerable: false,
		});

		return this.applyHooks(value.prototype) || value;
	}
}

export function compose(tagName: string) {
	return function <T extends WebComponentConstructor>(
		constructor: T,
		context: ClassDecoratorContext<T>
	): T {
		const DecoratedClass = ComposedDecoratorManager.compose(constructor, context);

		context.addInitializer(function () {
			if (!customElements.get(tagName)) {
				customElements.define(tagName, DecoratedClass);
			}
		});

		return DecoratedClass;
	}
}