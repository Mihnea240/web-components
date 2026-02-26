import customDrag from "@core/util/customDrag";
import "@components/infinite-canvas";
import type { InfiniteCanvas } from "@components/infinite-canvas";

const canvas = document.querySelector("infinite-canvas") as InfiniteCanvas;

for (let i = 0; i < 20; i++) {
    const box = document.createElement("div");
    box.style.left = `${Math.random() * 2000 - 1000}px`;
    box.style.top = `${Math.random() * 2000 - 1000}px`;
    box.innerHTML = `Box ${i + 1}`;
    box.className = "box";
    canvas.appendChild(box);

    customDrag(box, {
        onstart(ev) {
            ev.stopPropagation(); // Prevent canvas from calling setPointerCapture and panning
            return true;
        },
        onmove: (ev, deltaX, deltaY) => {
            box.style.left = `${parseFloat(box.style.left) + deltaX / canvas.scale}px`;
            box.style.top = `${parseFloat(box.style.top) + deltaY / canvas.scale}px`;
            return true;
        }
    });
}