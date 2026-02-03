export const SETUP_SYMBOL = Symbol("composed-setup");
export type SetupComposedTask = (constructor: Function, proto: any) => void;
export type WebComponentConstructor = new (...args: any[]) => HTMLElement;
export type LifecycleCallback = (this: HTMLElement, ...args: any[]) => void;

(Symbol as any).metadata ??= Symbol.for("metadata");

export function getComposedDataSpace(metadata: DecoratorMetadata): {
    lifecycleCallbacks: Record<string, Set<LifecycleCallback>>,
    setupOperations: Array<(constructor: Function, prototype: any) => void>
} {
    let meta = metadata[SETUP_SYMBOL] as {
        lifecycleCallbacks: Record<string, Set<LifecycleCallback>>,
        setupOperations: Array<(constructor: Function, prototype: any) => void>
    };
    if (!meta) {
        meta = { 
            lifecycleCallbacks: {},
            setupOperations: []
        };
        metadata[SETUP_SYMBOL] = meta;
    }
    return meta;
}

export function addLifecycleCallback(metadata: DecoratorMetadata, methodName: string, callback: LifecycleCallback) {
    const dataSpace = getComposedDataSpace(metadata);
    dataSpace.lifecycleCallbacks[methodName] ??= new Set();
    dataSpace.lifecycleCallbacks[methodName].add(callback);
}

export function addSetupOperation(metadata: DecoratorMetadata, operation: (constructor: Function, prototype: any) => void) {
    const dataSpace = getComposedDataSpace(metadata);
    dataSpace.setupOperations.push(operation);
}

export function composeElement(tagName: string) {
	return function <T extends WebComponentConstructor>(
		constructor: T,
		context: ClassDecoratorContext<T>
	): T | void {
		
		const metadata = context.metadata
		if (metadata) {
			Object.defineProperty(constructor, Symbol.metadata, {
				value: metadata,
				configurable: true,
				enumerable: false,
			});
		}
		const dataSpace = getComposedDataSpace(metadata);

		console.log(Symbol.metadata, metadata, constructor[Symbol.metadata]);
		
		// Run all setup operations (constructor/prototype modifications)
		for (const operation of dataSpace.setupOperations) {
			operation(constructor, constructor.prototype);
		}
		
		// Create efficient single wrappers for lifecycle methods
		setupLifecycleWrappers(constructor.prototype, dataSpace.lifecycleCallbacks);

		customElements.define(tagName, constructor);
		return constructor;
	}

}

function setupLifecycleWrappers(prototype: any, lifecycleCallbacks: Record<string, Set<LifecycleCallback>>) {
	for (const [methodName, callbacks] of Object.entries(lifecycleCallbacks)) {
		if (callbacks.size === 0) continue;
		
		const originalMethod = prototype[methodName];
		
		prototype[methodName] = function(...args: any[]) {
			// Call all collected callbacks first
			for (const callback of callbacks) {
				callback.call(this, ...args);
			}
			
			// Then call original method if it exists
			originalMethod?.call(this, ...args);
		};
	}
}