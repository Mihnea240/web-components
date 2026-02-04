# Web Components Decorators

A powerful collection of TypeScript decorators for building modern Web Components with declarative patterns, automatic lifecycle management, and performance optimizations.

## Quick Start

```typescript
import { composeElement } from "@core/decorators/compose";
import { reflect, watcher, Mappers } from "@core/decorators/reflect";
import { event } from "@core/decorators/event";
import { debounce } from "@core/decorators/debounce";
import { query, queryAll } from "@core/decorators/query";

@composeElement("my-counter")
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

## Table of Contents

- [Core Decorators](#core-decorators)
  - [@composeElement](#composeelement)
  - [@reflect](#reflect)
  - [@watcher](#watcher)
  - [@event](#event)
  - [@debounce](#debounce)
  - [@query / @queryAll](#query--queryall)
- [Advanced Usage](#advanced-usage)
- [Performance Features](#performance-features)
- [Best Practices](#best-practices)
- [API Reference](#api-reference)

## Core Decorators

### @composeElement

Registers a custom element and enables the decorator composition system.

```typescript
@composeElement("custom-widget")
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
@composeElement("user-card")
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
@composeElement("validated-input")
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
@composeElement("interactive-list")
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

### @debounce

Delays function execution until after the specified time has elapsed since the last call.

```typescript
@composeElement("search-widget")
class SearchWidget extends HTMLElement {
    @query(".search-input")
    accessor searchInput!: HTMLInputElement;

    // Debounced search
    @event("input", { selector: ".search-input" })
    @debounce(300)
    handleSearch(e: Event) {
        const query = (e.target as HTMLInputElement).value;
        this.performSearch(query);
    }

    // Debounced resize handler
    @event("resize", { target: () => window })
    @debounce(150)
    handleResize() {
        this.updateLayout();
    }
}
```

### @query / @queryAll

Cache DOM element references with automatic memory management using WeakRef.

```typescript
@composeElement("form-widget")
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

## Advanced Usage

### Combining Decorators

Decorators can be combined for powerful declarative patterns:

```typescript
@composeElement("advanced-widget")
class AdvancedWidget extends HTMLElement {
    @reflect("search-term", Mappers.String)
    accessor searchTerm = "";

    @query(".results")
    accessor resultsContainer!: HTMLElement;

    // Combined debounce + event + watcher pattern
    @event("input", { selector: ".search-input" })
    @debounce(300)
    handleSearchInput(e: Event) {
        this.searchTerm = (e.target as HTMLInputElement).value;
    }

    @watcher("searchTerm")
    async performSearch(_old: string, term: string) {
        if (!term.trim()) {
            this.resultsContainer.innerHTML = '<p>Enter a search term</p>';
            return;
        }

        try {
            const results = await this.fetchSearchResults(term);
            this.renderResults(results);
        } catch (error) {
            this.resultsContainer.innerHTML = '<p>Search failed</p>';
        }
    }
}
```

### Custom Event Patterns

```typescript
@composeElement("custom-events")
class CustomEventsWidget extends HTMLElement {
    // Listen to custom events
    @event("item:selected")
    handleItemSelection(e: CustomEvent) {
        console.log("Selected item:", e.detail);
    }

    // Dispatch custom events
    selectItem(itemData: any) {
        this.dispatchEvent(new CustomEvent("item:selected", {
            detail: itemData,
            bubbles: true
        }));
    }

    // Global custom event handling
    @event("app:theme-changed", { target: () => document })
    handleThemeChange(e: CustomEvent) {
        this.updateTheme(e.detail.theme);
    }
}
```

### Dynamic Properties

```typescript
@composeElement("dynamic-config")
class DynamicConfig extends HTMLElement {
    @reflect("config", Mappers.JSON)
    accessor config = {};

    @watcher("config")
    handleConfigChange(_old: any, newConfig: any) {
        // Dynamically apply configuration
        Object.entries(newConfig).forEach(([key, value]) => {
            this.applyConfigValue(key, value);
        });
    }
}
```

## Performance Features

### Automatic Deduplication
The composition system automatically deduplicates lifecycle callbacks, preventing the same function from being registered multiple times.

### WeakRef Memory Management
Query results are stored using WeakRef, allowing garbage collection of removed DOM nodes.

### Event Delegation
Events use delegation patterns, reducing the number of event listeners and improving performance.

### Efficient Lifecycle Wrapping
Instead of wrapping functions multiple times, the system collects callbacks into sets and creates single wrapper functions.

## Examples

See the [demos/decorators/](../../demos/decorators/) directory for complete working examples demonstrating all decorator features and patterns.