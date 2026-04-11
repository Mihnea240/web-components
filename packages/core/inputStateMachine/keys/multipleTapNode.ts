import { KeyNode, type KeyNodeConfig } from "./keyNode";

export type MultipleTapNodeConfig = Omit<KeyNodeConfig, "requieredHoldTime" | "requieredPressCount"> & {
    triggerOnPress?: boolean;
};

/**
 * Convenience node for repeated taps within a time window.
 */
export class MultipleTapNode extends KeyNode {
    constructor(chord: string, count: number, config: MultipleTapNodeConfig = {}) {
        if (count < 1) {
            throw new Error("MultipleTapNode count must be at least 1");
        }

        super(chord, {
            ...config,
            triggerOnPress: config.triggerOnPress ?? false,
            requieredHoldTime: 0,
            requieredPressCount: count,
        });
    }
}
