

export function debounce(delay: number = 0) { 
    const TIMER_KEY = Symbol("debounce-timer");

    return function (value: any, context: ClassMethodDecoratorContext) {
        return function (...args: any[]) { 
            if (this[TIMER_KEY] !== undefined) {
                clearTimeout(this[TIMER_KEY]);
            }

            this[TIMER_KEY] = window.setTimeout(() => {
                value.apply(this, args);
                this[TIMER_KEY] = undefined;
            }, delay);
        }
    } 
}