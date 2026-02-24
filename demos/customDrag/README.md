# CustomDrag

Simple utility to make any element draggable with custom behavior. It provides hooks for drag start, move, and end events, allowing you to implement your own logic for how the element should respond to dragging.
### Example

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    .draggable {
      width: 100px;
      height: 100px;
      background: #007bff;
      position: absolute;
      cursor: move;
      user-select: none;
    }
  </style>
</head>
<body>
  <div id="box" class="draggable">Drag me!</div>
  
  <script type="module">
    import customDrag from './customdrag.js';
    
    const box = document.getElementById('box');
    let startLeft = 0;
    let startTop = 0;
    
    customDrag(box, {
      onstart: (ev) => {
        const rect = box.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        box.style.opacity = '0.7';
        return true;
      },
      onmove: (ev, deltaX, deltaY) => {
		startLeft += deltaX;
		startTop += deltaY;
        box.style.left = startLeft + 'px';
        box.style.top = startTop + 'px';
      },
      onend: (ev) => {
        box.style.opacity = '1';
      }
    });
  </script>
</body>
</html>
```

## API Reference

### `customDrag(target, options)`

Makes an element draggable with custom behavior.

#### Parameters

- **`target`** (`HTMLElement`) - The element to make draggable
- **`options`** (`CustomDragOptions`) - Configuration object

#### Returns

- **`Function`** - Cleanup function to remove all event listeners

### Handlers

**`onstart`** (optional) - Called when drag starts
  - Receives the `PointerEvent` (pointer down)
  - Main function to initialize drag state
  - Return `false` to cancel the drag operation

**`onmove`** (optional) - Called during dragging
  - Receives the `PointerEvent`, `deltaX`, and `deltaY` from start position (pointer move)
  - Main function to update element position, or other behavior

**`onend`** (optional) - Called when drag ends
  - Receives the final `PointerEvent`
  - Clean up any styles or state after dragging