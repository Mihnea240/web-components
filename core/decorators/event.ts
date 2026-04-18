import type { Composed } from "./compose";
import { ComposedDecoratorManager } from "./compose";

export type EventDecoratorOptions<T extends Composed<HTMLElement> = Composed<HTMLElement>> = {
    /** Function that returns the element to attach the listener to. @default identity (element itself) */
    target?: (element: T) => EventTarget | null;
    /** CSS selector for event delegation. Only triggers handler if target matches. */
    selector?: string;
    /** Listener options (capture, passive, once). Passed to addEventListener. */
    options?: AddEventListenerOptions;
}

interface EventListenerEntry {
    methodName: string | symbol;
    target: (element: Composed<HTMLElement>) => EventTarget | null;
    selector?: string;
    options: AddEventListenerOptions;
}

type EventHandlersMap = Map<string, EventListenerEntry[]>;

const DEFAULT_EVENT_ENTRY: EventListenerEntry = {
    methodName: "",
    target: (element: Composed<HTMLElement>) => element,
    options: {}
}

class EventRegistry extends ComposedDecoratorManager<HTMLElement, never> {
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

    registerEventHandler<T extends Composed<HTMLElement>>(
        eventName: string,
        methodName: string | symbol,
        options?: EventDecoratorOptions<T>
    ) {
        let handlerArray = this.eventHandlers.get(eventName);
        if (!handlerArray) {
            this.eventHandlers.set(eventName, handlerArray = []);
        }

        handlerArray.push({
            ...DEFAULT_EVENT_ENTRY,
            ...options as EventDecoratorOptions<Composed<HTMLElement>>,
            methodName
        });

        this.ensureHooksRegistered();
    }

    static handleEventCallback(this: Composed<HTMLElement>, event: Event) {
        const registry = EventRegistry.getManager(this.constructor[Symbol.metadata]);
        const eventType = event.type;
        const handlers = registry.eventHandlers.get(eventType);

        for (const { methodName, selector, target } of handlers || []) {
            if (typeof this[methodName] !== "function") {
                throw new Error(`@event handler method ${String(methodName)} is not a function`);
            }

            const actualTarget = target(this);
            if (!actualTarget) {
                continue;
            }

            if (actualTarget !== event.currentTarget) {
                continue;
            }

            if (!selector) {
                this[methodName](event);
                continue;
            }

            const eventTarget = event.target;
            if (!(eventTarget instanceof Element)) {
                continue;
            }

            const selectedTarget = eventTarget.closest(selector);
            if (selectedTarget && (!(actualTarget instanceof Node) || actualTarget.contains(selectedTarget))) {
                this[methodName](event, selectedTarget);
            }
        }
    }

    static connectedCallback(this: Composed<HTMLElement>) {
        const registry = EventRegistry.getManager(this.constructor[Symbol.metadata]);
        for (const [eventType, handlers] of registry.eventHandlers.entries()) {
            for (const { target, options } of handlers) {
                const actualTarget = target(this);
                if (actualTarget) {
                    actualTarget.addEventListener(eventType, this as any, options);
                }
            }
        }
    }

    static disconnectedCallback(this: Composed<HTMLElement>) {
        const registry = EventRegistry.getManager(this.constructor[Symbol.metadata]);
        for (const [eventType, handlers] of registry.eventHandlers.entries()) {
            for (const { target, options } of handlers) {
                const actualTarget = target(this);
                actualTarget?.removeEventListener(eventType, this as any, options);
            }
        }
    }
}

/**
 * Binds a DOM event handler to a method.
 *
 * @param eventName Event type string. Known DOM names infer the handler event type; unknown strings fall back to `Event`.
 * @param options Listener options.
 * @param options.target Resolver for listener target. Default: host element.
 * @param options.selector Delegation selector; when matched, handler receives `selectedTarget` as second argument.
 * @param options.options Native listener options passed to `addEventListener`.
 *
 * @example
 * ```ts
 * @event("click", { selector: "button[data-action]" })
 * onAction(ev: PointerEvent, selectedTarget?: Element) {
 *   // selectedTarget is the matching delegated element when present.
 * }
 * ```
 */
export function event<K extends keyof GlobalEventHandlersEventMap>(
    eventName: K,
    options?: EventDecoratorOptions<Composed<HTMLElement>>
): <T extends Composed<HTMLElement>, V extends (this: T, event: GlobalEventHandlersEventMap[K], selectedTarget?: any) => any>(
    value: V,
    context: ClassMethodDecoratorContext<T, V>
) => void;
export function event(
    eventName: string,
    options?: EventDecoratorOptions<Composed<HTMLElement>>
): <T extends Composed<HTMLElement>, V extends (this: T, event: Event, selectedTarget?: any) => any>(
    value: V,
    context: ClassMethodDecoratorContext<T, V>
) => void;
export function event<T extends Composed<HTMLElement>>(eventName: string, options?: EventDecoratorOptions<T>) {
    return function <V extends (this: T, event: Event, selectedTarget?: any) => any>(
        value: V,
        context: ClassMethodDecoratorContext<T, V>
    ) {
        const registry = EventRegistry.getManager(context.metadata);
        registry.registerEventHandler(eventName, context.name, options);
    }
}
