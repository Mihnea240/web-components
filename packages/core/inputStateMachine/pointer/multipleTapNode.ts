import { PointerNode, type PointerNodeConfig } from "./pointerNode";

export type PointerMultipleTapNodeConfig = Omit<PointerNodeConfig, "requiredHoldTime" | "requiredPressCount"> & {
    triggerOnDown?: boolean;
};

/**
 * Convenience node for repeated pointer taps/clicks.
 */
export class PointerMultipleTapNode extends PointerNode {
    constructor(count: number, config: PointerMultipleTapNodeConfig = {}) {
        if (count < 1) {
            throw new Error("PointerMultipleTapNode count must be at least 1");
        }

        super({
            ...config,
            triggerOnPress: config.triggerOnPress ?? false,
            requiredHoldTime: 0,
            requiredPressCount: count,
        });
    }
}
