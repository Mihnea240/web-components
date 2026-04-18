import { PointerNode, type PointerNodeConfig } from "./pointerNode";

export type PointerHoldNodeConfig = Omit<PointerNodeConfig, "requiredHoldTime" | "triggerOnDown"> & {
    triggerOnDown?: boolean;
};

/**
 * Convenience node for pointer hold gestures.
 */
export class PointerHoldNode extends PointerNode {
    constructor(holdTime: number, config: PointerHoldNodeConfig = {}) {
        if (holdTime < 0) {
            throw new Error("PointerHoldNode holdTime must be non-negative");
        }

        super({
            ...config,
            triggerOnPress: config.triggerOnDown ?? true,
            requiredHoldTime: holdTime,
        });
    }
}
