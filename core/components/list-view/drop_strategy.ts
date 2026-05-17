import type { ListView } from ".";


export type DropPayload = `${string}:${number}`;

export type DropPayloadData = {
    sourceListId: string;
    itemIndex: number;
};

export type DropInsertion = {
    index: number;
    data: unknown;
} | null;

/**
 * Configures drag-and-drop behavior for a {@link ListView} instance.
 *
 * A strategy controls three parts of the interaction:
 * - how drag payloads are encoded and decoded,
 * - which MIME type identifies the source list,
 * - and how the list should respond during enter, over, drop, and cleanup.
 */
export class DropStrategy {
    /** Optional selector used to narrow drops to a handle or item sub-tree. */
    dragHandleSelector?: string;
    /** MIME type used to isolate drag sources from unrelated drag operations. */
    mimeType = "application/x-list-view-item";
    /** CSS class toggled on valid drop targets while dragging. */
    hoverClass = "drag-over";
    /** CSS class toggled on the dragged item. */
    draggingClass = "dragging";

    /** Called when a drag enters a supported drop target. */
    onDragEnter = (event: DragEvent, listView: ListView) => {};
    /**
     * Called repeatedly while dragging over a supported target.
     *
     * The `dropIndex` is the provisional insertion index derived from the
     * pointer position. It is the index the item would occupy if the drop were
     * committed at that moment, so it may be the current item index or the
     * position immediately after it.
     */
    onDragOver = (event: DragEvent, listView: ListView, dropIndex: number | null) => {};
    /** Called when the pointer leaves a supported drop target. */
    onDragLeave = (event: DragEvent, listView: ListView) => {};
    /**
     * Called when the user drops on a supported target.
     *
     * Return an insertion instruction to let the list add the item at the
     * returned `index`. Return `null` to cancel the insertion.
     */
    onDrop = (event: DragEvent, listView: ListView, dropIndex: number | null): DropInsertion => null;
    /** Called after the drag operation ends, regardless of acceptance. */
    onDragEnd = (event: DragEvent, listView: ListView, wasAccepted: boolean) => {};

    constructor(init: Partial<DropStrategy> = {}) {
        Object.assign(this, init);
    }

    /** Encodes a compact payload containing the source list id and item index. */
    encodePayload(sourceListId: string, itemIndex: number): DropPayload {
        return `${sourceListId}:${itemIndex}`;
    }

    /** Decodes a payload previously created by {@link encodePayload}. */
    decodePayload(payload: string): DropPayloadData | null {
        const separator = payload.lastIndexOf(":");
        if (separator < 0) {
            return null;
        }

        const sourceListId = payload.slice(0, separator);
        const itemIndex = Number(payload.slice(separator + 1));

        if (!sourceListId || !Number.isInteger(itemIndex)) {
            return null;
        }

        return { sourceListId, itemIndex };
    }

    /** Writes the payload into `dataTransfer` using the configured MIME type. */
    setPayload(event: DragEvent, sourceListId: string, itemIndex: number) {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) {
            return;
        }

        dataTransfer.effectAllowed = "move";
        dataTransfer.setData(this.mimeType, this.encodePayload(sourceListId, itemIndex));
    }

    /** Reads and decodes the current drag payload from `dataTransfer`. */
    getPayload(event: DragEvent) {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) {
            return null;
        }

        const payload = dataTransfer.getData(this.mimeType);
        return payload ? this.decodePayload(payload) : null;
    }

        
    supports(event: DragEvent) {
        const dataTransfer = event.dataTransfer;
        return !!dataTransfer && dataTransfer.types.includes(this.mimeType);
    }
}

export class DefaultStrategy extends DropStrategy {
	constructor(init?: Partial<DropStrategy>) {
		super({
			hoverClass: "drag-over drag-default",
			onDrop: (event, listView, dropIndex) => this.performDrop(event, listView, dropIndex),
			...init
		});
	}

	protected performDrop(event: DragEvent, listView: ListView, dropIndex: number | null): DropInsertion {
		const payload = this.getPayload(event);
		if (!payload || dropIndex === null) return null;

		const sourceListView = document.getElementById(payload.sourceListId) as ListView | null;
		const sourceList = sourceListView?.list as any[];
		const targetList = listView.list as any[];

		if (!Array.isArray(sourceList) || !Array.isArray(targetList)) return null;

		const item = sourceList[payload.itemIndex];
		if (item === undefined) return null;

		// Reorder within same list
		if (sourceListView === listView) {
			if (payload.itemIndex < 0 || payload.itemIndex >= sourceList.length || 
			    payload.itemIndex === dropIndex || payload.itemIndex + 1 === dropIndex) {
				return null;
			}

			const targetIndex = payload.itemIndex < dropIndex ? dropIndex - 1 : dropIndex;
			const nextList = sourceList.slice();
			nextList.splice(payload.itemIndex, 1);
			nextList.splice(Math.max(0, targetIndex), 0, item);
			
			sourceListView.list = nextList;
			sourceListView.size = nextList.length;
			return { index: Math.max(0, targetIndex), data: item };
		}

		// Insert into different list
		targetList.splice(Math.max(0, dropIndex), 0, item);
		return { index: Math.max(0, dropIndex), data: item };
	};
}

export class MoveStrategy extends DefaultStrategy {
    protected performDrop(event: DragEvent, listView: ListView, dropIndex: number | null): DropInsertion {
        const insertion = super.performDrop(event, listView, dropIndex);
        const payload = this.getPayload(event);

        console.log("MoveStrategy.performDrop", { insertion, payload });
        if (!insertion || !payload) {
            return null;
        }

        const sourceListView = document.getElementById(payload.sourceListId) as ListView | null;
        const sourceList = sourceListView?.list as any[];

        if (!Array.isArray(sourceList)) {
            return null;
        }

        sourceList.splice(payload.itemIndex, 1);

        return insertion;
    }
}