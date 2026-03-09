# Template Generator Demo

This demo shows the three ways `<template-generator>` resolves templates and how to work with dynamic template switching.

## 1. Registry-Based Templates

Register a template descriptor with a name, then reference it by that name:

```typescript
import { TemplateGenerator } from "@components/template-generator";

// Register a template descriptor
TemplateGenerator.registry.register<HTMLElement, UserData>({
  name: "user-card",
  template(data) {
    const card = document.createElement("div");
    card.className = "user-card";
    card.innerHTML = `
      <strong data-name></strong>
      <span data-role></span>
    `;
    return card;
  },
  hydrate(instance, data) {
    if (!instance || !data) return;
    instance.querySelector("[data-name]").textContent = data.name;
    instance.querySelector("[data-role]").textContent = data.role;
  },
  cleanup() {
    // Optional cleanup logic
  },
  defaultData: { name: "Guest", role: "User" }
});

// Use in HTML
<template-generator template="user-card"></template-generator>
```

**Switching templates dynamically:**

```typescript
const gen = document.querySelector("template-generator");
gen.setAttribute("template", "user-card");
gen.hydrate({ name: "Ada", role: "Architect" });

// Later, switch to a different registered template
gen.setAttribute("template", "admin-card");
gen.hydrate({ name: "Bob", role: "Admin" });
```

## 2. Document Template by ID

Reference a `<template>` element in the document by its `id`:

```html
<template id="status-badge">
  <div class="badge">
    <span data-icon>🔵</span>
    <span data-label>Status</span>
  </div>
</template>

<template-generator template="#status-badge"></template-generator>
```

**Option A: Register a descriptor to enable hydrate()**

```typescript
// Register a descriptor using the template attribute value
TemplateGenerator.registry.register({
  name: "#status-badge",
  hydrate(instance, data) {
    if (!instance || !data) return;
    instance.querySelector("[data-icon]").textContent = data.icon;
    instance.querySelector("[data-label]").textContent = data.label;
  }
});

const gen = document.querySelector("template-generator");
gen.hydrate({ icon: "✅", label: "Ready" });
```

**Option B: Manually update the DOM**

```typescript
const gen = document.querySelector("template-generator");
const node = gen.watchedElement;
if (node) {
  node.querySelector("[data-icon]").textContent = "✅";
  node.querySelector("[data-label]").textContent = "Ready";
}
```

## 3. Child Template Element

Place a `<template>` element as a direct child of `<template-generator>`:

```html
<template-generator id="post-gen">
  <template>
    <article class="post">
      <h3 data-title>Loading...</h3>
      <p data-content></p>
    </article>
  </template>
</template-generator>
```

**Option A: Register a descriptor to enable hydrate()**

```typescript
// Register using any name, then set the template attribute to match
TemplateGenerator.registry.register({
  name: "post-card",
  hydrate(instance, data) {
    if (!instance || !data) return;
    instance.querySelector("[data-title]").textContent = data.title;
    instance.querySelector("[data-content]").textContent = data.content;
  }
});

const gen = document.querySelector("#post-gen");
gen.setAttribute("template", "post-card");
gen.hydrate({ title: "Hello", content: "World" });
```

**Option B: Manually update the DOM**

```typescript
const gen = document.querySelector("#post-gen");
const node = gen.watchedElement;
if (node) {
  node.querySelector("[data-title]").textContent = "Hello";
  node.querySelector("[data-content]").textContent = "World";
}
```

## Advanced: Placement Modes

Control where the generated content is inserted:

```html
<!-- Replace component's children (default) -->
<template-generator template="card" placement="childlist"></template-generator>

<!-- Insert before the component -->
<template-generator template="card" placement="before"></template-generator>

<!-- Insert after the component -->
<template-generator template="card" placement="after"></template-generator>
```

## Advanced: Replace vs. Update

Control whether hydration replaces or updates in place:

```typescript
const gen = document.querySelector("template-generator");

// Default: replace=false (updates in place)
gen.hydrate(data1);
gen.hydrate(data2); // Updates the same instance

// With replace=true (creates new instance each time)
gen.replace = true;
gen.hydrate(data1);
gen.hydrate(data2); // Removes old instance, creates new one
```

## Template Resolution Priority

When `<template-generator>` resolves which template to use, it checks in this order:

1. **Child `<template>` element** (detected via slotchange)
2. **`template` attribute starting with `#`** (document template by ID)
3. **`template` attribute without `#`** (registry lookup by name)

## Running This Demo

```bash
npm run demo -- --name=template-generator
```

Open the browser console to see the component behavior and inspect the rendered output.
