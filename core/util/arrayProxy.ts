export interface ArrayDelegate {
    onUpdate: (index: number) => void;
    onAdd:    (index: number, count: number) => void;
    onRemove: (index: number, count: number) => void;
    onSplice: (index: number, removedCount: number, addedCount: number) => void;
}

export function createObservableArray<T>(array: T[], delegate: ArrayDelegate): T[] {

    const methodTraps = {
        push: (...items: T[]) => {
            const oldLength = array.length;
            const result = Array.prototype.push.apply(array, items);
            delegate.onAdd(oldLength, items.length);
            return result;
        },
        pop: () => {
            const oldLength = array.length;
            const result = Array.prototype.pop.apply(array);
            if (result !== undefined) {
                delegate.onRemove(oldLength - 1, 1);
            }
            return result;
        },
        splice: (start: number, deleteCount: number, ...items: T[]) => {
            const result = Array.prototype.splice.apply(array, [start, deleteCount, ...items]);
            delegate.onSplice(start, deleteCount, items.length);
            return result;
        },
        shift: () => {
            const result = Array.prototype.shift.apply(array);
            if (result !== undefined) {
                delegate.onRemove(0, 1);
            }
            return result;
        },
        unshift: (...items: T[]) => {
            const result = Array.prototype.unshift.apply(array, items);
            delegate.onAdd(0, items.length);
            return result;
        }
    }

    return new Proxy(array, {
        // 1. Intercept standard index sets (e.g., arr[0] = val)
        set(target, prop, value, receiver) {
            const index = Number(prop);
            const isIndex = Number.isInteger(index) && index >= 0;
            
            // Perform the update
            const success = Reflect.set(target, prop, value, receiver);
            
            // Only trigger delegate for index updates, ignoring 'length' etc.
            if (success && isIndex) {
                delegate.onUpdate(index);
            }
            return success;
        },

        // 2. Intercept method access (e.g., arr.push)
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);

            // If it's a function (method), wrap it to handle custom logic
            if (typeof value === 'function') {
                const trap = methodTraps[prop as keyof typeof methodTraps];
                if (trap) {
                    return trap;
                }
            }
            return value;
        }
    });
}