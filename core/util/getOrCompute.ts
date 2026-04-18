export default function getOrCompute<K extends WeakKey, V>(map: WeakMap<K, V>, key: K, compute: () => V): V;
export default function getOrCompute<K, V>(map: Map<K, V>, key: K, compute: () => V): V;
export default function getOrCompute(
    map: Map<any, any> | WeakMap<any, any>, 
    key: any, 
    compute: () => any
): any {
    let value = map.get(key);
    
    if (value === undefined) {
        value = compute();
        map.set(key, value);
    }
    
    return value;
}