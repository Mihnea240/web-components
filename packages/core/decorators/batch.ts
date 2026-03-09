import getOrCompute from '@core/util/getOrCompute';
import type { Composed } from './compose';
import { ComposedDecoratorManager } from './compose';

type DebounceInstanceData = Map<string | symbol, { timerId: number }>;

const MAP_FACTORY = () => new Map();
const DEFAULT_DEBOUNCE_DATA = () => ({ timerId: 0 });

class DebounceManager extends ComposedDecoratorManager<HTMLElement, DebounceInstanceData> {
    static symbol = Symbol("debounce-manager");

    getMethodTimer(instance: Composed<HTMLElement>, methodName: string | symbol) {
        let timers = getOrCompute(this.instanceData, instance, MAP_FACTORY);
        return getOrCompute(timers, methodName, DEFAULT_DEBOUNCE_DATA);
    }

    addMethodTimer(instance: Composed<HTMLElement>, methodName: string | symbol, timerId: number) {
        this.getMethodTimer(instance, methodName).timerId = timerId;
    }
}

/**
 * Multiple calls will result in only one execution after the specified delay from the last call.
 * Last call wins.
 * @param delay Delay in milliseconds. Default: 250ms.
 */
export function debounce(delay: number = 250) {
    return function (value: Function, context: ClassMethodDecoratorContext) {
        if (context.kind !== "method") {
            throw new Error("@debounce is for methods only");
        }

        return function (this: Composed<HTMLElement>, ...args: any[]) {
            const registry = DebounceManager.getManager(this.constructor[Symbol.metadata]);
            const debounceData = registry.getMethodTimer(this, context.name);

            const timerId = setTimeout(() => {
                value.apply(this, args);

                if (debounceData?.timerId) {
                    clearTimeout(debounceData.timerId);
                    debounceData.timerId = 0;
                }
            }, delay);

            debounceData.timerId = timerId;
        };
    };
}

type ThrottleInstanceData = Map<string | symbol, { lastCall: number }>;

const DEFAULT_THROTTLE_DATA = () => ({ lastCall: 0 });

class ThrottleManager extends ComposedDecoratorManager<HTMLElement, ThrottleInstanceData> {
    static symbol = Symbol("throttle-manager");

    getMethodTimestamp(instance: Composed<HTMLElement>, methodName: string | symbol) {
        let timestamps = getOrCompute(this.instanceData, instance, MAP_FACTORY);
        return getOrCompute(timestamps, methodName, DEFAULT_THROTTLE_DATA);
    }
}

/**
 * Throttles method calls.
 * @param delay Minimum milliseconds between executions. Default: `250`.
 */
export function throttle(delay: number = 250) {
    return function (value: Function, context: ClassMethodDecoratorContext) {
        if (context.kind !== "method") {
            throw new Error("@throttle is for methods only");
        }

        return function (this: Composed<HTMLElement>, ...args: any[]) {
            const registry = ThrottleManager.getManager(this.constructor[Symbol.metadata]);
            const throttleData = registry.getMethodTimestamp(this, context.name);
            const now = Date.now();

            if (now - throttleData.lastCall >= delay) {
                throttleData.lastCall = now;
                value.apply(this, args);
            }
        };
    };
}

type RAFInstanceData = Map<string | symbol, { rafId: number | undefined }>;

const DEFAULT_RAF_DATA = (): { rafId: number | undefined } => ({ rafId: undefined });

class RAFManager extends ComposedDecoratorManager<HTMLElement, RAFInstanceData> {
    static symbol = Symbol("raf-manager");

    getMethodRAFId(instance: Composed<HTMLElement>, methodName: string | symbol) {
        let rafIds = getOrCompute(this.instanceData, instance, MAP_FACTORY);
        return getOrCompute(rafIds, methodName, DEFAULT_RAF_DATA);
    }
}

/**
 * Batches method calls to `requestAnimationFrame`.
 */
export function raf() {
    return function (value: Function, context: ClassMethodDecoratorContext) {
        if (context.kind !== "method") {
            throw new Error("@raf is for methods only");
        }

        return function (this: Composed<HTMLElement>, ...args: any[]) {
            const registry = RAFManager.getManager(this.constructor[Symbol.metadata]);
            const rafData = registry.getMethodRAFId(this, context.name);

            if (rafData.rafId !== undefined) return;

            rafData.rafId = requestAnimationFrame(() => {
                value.apply(this, args);
                rafData.rafId = undefined;
            });
        };
    };
}

type MicroBatchInstanceData = Map<string | symbol, { pending: boolean }>;

const DEFAULT_MICROBATCH_DATA = () => ({ pending: false });

class MicroBatchManager extends ComposedDecoratorManager<HTMLElement, MicroBatchInstanceData> {
    static symbol = Symbol("microbatch-manager");

    getMethodPending(instance: Composed<HTMLElement>, methodName: string | symbol) {
        let pendings = getOrCompute(this.instanceData, instance, MAP_FACTORY);
        return getOrCompute(pendings, methodName, DEFAULT_MICROBATCH_DATA);
    }
}

/**
 * Batches method calls to the next microtask.
 */
export function microBatch() {
    return function (value: Function, context: ClassMethodDecoratorContext) {
        if (context.kind !== "method") {
            throw new Error("@microBatch is for methods only");
        }

        return function (this: Composed<HTMLElement>, ...args: any[]) {
            const registry = MicroBatchManager.getManager(this.constructor[Symbol.metadata]);
            const microBatchData = registry.getMethodPending(this, context.name);

            if (microBatchData.pending) return;

            microBatchData.pending = true;
            Promise.resolve().then(() => {
                value.apply(this, args);
                microBatchData.pending = false;
            });
        };
    };
}