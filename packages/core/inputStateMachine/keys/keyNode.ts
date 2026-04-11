import { NodeState, TickingNode, type NodePort, type TickingNodeConfig } from "../baseNode";
import type { HeadPointer } from "../headPointer";
import type { TickEvent } from "../signalProvider";

/**
 * Configuration options for KeyNode.
 * Extends TickingNodeConfig with keyboard-specific settings.
 */
export type KeyNodeConfig = TickingNodeConfig & {
    /** Custom name for this keyboard node. Defaults to normalized chord string. */
    name?: string;
    /** Whether to trigger on key press (true) or key release (false). @default true */
    triggerOnPress?: boolean;
    /** Time window in milliseconds for counting multiple presses. @default 1000 */
    pressWindow?: number;
    /** Minimum time in milliseconds the key must be held to trigger. @default 0 */
    requieredHoldTime?: number;
    /** Number of times key must be pressed within pressWindow to trigger. @default 1 */
    requieredPressCount?: number;
};

class KeyNodeState extends NodeState {
    public pressCount!: number;
    public heldTime!: number;
    public lastPressTime!: number;
    public lastReleaseTime!: number;
    public isDown!: boolean;
    public wasPressed!: boolean;

    constructor(startTime: number) {
        super(startTime);
        this.clean();
    }

    clean() {
        this.pressCount = 0;
        this.heldTime = 0;
        this.lastPressTime = 0;
        this.lastReleaseTime = 0;
        this.isDown = false;
        this.wasPressed = false;
    }
}

/**
 * Keyboard-driven node supporting press/release, holds, and multi-press rules.
 */
export class KeyNode extends TickingNode<KeyNodeState> {
    private static readonly MODIFIER_MASK = {
        shift: 1,
        ctrl: 2,
        alt: 4,
        meta: 8,
    } as const;

    private readonly chord: string;
    private readonly requiredModifierMask: number;
    private readonly requiredModifierKeys: Set<string>;
    private readonly requiredNonModifierKeys: Set<string>;

    public triggerOnPress = true;
    public pressWindow = 1000;
    public requieredHoldTime = 0;
    public requieredPressCount = 1;

    private static readonly DEFAULT_KEY_NODE_OPTIONS = {
        triggerOnPress: true,
        pressWindow: 1000,
        requieredHoldTime: 0,
        requieredPressCount: 1,
    } as const;

    constructor(
        chord: string,
        config: KeyNodeConfig = {}
    ) {
        const options = { ...KeyNode.DEFAULT_KEY_NODE_OPTIONS, ...config };
        const {
            triggerOnPress,
            pressWindow,
            requieredHoldTime,
            requieredPressCount,
            ...baseConfig
        } = options;

        super(baseConfig);

        this.chord = chord;
        const parsedTokens = chord
            .split("+")
            .map(token => KeyNode.normalizeKeyToken(token));

        let modifierMask = 0;
        const modifierKeys = new Set<string>();
        const nonModifierKeys = new Set<string>();

        for (const token of parsedTokens) {
            if (token in KeyNode.MODIFIER_MASK) {
                modifierMask |= KeyNode.MODIFIER_MASK[token as keyof typeof KeyNode.MODIFIER_MASK];
                modifierKeys.add(token);
            } else {
                nonModifierKeys.add(token);
            }
        }

        this.requiredModifierMask = modifierMask;
        this.requiredModifierKeys = modifierKeys;
        this.requiredNonModifierKeys = nonModifierKeys;
        this.triggerOnPress = triggerOnPress;
        this.pressWindow = pressWindow;
        this.requieredHoldTime = requieredHoldTime;
        this.requieredPressCount = requieredPressCount;

        this.addFilteredSignal("keydown", "keyup");
        this.addCondition(this.loacalConditions);
    }

    private static normalizeKeyToken(token: string): string {
        const value = token.trim().toLowerCase();

        switch (value) {
            case "control":
                return "ctrl";
            case "option":
                return "alt";
            case "cmd":
            case "command":
                return "meta";
            default:
                return value;
        }
    }

    private static getEventModifierMask(event: KeyboardEvent): number {
        return (event.shiftKey ? KeyNode.MODIFIER_MASK.shift : 0)
            | (event.ctrlKey ? KeyNode.MODIFIER_MASK.ctrl : 0)
            | (event.altKey ? KeyNode.MODIFIER_MASK.alt : 0)
            | (event.metaKey ? KeyNode.MODIFIER_MASK.meta : 0);
    }

    private isKeyMine(event: KeyboardEvent) {
        const normalizedKey = KeyNode.normalizeKeyToken(event.key);
        const eventModifierMask = KeyNode.getEventModifierMask(event);

        // Require all configured modifier keys to be active.
        if ((eventModifierMask & this.requiredModifierMask) !== this.requiredModifierMask) {
            return false;
        }

        if (this.requiredNonModifierKeys.size > 0) {
            return this.requiredNonModifierKeys.has(normalizedKey);
        }

        // Modifier-only chords trigger when one of the configured modifiers emits the key event.
        return this.requiredModifierKeys.has(normalizedKey);
    }

    private handleKeyDown(event: KeyboardEvent, head: HeadPointer) {
        const state = this.getMetadata(head);
        const now = event.timeStamp;

        if (now - state.lastPressTime > this.pressWindow) {
            state.pressCount = 0;
        }

        if (!state.isDown) {
            state.heldTime = 0;
        }

        state.wasPressed = true;
        state.isDown = true;
        state.lastPressTime = now;
        state.pressCount++;
    }

    private handleKeyUp(event: KeyboardEvent, head: HeadPointer) {
        const state = this.getMetadata(head);
        const now = event.timeStamp;

        state.isDown = false;
        state.lastReleaseTime = now;
    }

    override tick(event: TickEvent, head: HeadPointer) {
        const state = this.getMetadata(head);

        if (state.isDown) {
            state.heldTime += event.detail.deltaTime;
        }
    }

    private loacalConditions(state: KeyNodeState): NodePort | null {
        const { pressCount, heldTime, wasPressed, isDown } = state;

        if (!isDown && wasPressed) {
            if (pressCount >= this.requieredPressCount && heldTime < this.requieredHoldTime) {
                return this.ports.fail;
            }
        }

        if (!this.triggerOnPress && wasPressed && !isDown) {
            if (pressCount >= this.requieredPressCount && heldTime < this.requieredHoldTime) {
                return this.ports.fail;
            }
            if (pressCount >= this.requieredPressCount && heldTime >= this.requieredHoldTime) {
                return this.ports.success;
            }
        }

        if (this.triggerOnPress && isDown) {
            if (pressCount >= this.requieredPressCount && heldTime >= this.requieredHoldTime) {
                return this.ports.success;
            }
        }

        return null;
    }

    override onEnter(head: HeadPointer) {
        this.setMetadata(head, new KeyNodeState(performance.now()));
    }

    override isRelevantSignal(type: string, event: KeyboardEvent): boolean {
        if (event.repeat) {
            return false;
        }

        const valid = this.isKeyMine(event);

        if (type === "keydown" && this.strictMode) {
            return valid;
        }

        return true;
    }

    override isWakeupSignal(type: string, event: KeyboardEvent): boolean {
        if (event.repeat) {
            return false;
        }

        if (type !== "keydown") {
            return false;
        }
        return this.isKeyMine(event as KeyboardEvent);
    }

    isActiveState(head: HeadPointer): boolean {
        const state = this.getMetadata(head);

        if (!state.isDown) {
            return false;
        }

        return state.pressCount === this.requieredPressCount && state.heldTime >= this.requieredHoldTime;
    }

    override handleSignal(type: string, event: KeyboardEvent, head: HeadPointer) {
        if (!this.isKeyMine(event)) {
            return false;
        }

        switch (type) {
            case "keydown":
                this.handleKeyDown(event, head);
                break;
            case "keyup":
                this.handleKeyUp(event, head);
                break;
        }

        return true;
    }
}
