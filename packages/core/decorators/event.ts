import { getComposedDataSpace, addLifecycleCallback } from "./compose";

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

        // Register static callbacks - Sets will automatically deduplicate
        addLifecycleCallback(context.metadata, 'handleEvent', EventRegistry.handleEventCallback);
        addLifecycleCallback(context.metadata, 'connectedCallback', EventRegistry.connectedCallback);
        addLifecycleCallback(context.metadata, 'disconnectedCallback', EventRegistry.disconnectedCallback);
    }

    static handleEventCallback(this: HTMLElement, event: Event) {
        const eventMetadata = EventRegistry.getMetadata(this.constructor[Symbol.metadata]);
        const eventType = event.type;
        const handlers = eventMetadata.get(eventType);

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
    }

    static connectedCallback(this: HTMLElement) {
        const eventMetadata = EventRegistry.getMetadata(this.constructor[Symbol.metadata]);
        for (const [eventType, handlers] of eventMetadata.entries()) {
            for (const { methodName, options, target } of handlers) {
                const actualTarget = target(this);
                actualTarget.addEventListener(eventType, this, options);
            }
        }
    }

    static disconnectedCallback(this: HTMLElement) {
        const eventMetadata = EventRegistry.getMetadata(this.constructor[Symbol.metadata]);
        for (const [eventType, handlers] of eventMetadata.entries()) {
            for (const { methodName, options, target } of handlers) {
                const actualTarget = target(this);
                actualTarget.removeEventListener(eventType, this, options);
            }
        }
    }

}

export function event(eventName: string, options?: EventDecoratorOptions) {
    return function (value: Function, context: ClassMethodDecoratorContext) {
        const registry = new EventRegistry(eventName, options);
        return registry.eventDecorator(value, context);
    }
}