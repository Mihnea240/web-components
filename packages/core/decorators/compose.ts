export type Constructor<T = any> = new (...args: any[]) => T;
export type AccessorKey = string | symbol;
export interface ComposedComponent extends HTMLElement {
	constructor: Constructor<HTMLElement> & {
		[Symbol.metadata]: DecoratorMetadataObject;
	};
	[key: AccessorKey]: any;
}
export type ComposedComponentConstructor = Constructor<ComposedComponent> & {
    [Symbol.metadata]: DecoratorMetadataObject;
};

export type HookMap = {
	// Statics (The Class Definition)
	finalize: (constructor: ComposedComponentConstructor) => void;

	constructor: (this: ComposedComponent, ...args: any[]) => void;
	connectedCallback: (this: ComposedComponent) => void;
	disconnectedCallback: (this: ComposedComponent) => void;
	attributeChangedCallback: (this: ComposedComponent, name: string, old: string, next: string) => void;
	handleEvent: (this: ComposedComponent, event: Event) => void;

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

	hooks: Record<PropertyKey, Set<Function>> = {};

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

	getHooks(methodName: PropertyKey): Set<Function> {
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


	static compose<T extends Constructor<HTMLElement>>(
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
	return function <T extends Constructor<HTMLElement>>(
		constructor: T,
		context: ClassDecoratorContext<T>
	) {
		const DecoratedClass = ComposedDecoratorManager.compose(constructor, context);

		context.addInitializer(function () {
			if (!customElements.get(tagName)) {
				customElements.define(tagName, DecoratedClass);
			}
		});

		return DecoratedClass as T & Constructor<ComposedComponent>;
	}
}