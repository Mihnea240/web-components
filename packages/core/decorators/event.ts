import type { ComposedComponent } from "./compose";
import { ComposedDecoratorManager } from "./compose";

export type EventDecoratorOptions = {
    /** Function that returns the element to attach the listener to. @default identity (element itself) */
    target?: (element: HTMLElement) => HTMLElement | Window | Document;
    /** CSS selector for event delegation. Only triggers handler if target matches. */
    selector?: string;
    /** Listener options (capture, passive, once). Passed to addEventListener. */
    options?: AddEventListenerOptions;
}

interface EventListenerEntry {
    methodName: string | symbol;
    target: (element: HTMLElement) => HTMLElement | Window | Document;
    selector?: string;
    options: AddEventListenerOptions;
}

type EventHandlersMap = Map<string, EventListenerEntry[]>;

const DEFAULT_EVENT_ENTRY: EventListenerEntry = {
    methodName: "",
    target: (element: HTMLElement) => element,
    options: {}
}

class EventRegistry extends ComposedDecoratorManager {
    static symbol = Symbol("EventRegistry");
    private hooksRegistered = false;

    constructor(public eventHandlers: EventHandlersMap = new Map()) {
        super();
    }

    private ensureHooksRegistered() {
        if (!this.hooksRegistered) {
            this.addHook("handleEvent", EventRegistry.handleEventCallback);
            this.addHook("connectedCallback", EventRegistry.connectedCallback);
            this.addHook("disconnectedCallback", EventRegistry.disconnectedCallback);
            this.hooksRegistered = true;
        }
    }

    registerEventHandler(
        eventName: string,
        methodName: string | symbol,
        options?: EventDecoratorOptions
    ) {
        let handlerArray = this.eventHandlers.get(eventName);
        if (!handlerArray) {
            this.eventHandlers.set(eventName, handlerArray = []);
        }

        handlerArray.push({
            ...DEFAULT_EVENT_ENTRY,
            ...options,
            methodName
        });

        this.ensureHooksRegistered();
    }

    static handleEventCallback(this: ComposedComponent, event: Event) {
        const registry = EventRegistry.getManager(this.constructor[Symbol.metadata]);
        const eventType = event.type;
        const handlers = registry.eventHandlers.get(eventType);

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
            if (selectedTarget && (!(actualTarget instanceof Node) || actualTarget.contains(selectedTarget))) {
                this[methodName](event, selectedTarget);
            }
        }
    }

    static connectedCallback(this: ComposedComponent) {
        const registry = EventRegistry.getManager(this.constructor[Symbol.metadata]);
        for (const [eventType, handlers] of registry.eventHandlers.entries()) {
            for (const { target, options } of handlers) {
                const actualTarget = target(this);
                actualTarget.addEventListener(eventType, this as any, options);
            }
        }
    }

    static disconnectedCallback(this: ComposedComponent) {
        const registry = EventRegistry.getManager(this.constructor[Symbol.metadata]);
        for (const [eventType, handlers] of registry.eventHandlers.entries()) {
            for (const { target, options } of handlers) {
                const actualTarget = target(this);
                actualTarget.removeEventListener(eventType, this as any, options);
            }
        }
    }
}

/**
 * Decorator for declaratively attaching event listeners to elements.
 * Supports delegation via the `selector` option and custom event targets via the `target` option.
 * It uses handleEvent for calling so cleanup is simpler.
 */
export function event(eventName: string, options?: EventDecoratorOptions) {
    return function (value: Function, context: ClassMethodDecoratorContext) {
        if (context.kind !== "method") {
            throw new Error("@event can only be applied to methods");
        }

        const registry = EventRegistry.getManager(context.metadata);
        registry.registerEventHandler(eventName, context.name, options);
    }
}
