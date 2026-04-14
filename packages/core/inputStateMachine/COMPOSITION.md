# Input Composition

## BaseNode

`BaseNode` is the shared contract for all input nodes. It defines the common ideas that every node follows:

- a node has a name
- a node can filter the events it cares about
- a node can be strict or permissive about irrelevant input
- a node can participate in a state machine by producing a success or fail path

Philosophically, `BaseNode` is not about a specific gesture. It is about how a gesture is described and evaluated.

In practice, nodes built on `BaseNode` participate in transition events. Those events are the way the system reports movement between states such as idle, active, success, and failure.

Common options:

- `name`: gives the node a stable identity
- `strict`: if `true`, irrelevant events can fail the node instead of being ignored
- `countsAsActive`: if `true`, the node can contribute while it remains in an active state
- `timeout`: for nodes that need a time limit, defines how long they can remain unresolved

## Transition Events

Transition events are the system's feedback layer.

They tell you when a node changes state and are useful for:

- logging
- debugging
- triggering success callbacks
- understanding why a composition completed or failed

For a first look, think of them as the engine's narrative: they show what happened after the node processed input.

## KeyNode

`KeyNode` models keyboard input. It recognizes keys, chords, holds, and repeated presses.

Its job is to answer questions such as:

- Was the right key pressed?
- Was it held long enough?
- Did it happen the required number of times?
- Did the modifier state match the expected chord?

This is the base keyboard recognizer. The more specific keyboard nodes are variations of this idea:

- `TapNode`: a single key action
- `HoldNode`: a key that must stay down for a duration
- `MultipleTapNode`: repeated key presses within a window

Key options:

- `triggerOnPress`: whether success happens on key-down or key-up
- `pressWindow`: the time window for repeated presses
- `requieredHoldTime`: the minimum hold duration before success
- `requieredPressCount`: how many presses are required
- `countsAsActive`: whether the key should contribute while held

Conceptually, `KeyNode` is about intent, not raw keyboard events. A chord like `ctrl+shift+k` is just a keyboard meaning with timing rules attached.

Example:

- `TapNode("k")` means a single key action
- `HoldNode("h")` means the key must stay down long enough to count
- `MultipleTapNode("d", 2)` means the key must be pressed twice within the allowed window

## PointerNode

`PointerNode` models pointer input. It follows the same idea as `KeyNode`, but for pointer-style gestures.

This is a secondary area for now. The core composition model does not depend on pointer-specific behavior being fully settled, so the section should be read as structural rather than final semantics.

Its job is to answer questions such as:

- Which pointer type is this?
- Which buttons are involved?
- Is the pointer still held?
- Did the required click pattern occur?

The more specific pointer nodes are variations of this same model:

- `PointerTapNode`: a single pointer action
- `PointerHoldNode`: a pointer that must remain down for a duration
- `PointerMultipleTapNode`: repeated pointer taps within a window

Pointer options:

- `pointerType`: limits the recognizer to mouse, pen, or touch
- `buttons`: selects which buttons matter
- `buttonMode`: decides whether any matching button is enough or all of them are required
- `triggerOnPress`: whether success happens on pointer-down or pointer-up
- `pressWindow`: the time window for repeated taps
- `requiredHoldTime`: the minimum hold duration before success
- `requiredPressCount`: how many taps are required
- `countsAsActive`: whether the pointer state should contribute while held

Conceptually, `PointerNode` is the pointer-side equivalent of `KeyNode`. It expresses the meaning of pointer input, but the exact pointer semantics are still secondary to the main keyboard and composition work.

Example:

- `PointerTapNode({ buttons: [0] })` means a primary-button tap
- `PointerHoldNode(1000, { buttons: [0] })` means a primary-button hold
- `PointerMultipleTapNode(2, { buttons: [0] })` means two primary-button taps within the allowed window

## ComposeNode

`ComposeNode` combines child machines into one higher-level gesture. It is used when the input meaning depends on relationships between nodes rather than a single node alone.

This is the composition layer for patterns like:

- modifier plus click
- a sequence of gestures
- multiple conditions that must all be satisfied
- a gesture that allows some parts to remain active while others complete

Composition options:

- `timeWindow`: how long a child satisfaction remains valid
- `enforceOrder`: whether the child machines must satisfy in the declared order

Philosophically, `ComposeNode` is about expressing structure:

- use `timeWindow` to control tolerance
- use `enforceOrder` to control whether the input is a sequence or a set
- use `countsAsActive` on child nodes when a held state should contribute continuously

Examples:

- `Shift + click` is usually a parallel composition with no required order
- `Q then A + B` is a sequence followed by a composed requirement

Example:

- `new ComposeNode([ShiftDown, LeftClick], { enforceOrder: false })` means both parts must happen, but not in a fixed order
- `new ComposeNode([Q, AAndB], { enforceOrder: true })` means Q must happen before the composed A/B step

## How To Think About The System

The system is easiest to reason about when each layer has a clear role:

- `BaseNode` defines the common node contract
- `KeyNode` describes keyboard meaning
- `PointerNode` describes pointer meaning
- `ComposeNode` combines meanings into a larger gesture

That separation keeps the code readable and keeps the options tied to intent rather than mechanics.
