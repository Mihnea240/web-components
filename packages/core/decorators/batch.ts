/**
 * @debounce
 * Delays method execution until after a specified delay has passed since the last call.
 */
export function debounce(delay: number = 250) {
    return function (value: Function, context: ClassMethodDecoratorContext) {
        if (context.kind !== "method") throw new Error("@debounce is for methods only");

        // 1. Create a unique brand for this specific method decoration
        const TIMER_ID = Symbol(`debounce_timer_${String(context.name)}`);

        // 2. Schedule instance-level setup
        context.addInitializer(function (this: any) {
            this[TIMER_ID] = undefined;
        });

        // 3. Return the wrapper
        return function (this: any, ...args: any[]) {
            if (this[TIMER_ID] !== undefined) {
                clearTimeout(this[TIMER_ID]);
            }

            this[TIMER_ID] = setTimeout(() => {
                value.apply(this, args);
                this[TIMER_ID] = undefined;
            }, delay);
        };
    };
}

/**
 * @throttle
 * Ensures a method is called at most once per delay.
 */
export function throttle(delay: number = 250) {
    return function (value: Function, context: ClassMethodDecoratorContext) {
        if (context.kind !== "method") throw new Error("@throttle is for methods only");

        const LAST_CALL = Symbol(`throttle_last_${String(context.name)}`);

        context.addInitializer(function (this: any) {
            this[LAST_CALL] = 0;
        });

        return function (this: any, ...args: any[]) {
            const now = Date.now();
            if (now - this[LAST_CALL] >= delay) {
                this[LAST_CALL] = now;
                value.apply(this, args);
            }
        };
    };
}

/**
 * @raf
 * Batches calls to the next animation frame.
 */
export function raf() {
    return function (value: Function, context: ClassMethodDecoratorContext) {
        if (context.kind !== "method") throw new Error("@raf is for methods only");

        const RAF_ID = Symbol(`raf_id_${String(context.name)}`);

        context.addInitializer(function (this: any) {
            this[RAF_ID] = undefined;
        });

        return function (this: any, ...args: any[]) {
            if (this[RAF_ID] !== undefined) return;

            this[RAF_ID] = requestAnimationFrame(() => {
                value.apply(this, args);
                this[RAF_ID] = undefined;
            });
        };
    };
}

/**
 * @microBatch
 * Batches calls to the next microtask, ensuring it runs after the current synchronous code but before the next frame.
 * Useful for coalescing multiple rapid calls without waiting for a full animation frame.
 * Note: This is similar to @debounce with a delay of 0, but uses microtasks for more immediate batching.
 *       It will execute after the current call stack is cleared, but before any pending rendering or I/O.
 */
export function microBatch() {
    return function (value: Function, context: ClassMethodDecoratorContext) {
        if (context.kind !== "method") throw new Error("@microBatch is for methods only");
        
        const PROMISE_PENDING = Symbol(`microbatch_pending_${String(context.name)}`);

        context.addInitializer(function (this: any) {
            this[PROMISE_PENDING] = false;
        });
        
        return function (this: any, ...args: any[]) {
            if (this[PROMISE_PENDING]) return;

            this[PROMISE_PENDING] = true;
            Promise.resolve().then(() => {
                value.apply(this, args);
                this[PROMISE_PENDING] = false;
            });
        };
    };
}