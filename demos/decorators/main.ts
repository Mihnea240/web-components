import { reflect, watcher, Mappers } from "@core/decorators/reflect";
import { composeElement } from "@core/decorators/compose";
import { event } from "@core/decorators/event";

@composeElement("smart-counter")
class SmartCounter extends HTMLElement { 
    // 1. Initial Reflection: This '10' will be reflected to the attribute 
    // on connection unless the HTML provides a different value.
    @reflect("count", Mappers.Number)
    accessor count = 10;

    @reflect("active", Mappers.Boolean)
    accessor active = false;

    // 2. Complex Watchers: One acts as a 'reducer' (modifying state), 
    // the other as a 'side-effect' (logging).
    @watcher("count")
    limitRange(old: number, val: number) {
        if (val > 20) return 0; // Reset to 0 if it goes over 20
        if (val < 0) return 20;  // Wrap to 20 if it goes below 0
        return val;
    }

    @watcher("count")
    updateUI(_old: number, val: number) {
        const display = this.querySelector('.count-display');
        if (display) display.textContent = String(val);
    }

    // 3. Delegation: Internal vs. External
    
    // Internal Delegation: Only works for buttons INSIDE this component
    @event("click", { selector: ".increment" })
    handleInc() {
        this.count++;
    }

    @event("click", { selector: ".decrement" })
    handleDec() {
        this.count--;
    }

    // Global Delegation: Listens to the whole window, but only reacts 
    // if the user clicks an element with the 'data-reset' class anywhere.
    @event("click", { target: () => window, selector: ".data-reset" })
    handleGlobalReset(e: Event, target: HTMLElement) {
        console.log("Global reset triggered by:", target);
        this.count = 10;
    }

    // Window Listener: Standard global event
    @event("keydown")
    handleKeys(e: KeyboardEvent) {
        if (e.key === "ArrowUp") this.count++;
        if (e.key === "ArrowDown") this.count--;
    }

    connectedCallback() {
        this.innerHTML = `
            <div style="border: 2px solid #ccc; padding: 1rem; margin: 1rem;">
                <h3>Count: <span class="count-display">${this.count}</span></h3>
                <button class="increment">Increment (+)</button>
                <button class="decrement">Decrement (-)</button>
                <p><small>Try Arrow Up/Down keys too!</small></p>
            </div>
        `;
    }
}