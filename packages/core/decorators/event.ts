import { getComposedDataSpace, addComposedSetupTask } from "./compose";

type EventHandlersMap = Map<string, {
    methodName: string | symbol,
    options?: AddEventListenerOptions
}[]>;

class EventRegistry {
    static readonly eventDataKey = Symbol("event-metadata");

    constructor(public event: string, public options?: AddEventListenerOptions) { }

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

        const eventMeta = metadata.get(this.event)!;
        eventMeta.push({ methodName: context.name, options: this.options });
    }


    static setup(constructor: Function, prototype: any) {
        const metadata = EventRegistry.getMetadata(constructor[Symbol.metadata]);

        const handleEventOriginal = prototype.handleEvent;
        const connectedCallbackOriginal = prototype.connectedCallback;
        const disconnectedCallbackOriginal = prototype.disconnectedCallback;

        prototype.handleEvent = function (event: Event) {
            const eventType = event.type;
            const handlers = metadata.get(eventType);

            for (const { methodName, options } of handlers || []) {
                if (typeof this[methodName] === "function") {
                    this[methodName](event);
                }
            }

            handleEventOriginal?.call(this, event);
        };

        prototype.connectedCallback = function () {
            for (const [eventType, handlers] of metadata.entries()) {
                for (const { methodName, options } of handlers) {
                    this.addEventListener(eventType, this, options);
                }
            }

            connectedCallbackOriginal?.call(this);
        };

        prototype.disconnectedCallback = function () {
            for (const [eventType, handlers] of metadata.entries()) {
                for (const { methodName, options } of handlers) {
                    this.removeEventListener(eventType, this, options);
                }
            }

            disconnectedCallbackOriginal?.call(this);
        };

    }
}

export function event(eventName: string, options?: AddEventListenerOptions) { 
    return function(value: Function, context: ClassMethodDecoratorContext) {
        const registry = new EventRegistry(eventName, options);
        return registry.eventDecorator(value, context);
    }
}