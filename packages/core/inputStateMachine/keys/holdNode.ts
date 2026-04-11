import { KeyNode, type KeyNodeConfig } from "./keyNode";

export type HoldNodeConfig = Omit<KeyNodeConfig, "requieredHoldTime" | "triggerOnPress"> & {
    triggerOnPress?: boolean;
};

/**
 * Convenience node for hold gestures.
 */
export class HoldNode extends KeyNode {
    constructor(chord: string, holdTime: number, config: HoldNodeConfig = {}) {
        if (holdTime < 0) {
            throw new Error("HoldNode holdTime must be non-negative");
        }

        super(chord, {
            ...config,
            triggerOnPress: config.triggerOnPress ?? true,
            requieredHoldTime: holdTime,
        });
    }
}
