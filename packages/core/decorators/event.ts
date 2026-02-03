import { getComposedDataSpace, addComposedSetupTask } from "./compose";

type EventHandlersMap = Map<string, {
    methodName: string | symbol,
    target?: Function,
    selector?: string,
    options?: AddEventListenerOptions
}[]>;

type EventDecoratorOptions = {
    target?: Function;
    selector?: string;
    options?: AddEventListenerOptions;
}

function identity(el: HTMLElement) {
    return el;
}

class EventRegistry {
    static readonly eventDataKey = Symbol("event-metadata");

    constructor(public event: string, public options?: EventDecoratorOptions) {
        this.options ||= {};
        this.options.target ||= identity
        this.options.options ||= {};
    }

    static getMetadata(metadata: DecoratorMetadataObject): EventHandlersMap {
        const dataSpace = getComposedDataSpace(metadata);
        return dataSpace[EventRegistry.eventDataKey] ??= new Map();
    }

    eventDecorator(
        value: Function,
        context: ClassMethodDecoratorContext
    ) {
        if (context.kind !== "method") {
            throw new Error("@event can only be applied to methods");
        }

        addComposedSetupTask(context.metadata, EventRegistry.setup);
        const metadata = EventRegistry.getMetadata(context.metadata);

        if (!metadata.has(this.event)) {
            metadata.set(this.event, []);
        }

        metadata.get(this.event).push({
            methodName: context.name,
            options: this.options.options,
            selector: this.options.selector,
            target: this.options.target
        });
    }


    static setup(constructor: Function, prototype: any) {
        const metadata = EventRegistry.getMetadata(constructor[Symbol.metadata]);

        const handleEventOriginal = prototype.handleEvent;
        const connectedCallbackOriginal = prototype.connectedCallback;
        const disconnectedCallbackOriginal = prototype.disconnectedCallback;

        prototype.handleEvent = function (event: Event) {
            const eventType = event.type;
            const handlers = metadata.get(eventType);

            for (const { methodName, selector, target } of handlers || []) {
                if (typeof this[methodName] !== "function") {
                    throw new Error(`@event handler method ${String(methodName)} is not a function`);
                }

                const actualTarget = target(this);
                if (actualTarget !== event.currentTarget) {
                    continue;
                }

                if (!selector) {
                    this[methodName](event);
                    continue;
                }

                const selectedTarget = (event.target as HTMLElement).closest(selector);
                if (selectedTarget && (!actualTarget.contains || actualTarget.contains(selectedTarget))) {
                    this[methodName](event, selectedTarget);
                }

            }

            handleEventOriginal?.call(this, event);
        };

        prototype.connectedCallback = function () {
            for (const [eventType, handlers] of metadata.entries()) {
                for (const { methodName, options, target } of handlers) {

                    const actualTarget = target(this);
                    actualTarget.addEventListener(eventType, this, options);
                }
            }

            connectedCallbackOriginal?.call(this);
        };

        prototype.disconnectedCallback = function () {
            for (const [eventType, handlers] of metadata.entries()) {
                for (const { methodName, options, target } of handlers) {

                    const actualTarget = target(this);
                    actualTarget.removeEventListener(eventType, this, options);
                }
            }

            disconnectedCallbackOriginal?.call(this);
        };

    }
}

export function event(eventName: string, options?: EventDecoratorOptions) {
    return function (value: Function, context: ClassMethodDecoratorContext) {
        const registry = new EventRegistry(eventName, options);
        return registry.eventDecorator(value, context);
    }
}