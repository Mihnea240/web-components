/**
 * Decorator for class accessors that returns elements assigned to a named slot in the shadow DOM.
 * Optionally filters the assigned elements by a CSS selector and can return a single element or array.
 *
 * @param slotName - The name of the slot to query in the shadow DOM (e.g., 'header', 'tab'). 
 *                   Empty string for the default slot.
 * @param selector - Optional CSS selector to filter assigned elements (e.g., '[active]', '.item', 'button').
 * @param single - When true, returns the first matching element or null. When false/undefined, returns an array.
 * 
 * @example
 * // Returns all elements assigned to the 'tab' slot
 * @slotted('tab')
 * accessor tabs!: HTMLElement[];
 * 
 * @example
 * // Returns the first element with [active] attribute in the 'tab' slot, or null if none found
 * @slotted('tab', '[active]', true)
 * accessor activeTab!: HTMLElement | null;
 * 
 * @example
 * // Returns all button elements in the 'header' slot
 * @slotted('header', 'button')
 * accessor headerButtons!: HTMLElement[];
 * 
 * @example
 * // Returns all elements in the default slot (no name attribute)
 * @slotted('')
 * accessor defaultSlotContent!: HTMLElement[];
 */
export function slotted<T extends HTMLElement = HTMLElement>(slotName: string, selector?: string, single?: false): (target: any, context: ClassAccessorDecoratorContext) => any;
export function slotted<T extends HTMLElement = HTMLElement>(slotName: string, selector: string, single: true): (target: any, context: ClassAccessorDecoratorContext) => any;
export function slotted<T extends HTMLElement = HTMLElement>(slotName: string, selector?: string, single = false) {
    return function (target: any, context: ClassAccessorDecoratorContext) {
        return {
            get(this: HTMLElement): T | T[] | null {
                // 1. Get the slot from the Shadow DOM
                // Use the default slot selector if no name is provided
                const query = slotName ? `slot[name="${slotName}"]` : 'slot:not([name])';
                const slot = this.shadowRoot?.querySelector(query) as HTMLSlotElement;
                
                if (!slot) return single ? null : [];

                // 2. Get the raw assigned elements
                const assigned = slot.assignedElements({ flatten: true }) as T[];

                // 3. Apply selector filter if present
                const result = selector 
                    ? assigned.filter(el => el.matches(selector)) 
                    : assigned;
                
                return single ? (result[0] || null) : result;
            }
        };
    };
}