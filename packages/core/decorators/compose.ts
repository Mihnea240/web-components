export const SETUP_SYMBOL = Symbol("composed-setup");
export type SetupComposedTask = (constructor: Function, proto: any) => void;

type WebComponentConstructor = new (...args: any[]) => HTMLElement;

(Symbol as any).metadata ??= Symbol.for("metadata");

export function getComposedDataSpace(metadata: DecoratorMetadata): {tasks: Set<SetupComposedTask>} {
    let meta = metadata[SETUP_SYMBOL] as {tasks: Set<SetupComposedTask>};
    if (!meta) {
        meta = { tasks: new Set() };
        metadata[SETUP_SYMBOL] = meta;
    }
    return meta;
}

export function addComposedSetupTask(metadata : DecoratorMetadata,task: SetupComposedTask) {
	const dataSpace = getComposedDataSpace(metadata);
	dataSpace.tasks.add(task);
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
		for (const task of dataSpace.tasks) {
			task(constructor, constructor.prototype);
		}

		customElements.define(tagName, constructor);
		return constructor;
	}

}