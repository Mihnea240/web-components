

import { getComposedDataSpace } from "./compose";

export function debounce(delay: number = 250) { 
    return function (value: any, context: ClassMethodDecoratorContext) {
        const timerKey = `debounce-timer-${String(context.name)}`;
        
        return function (...args: any[]) {
            const dataSpace = getComposedDataSpace(this.constructor[Symbol.metadata]);
            
            if (dataSpace[timerKey] !== undefined) {
                clearTimeout(dataSpace[timerKey]);
            }

            dataSpace[timerKey] = window.setTimeout(() => {
                value.apply(this, args);
                dataSpace[timerKey] = undefined;
            }, delay);
        }
    } 
}

export function throttle(delay: number = 250) {
    return function (value: any, context: ClassMethodDecoratorContext) {
        const lastCallKey = `throttle-lastcall-${String(context.name)}`;
        
        return function (...args: any[]) {
            const dataSpace = getComposedDataSpace(this.constructor[Symbol.metadata]);
            const now = Date.now();
            const lastCall = dataSpace[lastCallKey] || 0;
            
            if (now - lastCall >= delay) {
                dataSpace[lastCallKey] = now;
                value.apply(this, args);
            }
        }
    } 
}