import { debounce, throttle } from "@decorators/batch";
import { compose, type Composed } from "@decorators/compose";
import { event } from "@decorators/event";
import { query, queryAll } from "@decorators/query";
import { Mappers, reflect, watcher } from "@decorators/reflect";

interface SmartCounter extends Composed<HTMLElement> {} 

@compose("smart-counter")
class SmartCounter extends HTMLElement { 
    // 1. Reflection: Sync properties with attributes
    @reflect("count", Mappers.Number)
    accessor count = 10;

    @reflect("active", Mappers.Boolean)
    accessor active = false;

    @reflect("label", Mappers.String)
    accessor label = "Counter";

    // 2. Query Selectors: Cache DOM references
    @query(".count-display")
    accessor countDisplay: HTMLElement | null = null;

    @query(".increment-btn") 
    accessor incrementBtn: HTMLButtonElement | null = null;

    @query(".decrement-btn")
    accessor decrementBtn: HTMLButtonElement | null = null;

    @queryAll(".number-btn")
    accessor numberButtons!: NodeListOf<HTMLButtonElement>;

    @query(".status-indicator")
    accessor statusIndicator: HTMLElement | null = null;

    @query(".search-input")
    accessor searchInput: HTMLInputElement | null = null;

    // 3. Watchers with side effects
    @watcher("count")
    limitRange(old: number, val: number) {
        if (val > 20) return 0; // Reset to 0 if it goes over 20
        if (val < 0) return 20;  // Wrap to 20 if it goes below 0
        return val;
    }

    @watcher("count")
    updateCountDisplay(_old: number, val: number) {
        // Using cached query instead of querySelector
        if (this.countDisplay) {
            this.countDisplay.textContent = String(val);
            this.countDisplay.style.color = val > 15 ? 'red' : val < 5 ? 'blue' : 'green';
        }
    }

    @watcher("active")
    updateStatus(_old: boolean, val: boolean) {
        if (this.statusIndicator) {
            this.statusIndicator.textContent = val ? 'Active' : 'Inactive';
            this.statusIndicator.className = `status-indicator ${val ? 'active' : 'inactive'}`;
        }
    }

    @watcher("label")
    updateLabel(_old: string, val: string) {
        const labelEl = this.querySelector('h3');
        if (labelEl) labelEl.textContent = val;
    }

    // 4. Event Delegation with cached selectors
    @event("click", { selector: ".increment-btn" })
    handleIncrement() {
        this.count++;
        this.active = true;
    }

    @event("click", { selector: ".decrement-btn" })
    handleDecrement() {
        this.count--;
        this.active = true;
    }

    @event("click", { selector: ".number-btn" })
    handleNumberClick(e: Event, target: HTMLButtonElement) {
        const num = parseInt(target.dataset.num || '0');
        this.count = num;
        this.active = true;
    }

    @event("click", { selector: ".reset-btn" })
    handleReset() {
        this.count = 10;
        this.active = false;
    }

    @event("click", { selector: ".toggle-btn" })
    handleToggle() {
        this.active = !this.active;
    }

    // 5. Debounced search (simulates expensive operation)
    @debounce(300)
    @event("input", { selector: ".search-input" })
    handleSearch(e: Event) {
        const input = e.target as HTMLInputElement;
        console.log('Searching for:', input.value);
        
        // Simulate expensive search operation
        const results = this.querySelector('.search-results');
        if (results) {
            results.innerHTML = input.value ? 
                `<p>Search results for "${input.value}"... (debounced by 300ms)</p>` :
                '<p>Enter search term...</p>';
        }
    }

    // 6. Throttled resize handler (fires during continuous resizing)
    @event("resize", { target: () => window })
    @throttle(150)
    handleResize() {
        console.log('Window resized (throttled):', window.innerWidth, 'x', window.innerHeight);
        const sizeDisplay = this.querySelector('.size-display');
        if (sizeDisplay) {
            sizeDisplay.textContent = `${window.innerWidth}x${window.innerHeight}`;
        }
    }

    // 6b. Throttled scroll handler for performance
    @event("scroll", { target: () => window })
    @throttle(100)
    handleScroll() {
        const scrollY = window.scrollY;
        console.log('Window scrolled (throttled):', scrollY);
        const scrollDisplay = this.querySelector('.scroll-display');
        if (scrollDisplay) {
            scrollDisplay.textContent = `Scroll: ${scrollY}px`;
        }
    }

    // 7. Keyboard shortcuts
    @event("keydown")
    handleKeys(e: KeyboardEvent) {
        switch(e.key) {
            case 'ArrowUp':
                e.preventDefault();
                this.count++;
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.count--;
                break;
            case 'Escape':
                this.handleReset();
                break;
            case ' ':
                e.preventDefault();
                this.handleToggle();
                break;
        }
    }

    // 8. Global delegation example
    @event("click", { target: () => document, selector: "[data-global-reset]" })
    handleGlobalReset(e: Event, target: HTMLElement) {
        console.log("Global reset triggered by:", target);
        this.count = parseInt(target.dataset.globalReset || '10');
        this.active = false;
    }

    connectedCallback() {
        this.innerHTML = `
            <div class="counter-widget">
                <h3>${this.label}</h3>
                <div class="status-row">
                    <span class="count-display">${this.count}</span>
                    <span class="status-indicator ${this.active ? 'active' : 'inactive'}">
                        ${this.active ? 'Active' : 'Inactive'}
                    </span>
                </div>
                
                <div class="controls">
                    <button class="decrement-btn">-</button>
                    <button class="increment-btn">+</button>
                    <button class="reset-btn">Reset</button>
                    <button class="toggle-btn">Toggle Status</button>
                </div>

                <div class="number-buttons">
                    <span>Quick set:</span>
                    ${[0, 5, 10, 15, 20].map(n => 
                        `<button class="number-btn" data-num="${n}">${n}</button>`
                    ).join('')}
                </div>

                <div class="search-section">
                    <h4>Debounced Search</h4>
                    <input type="text" class="search-input" placeholder="Type to search..." />
                    <div class="search-results">
                        <p>Enter search term...</p>
                    </div>
                </div>

                <div class="window-info">
                    <h4>Window Size (throttled resize)</h4>
                    <div class="size-display">${window.innerWidth}x${window.innerHeight}</div>
                    <div class="scroll-display">Scroll: 0px</div>
                </div>

                <div class="help">
                    <h4>Keyboard Shortcuts</h4>
                    <ul>
                        <li>↑/↓ - Increment/Decrement</li>
                        <li>Space - Toggle Status</li>
                        <li>Escape - Reset</li>
                    </ul>
                </div>
            </div>
        `;
    }
}