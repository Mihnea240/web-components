import { KeyNode, type KeyNodeConfig } from "./keyNode";

export type TapNodeConfig = Omit<KeyNodeConfig, "triggerOnPress" | "requieredHoldTime" | "requieredPressCount"> & {
    triggerOnPress?: boolean;
};

/**
 * Convenience node for a single tap/click-like key gesture.
 */
export class TapNode extends KeyNode {
    constructor(chord: string, config: TapNodeConfig = {}) {
        super(chord, {
            ...config,
            triggerOnPress: config.triggerOnPress ?? false,
            requieredHoldTime: 0,
            requieredPressCount: 1,
        });
    }
}
