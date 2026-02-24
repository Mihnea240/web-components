/**
 * Adds custom drag behavior to a target element.
 * @param {HTMLElement} target - The element to attach drag events to.
 * @param {Object} options - Configuration object for drag callbacks.
 * @param {Function} [options.onstart] - Called when drag starts. Receives the pointer event. Return false to cancel drag.
 * @param {Function} [options.onmove] - Called during dragging. Receives the pointer event, deltaX, and deltaY.
 * @param {Function} [options.onend] - Called when drag ends. Receives the pointer event.
 * @returns {Function} Cleanup function to remove the drag handlers.
 */
export default function customDrag(target, {
	onstart = ev => true,
	onmove = (ev, deltaX, deltaY) => true,
	onend = ev => true
}) {
	
	let posX = 0, posY = 0;
	let deltaX = 0, deltaY = 0;

	let moveHandle = (ev) => {
		ev.preventDefault();
		deltaX = ev.clientX - posX;
		deltaY = ev.clientY - posY;
		posX = ev.clientX;
		posY = ev.clientY;

		onmove(ev, deltaX, deltaY);
	}

	let pressHandle = (ev) => {
		posX = ev.clientX;
		posY = ev.clientY;

		if (!onstart(ev)) return;

		document.addEventListener("pointermove", moveHandle);
		document.addEventListener("pointerup", (ev) => {
			onend(ev);
			document.removeEventListener("pointermove", moveHandle);
		}, { once: true, capture: true });
	}

	target.addEventListener("pointerdown", pressHandle);

	return ()=> {
		target.removeEventListener("pointerdown", pressHandle);
		document.removeEventListener("pointermove", moveHandle);
		document.removeEventListener("pointerup", onend);
	}
}