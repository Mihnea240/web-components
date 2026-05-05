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

    /** Returns whether the drag event contains a payload for this strategy's MIME type. */
    supports(event: DragEvent) {
        const dataTransfer = event.dataTransfer;
        return !!dataTransfer && Array.from(dataTransfer.types).includes(this.mimeType);
    }
}