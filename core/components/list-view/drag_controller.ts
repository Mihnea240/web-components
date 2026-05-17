import type { ListView } from "./index";

export type DragOverContext = {
    target: HTMLElement;
    index: number;
    rect: DOMRect;
    placement: "before" | "after";
};

export function getDragOverContext(
    target: HTMLElement,
    clientX: number,
    clientY: number,
    directionVertical = !isVerticalDirection(target),
    previousContext: DragOverContext | null = null,
): DragOverContext {
    const rect = previousContext?.target === target ? previousContext.rect : target.getBoundingClientRect();
    const pointerPosition = directionVertical
        ? (clientY - rect.top) / rect.height
        : (clientX - rect.left) / rect.width;

    return {
        target,
        index: Number(target.getAttribute("aria-posinset")),
        rect,
        placement: pointerPosition <= 0.5 ? "before" : "after"
    };
}

function isVerticalDirection(target: HTMLElement) {
    const style = getComputedStyle(target);
    const flexDirection = style.flexDirection;
    return flexDirection === "column" || flexDirection === "column-reverse";
}

export class ListViewDragController {
    private dragOverContext: DragOverContext | null = null;
    private draggedItem: HTMLElement | null = null;
    private lastDropAccepted = false;

    constructor(private host: ListView) { }
    
    get dropStrategy() {
        return this.host.dropStrategy;
    }

    private getDraggingClassTokens() {
        return this.host.dropStrategy?.draggingClass.split(/\s+/).filter(Boolean) ?? ["dragging"];
    }

    private setDraggedItem(item: HTMLElement | null) {
        if (this.draggedItem) {
            this.draggedItem.classList.remove(...this.getDraggingClassTokens());
        }

        this.draggedItem = item;

        if (this.draggedItem) {
            this.draggedItem.classList.add(...this.getDraggingClassTokens());
        }
    }

    private setDragCue(target: Element | null, placement: "before" | "after" | null): void {
        if (!this.dropStrategy) {
            return;
        }

        const hoverTokens = this.dropStrategy.hoverClass.split(/\s+/).filter(Boolean);
        const placementTokens = ["drag-before", "drag-after"];
        const listItems = this.host.querySelectorAll('[role="listitem"]');

        for (const node of listItems) {
            for (const token of hoverTokens) {
                node.classList.remove(token);
            }
            for (const token of placementTokens) {
                node.classList.remove(token);
            }
        }

        if (!target) {
            return;
        }

        for (const token of hoverTokens) {
            target.classList.add(token);
        }

        if (placement) {
            target.classList.add(placement === "before" ? "drag-before" : "drag-after");
        }
    }

    private getDropTarget(event: DragEvent): HTMLElement | null {
        if (!this.dropStrategy) {
            return null;
        }

        const target = event.target as HTMLElement;
        const item = target.closest('[role="listitem"]') as HTMLElement | null;
        if (!item) {
            return null;
        }

        const { dragHandleSelector } = this.dropStrategy;
        if (dragHandleSelector && !target.closest(dragHandleSelector)) {
            return null;
        }

        return item;
    }

    onDragEnter(e: DragEvent) {
        if (!this.host.dropStrategy) {
            return;
        }

        // e.preventDefault();
        const target = this.getDropTarget(e);
        if (!target) {
            return;
        }

        const index = this.host.getInstanceId(target);
        if (index === null) {
            return;
        }

        const context = getDragOverContext(target, e.clientX, e.clientY);
        this.dragOverContext = context;
        this.setDragCue(context.target, context.placement);
        this.host.dropStrategy.onDragEnter(e, this.host);
    }

    onDragStart(e: DragEvent) {
        if (!this.host.dropStrategy) {
            return;
        }

        const target = e.target as HTMLElement;
        const item = target.closest('[role="listitem"]') as HTMLElement | null;
        const itemIndex = item ? this.host.getInstanceId(item) : null;
        if (itemIndex === null) {
            return;
        }

        this.host.dragging = true;
        this.setDraggedItem(item);

        const sourceListId = this.host.id || "list-view";
        this.host.dropStrategy.setPayload(e, sourceListId, itemIndex);
    }

    onDragOver(e: DragEvent) {
        if (!this.host.dropStrategy) {
            return;
        }

        if (this.host.contains(e.target as Node)) {
            e.preventDefault();
            return;
        }

        const target = this.getDropTarget(e);
        if (!target) {
            return;
        }

        const index = this.host.getInstanceId(target);
        if (index === null) {
            return;
        }

        e.preventDefault();

        if (index !== this.dragOverContext?.index) {
            const context = getDragOverContext(target, e.clientX, e.clientY);
            this.dragOverContext = context;
            this.setDragCue(context.target, context.placement);
        }

        this.host.dropStrategy.onDragOver(e, this.host, index);
    }

    onDrop(e: DragEvent) {
        if (!this.host.dropStrategy || !this.host.dropStrategy.supports(e) || !this.host.list) {
            return;
        }

        const target = this.getDropTarget(e);
        const context = target ? this.dragOverContext ?? getDragOverContext(target, e.clientX, e.clientY) : null;
        if (!context) {
            return;
        }

        const index = context.index + (context.placement === "after" ? 0 : -1);
        this.host.dropping = true;
        const data = this.host.dropStrategy.onDrop(e, this.host, index);

        if (!data) {
            this.host.dropping = false;
            return;
        }

        e.preventDefault();
        this.lastDropAccepted = true;
        this.setDragCue(null, null);
        this.host.dropping = false;
    }

    onDragLeave(e: DragEvent) {
        if (!this.host.dropStrategy) {
            return;
        }

        if (!this.host.contains(e.relatedTarget as Node)) {
            this.setDragCue(null, null);
            return;
        }

        this.host.dropStrategy.onDragLeave(e, this.host);
    }

    onDragEnd(e: DragEvent) {
        if (!this.host.dropStrategy) {
            return;
        }

        this.host.dragging = false;
        this.setDraggedItem(null);
        this.host.dropping = false;

        const wasAccepted = this.lastDropAccepted;
        this.lastDropAccepted = false;
        this.dragOverContext = null;

        this.setDragCue(null, null);

        this.host.dropStrategy.onDragEnd(e, this.host, wasAccepted);
    }
}
