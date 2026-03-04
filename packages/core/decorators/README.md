# Web Components Decorators

A powerful collection of TypeScript decorators for building modern Web Components with declarative patterns, automatic lifecycle management, and performance optimizations.

## Quick Start

```typescript
import { compose } from "@decorators/compose";
import { reflect, watcher, Mappers } from "@decorators/reflect";
import { event } from "@decorators/event";
import { debounce, throttle } from "@decorators/debounce";
import { query, queryAll } from "@decorators/query";

@compose("my-counter")
class MyCounter extends HTMLElement {
    @reflect("count", Mappers.Number)
    accessor count = 0;

    @query(".display")
    accessor display!: HTMLElement;

    @event("click", { selector: ".increment-btn" })
    @debounce(100)
    handleIncrement() {
        this.count++;
    }

    @watcher("count")
    updateDisplay(_old: number, val: number) {
        if (this.display) {
            this.display.textContent = String(val);
        }
    }
}
```

## Core Decorators

### @compose

Registers a custom element and enables the decorator composition system.

```typescript
@compose("custom-widget")
class CustomWidget extends HTMLElement {
    // Decorators will be automatically composed
}
```

**Features:**
- Automatic custom element registration
- Lifecycle management for all decorators
- Deduplication of lifecycle callbacks
- Memory-safe cleanup

### @reflect

Synchronizes class properties with HTML attributes with automatic type conversion.

```typescript
@compose("user-card")
class UserCard extends HTMLElement {
    @reflect("user-id", Mappers.Number)
    accessor userId = 0;

    @reflect("active", Mappers.Boolean)
    accessor active = false;

    @reflect("name", Mappers.String)
    accessor name = "Anonymous";

    @reflect("preferences", Mappers.JSON)
    accessor preferences = { theme: "light" };

    // Mapper is optional - defaults to string mapping
    @reflect("title")
    accessor title = "Default Title";
}
```

**Usage in HTML:**
```html
<user-card user-id="123" active name="John" preferences='{"theme":"dark"}' title="My Card"></user-card>
```

**Available Mappers:**
- No mapper (default) - Direct string mapping
- `Mappers.String` - Explicit string mapping (same as default)
- `Mappers.Number` - Converts to/from numbers
- `Mappers.Boolean` - Handles boolean attributes (`present = true`, `absent = false`)
- `Mappers.JSON` - Serializes/deserializes objects

### @watcher

Observes property changes and executes side effects. Watchers can transform values before they're set.

```typescript
@compose("validated-input")
class ValidatedInput extends HTMLElement {
    @reflect("value", Mappers.String)
    accessor value = "";

    @reflect("max-length", Mappers.Number)
    accessor maxLength = 100;

    // Transform value before setting
    @watcher("value")
    enforceMaxLength(oldValue: string, newValue: string): string {
        return newValue.length > this.maxLength 
            ? newValue.slice(0, this.maxLength)
            : newValue;
    }

    // Side effect without transformation
    @watcher("value")
    updateValidation(_old: string, val: string) {
        this.classList.toggle("valid", val.length > 0);
        this.classList.toggle("too-long", val.length > this.maxLength);
    }
}
```

**Key Features:**
- Return a value to transform the property
- Return `undefined` for side-effects only
- Multiple watchers per property supported
- Receives both old and new values

### @event

Event delegation with selector-based targeting and flexible event sources.

```typescript
@compose("interactive-list")
class InteractiveList extends HTMLElement {
    // Basic event handling
    @event("click", { selector: ".item" })
    handleItemClick(e: Event, target: HTMLElement) {
        console.log("Item clicked:", target.textContent);
    }

    // Multiple selectors
    @event("click", { selector: ".delete-btn, .edit-btn" })
    handleActionButtons(e: Event, target: HTMLButtonElement) {
        if (target.matches(".delete-btn")) {
            this.deleteItem(target);
        } else if (target.matches(".edit-btn")) {
            this.editItem(target);
        }
    }

    // Global events
    @event("resize", { target: () => window })
    handleResize(e: Event) {
        this.updateLayout();
    }

    // Document events
    @event("keydown", { target: () => document })
    handleGlobalKeys(e: KeyboardEvent) {
        if (e.key === "Escape") {
            this.closeModal();
        }
    }
}
```

**Options:**
- `selector` - CSS selector for event delegation
- `target` - Function returning event target (defaults to `this`)

### @debounce / @throttle

Control function execution timing for performance optimization.

- **@debounce**: Delays execution until events stop for the specified time
- **@throttle**: Limits execution to at most once per time period during continuous events

```typescript
@compose("performance-widget")
class PerformanceWidget extends HTMLElement {
    @query(".search-input")
    accessor searchInput!: HTMLInputElement;

    // Debounced search - waits for user to stop typing
    @event("input", { selector: ".search-input" })
    @debounce(300)
    handleSearch(e: Event) {
        const query = (e.target as HTMLInputElement).value;
        this.performSearch(query); // Only fires after 300ms of no typing
    }

    // Throttled resize - fires regularly during continuous resizing
    @event("resize", { target: () => window })
    @throttle(150)
    handleResize() {
        this.updateLayout(); // Fires at most every 150ms during resize
    }

    // Throttled scroll - prevents performance issues
    @event("scroll", { target: () => window })
    @throttle(100)
    handleScroll() {
        this.updateScrollIndicator(); // At most every 100ms
    }
}
```

**When to use:**
- **Debounce**: Search inputs, form validation, expensive operations triggered by user input
- **Throttle**: Scroll handlers, resize handlers, mouse movement, animation callbacks

### @query / @queryAll

Cache DOM element references with automatic memory management using WeakRef.

```typescript
@compose("form-widget")
class FormWidget extends HTMLElement {
    // Single element queries
    @query(".submit-btn")
    accessor submitBtn!: HTMLButtonElement;

    @query(".error-display")
    accessor errorDisplay!: HTMLElement;

    // Multiple element queries
    @queryAll("input, select, textarea")
    accessor formInputs!: NodeListOf<HTMLInputElement>;

    @queryAll(".validation-error")
    accessor errorMessages!: NodeListOf<HTMLElement>;

    // With options
    @query(".shadow-content", { shadow: true, required: true })
    accessor shadowContent!: HTMLElement;

    validateForm() {
        // Use cached references instead of querySelector
        for (const input of this.formInputs) {
            if (!input.checkValidity()) {
                this.errorDisplay.textContent = "Please fix validation errors";
                return false;
            }
        }
        return true;
    }
}
```

**Options:**
- `shadow: boolean` - Query within shadow DOM when available, falls back to light DOM (default: `true`)
- `cache: boolean` - Enable result caching (default: `true`)
- `required: boolean` - Throw error if not found (default: `false`)

**Shadow DOM Behavior:**
- When `shadow: true` (default), queries first check `element.shadowRoot` if it exists
- If no shadow root is found, falls back to querying the element itself (light DOM)
- This allows components to work both with and without shadow DOM
- Queries are performed dynamically when properties are accessed, so shadow DOM can be created after the component is constructed

**Memory Management:**
- Uses WeakRef for automatic garbage collection
- Cache is automatically cleared when elements are removed
- Call `clearQueryCache(element)` to manually clear cache

## API Reference

### Composition System
```typescript
function compose(tagName: string): ClassDecorator
function getComposedDataSpace(metadata: DecoratorMetadataObject): any
```

### Property Reflection
```typescript
function reflect(attribute: string, mapper?: PropertyMapper): PropertyDecorator
function watcher(property: string): MethodDecorator

const Mappers: {
    String: PropertyMapper;
    Number: PropertyMapper;
    Boolean: PropertyMapper;
    JSON: PropertyMapper;
}
```

### Event Handling & Timing
```typescript
function event(type: string, options?: EventDecoratorOptions): MethodDecorator
function debounce(delay: number): MethodDecorator
function throttle(delay: number): MethodDecorator

interface EventDecoratorOptions {
    selector?: string;
    target?: () => EventTarget;
}
```

### DOM Queries
```typescript
function query(selector: string, options?: QueryDecoratorOptions): PropertyDecorator
function queryAll(selector: string, options?: QueryDecoratorOptions): PropertyDecorator
function clearQueryCache(element: HTMLElement): void

interface QueryDecoratorOptions {
    shadow?: boolean;
    cache?: boolean;
    required?: boolean;
}
```

---

## Examples

See the [demos/decorators/](../../demos/decorators/) directory for complete working examples demonstrating all decorator features and patterns.