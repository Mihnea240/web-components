import { PointerNode, type PointerNodeConfig } from "./pointerNode";

export type PointerTapNodeConfig = Omit<PointerNodeConfig, "triggerOnDown" | "requiredHoldTime" | "requiredPressCount"> & {
    triggerOnDown?: boolean;
};

/**
 * Convenience node for single pointer tap/click gestures.
 */
export class PointerTapNode extends PointerNode {
    constructor(config: PointerTapNodeConfig = {}) {
        super({
            ...config,
            triggerOnPress: config.triggerOnDown ?? false,
            requiredHoldTime: 0,
            requiredPressCount: 1,
        });
    }
}
