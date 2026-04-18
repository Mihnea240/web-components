type ArrayChangeHandler = (change: ArrayChange) => void;

export interface ArrayChange {
    type: 'add' | 'remove' | 'update' | 'splice';
    index: number;
    count?: number; // for splice/remove: how many items
}

export function createObservableArray<T>(
    array: T[],
    onChange: ArrayChangeHandler
): T[] {
    const proxy = new Proxy(array, {
        set(target, prop: string | symbol, value) {
            const index = parseInt(prop as string);

            if (!isNaN(index)) {
                target[index] = value;
                onChange({ type: 'update', index });
            } else {
                target[prop] = value;
            }
            return true;
        }
    });

    // Wrap mutation methods
    const push = proxy.push;
    proxy.push = function (...items: T[]) {
        const index = this.length;
        const result = push.apply(this, items);
        onChange({ type: 'add', index, count: items.length });
        return result;
    };

    const pop = proxy.pop;
    proxy.pop = function () {
        const index = this.length - 1;
        const result = pop.call(this);
        onChange({ type: 'remove', index, count: 1 });
        return result;
    };

    const shift = proxy.shift;
    proxy.shift = function () {
        const result = shift.call(this);
        onChange({ type: 'remove', index: 0, count: 1 });
        return result;
    };

    const unshift = proxy.unshift;
    proxy.unshift = function (...items: T[]) {
        const result = unshift.apply(this, items);
        onChange({ type: 'add', index: 0, count: items.length });
        return result;
    };

    const splice = proxy.splice;
    proxy.splice = function (start: number, deleteCount?: number, ...items: T[]) {
        const result = splice.apply(this, [start, deleteCount, ...items]);
        onChange({ type: 'splice', index: start, count: result.length });
        return result;
    };

    return proxy;
}
