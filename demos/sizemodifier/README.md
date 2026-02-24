# Sizemodifier
A drag-to-resize divider that sits between sibling elements and redistributes space between them on drag.

## What it does

- Place it between any siblings inside a common parent container
- Drag to resize neighbors, capped by each element's `min-width`/`min-height` and `max-width`/`max-height`
- Space is strictly conserved — total size of the parent is never exceeded
- **Cascade mode** (default): drag propagates through all siblings on each side until the delta is absorbed
- **Neighbor mode**: only the immediately adjacent sibling on each side participates
- **Trailing divider**: place as the last child and it resizes the preceding sibling into the parent's free space

## API

| Attribute   | Type                              | Default      | Description |
|-------------|-----------------------------------|--------------|-------------|
| `direction` | `"row" \| "column"`               | auto-detected | Resize axis. Auto-detected from parent `flex-direction`. |
| `updates`   | `"width" \| "height" \| "flex-basis"` | auto-detected | Which CSS property is written to siblings. |
| `cascade`   | boolean                           | `true`        | When `false`, only the immediate neighbor on each side resizes. |
| `active`    | boolean                           | `false`       | Set while dragging. Useful for styling. |

`direction` and `updates` are detected automatically from the parent on `pointerdown` — you typically don't need to set them.

## Usage

```html
<!-- horizontal, inside a flex row -->
<div style="display:flex; width:600px; height:300px">
  <div style="flex:1; min-width:80px">Left</div>
  <size-modifier></size-modifier>
  <div style="flex:1; min-width:80px">Middle</div>
  <size-modifier></size-modifier>
  <div style="flex:1; min-width:80px">Right</div>
</div>

<!-- trailing: resize last pane into free space -->
<div style="display:flex; width:600px; height:300px">
  <div style="width:200px; min-width:80px">Pane</div>
  <size-modifier></size-modifier>
</div>

<!-- neighbor only -->
<size-modifier cascade="false"></size-modifier>
```

## Styling

The element is a 6 px bar. Override with CSS:

```css
size-modifier { background: #ddd; }
size-modifier:hover, size-modifier[active] { background: #0078d7; }
```

## Layout notes

### Block / position layouts
Works straightforwardly — writes `width` or `height` directly to siblings.

### Flex layouts
Flex continuously redistributes space among items using float arithmetic, so the rendered pixel sizes of items with `flex: 1` are often fractional. The component auto-detects flex and writes `flex-basis` with `flex-grow: 0; flex-shrink: 1` locked at drag start. 
