import { NodeState, TickingNode, type NodePort, type TickingNodeConfig } from "../baseNode";
import type { HeadPointer } from "../headPointer";
import type { TickEvent } from "../signalProvider";

export type PointerKind = "mouse" | "pen" | "touch";
export type PointerButtonMode = "any" | "all";
type PointerLikeEvent = MouseEvent | PointerEvent;

const DEFAULT_POINTER_NODE_OPTIONS = {
    buttons: [0],
    buttonMode: "any" as PointerButtonMode,
    triggerOnPress: true,
    pointerType: "mouse" as PointerKind,
    pressWindow: 500,
    requiredHoldTime: 0,
    requiredPressCount: 1,
} as const;

/**
 * Configuration options for PointerNode.
 */
export type PointerNodeConfig = TickingNodeConfig & {
    /** Custom name for this pointer node. */
    name?: string;
    /** Pointer type filter. If omitted, accepts all pointer types. */
    pointerType?: PointerKind;
    /** Mouse button filters. Common values: 0 primary, 1 middle, 2 secondary, 3 back, 4 forward. @default [0]*/
    buttons?: number[];
    /**
     * Matching behavior for buttons:
     * - any: any configured button can trigger (default)
     * - all: all configured buttons must be down at the same time
     */
    buttonMode?: PointerButtonMode;
    /** Whether to trigger on pointer down (true) or pointer up (false). @default true */
    triggerOnPress?: boolean;
    /** Time window in milliseconds for counting multiple presses. @default 500 */
    pressWindow?: number;
    /** Minimum time in milliseconds the pointer must be held. @default 0 */
    requiredHoldTime?: number;
    /** Number of presses required within pressWindow. @default 1 */
    requiredPressCount?: number;
};

class PointerNodeState extends NodeState {
    public pressCount!: number;
    public heldTime!: number;
    public lastPressTime!: number;
    public currentButtonsMask!: number;
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
        this.currentButtonsMask = 0;
        this.isDown = false;
        this.wasPressed = false;
    }
}

/**
 * Pointer-driven node supporting tap/click, hold, and multi-tap rules.
 */
export class PointerNode extends TickingNode<PointerNodeState> {
    public pointerType?: PointerKind;
    public buttons!: number[];
    public configuredButtonsMask!: number;
    public buttonMode!: PointerButtonMode;
    public triggerOnPress!: boolean;
    public pressWindow!: number;
    public requiredHoldTime!: number;
    public requiredPressCount!: number;

    private static readonly POINTER_BUTTON_MASKS: Record<number, number> = {
        0: 1,  // primary
        1: 4,  // auxiliary (middle)
        2: 2,  // secondary (right)
        3: 8,  // back
        4: 16, // forward
    };

    constructor(config: PointerNodeConfig = {}) {
        const {
            buttons,
            buttonMode,
            triggerOnPress,
            pressWindow,
            requiredHoldTime,
            requiredPressCount,
            pointerType,
            ...baseConfig
        } = { ...DEFAULT_POINTER_NODE_OPTIONS, ...config };
        const normalizedButtons = PointerNode.normalizeButtons(buttons);

        super(baseConfig);

        this.pointerType = pointerType;
        this.buttons = normalizedButtons;
        this.configuredButtonsMask = PointerNode.buttonsToMask(normalizedButtons);
        this.buttonMode = buttonMode;
        this.triggerOnPress = triggerOnPress;
        this.pressWindow = pressWindow;
        this.requiredHoldTime = requiredHoldTime;
        this.requiredPressCount = requiredPressCount;

        this.addFilteredSignal("pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "mousemove");
        this.addCondition(this.localConditions);
    }

    private static normalizeButtons(buttons?: readonly number[]): number[] {
        return [...new Set(buttons ?? [])]
            .filter(value => Number.isInteger(value) && value >= 0 && value <= 4)
            .sort((a, b) => a - b);
    }

    private static buttonToMask(button: number): number {
        return PointerNode.POINTER_BUTTON_MASKS[button] ?? 0;
    }

    private static buttonsToMask(buttons: number[]): number {
        return buttons.reduce((mask, value) => mask | PointerNode.buttonToMask(value), 0);
    }

    private getEventPointerKind(type: string, event: PointerLikeEvent): PointerKind | null {
        if (type.startsWith("mouse")) {
            return "mouse";
        }

        if (type.startsWith("pointer")) {
            return (event as PointerEvent).pointerType as PointerKind;
        }

        return null;
    }

    private isButtonsActive(buttonsMask: number): boolean {
        const active = buttonsMask & this.configuredButtonsMask;
        return this.buttonMode === "any" ? active !== 0 : active === this.configuredButtonsMask;
    }

    private isRelevantButtonSignal(type: string, event: PointerLikeEvent): boolean {
        const kind = this.getEventPointerKind(type, event);

        if (!kind) {
            return false;
        }

        if (this.pointerType && kind !== this.pointerType) {
            return false;
        }

        // Prefer the mouse event family for mouse input to avoid double-processing the same gesture.
        if (kind === "mouse" && type.startsWith("pointer")) {
            return false;
        }

        if (this.buttons.length === 0) {
            return true;
        }

        if (type.endsWith("move")) {
            return this.isButtonsActive(event.buttons);
        }

        const eventButtonMask = PointerNode.buttonToMask(event.button);
        return (this.configuredButtonsMask & eventButtonMask) !== 0;
    }

    private handleButtonSignal(type: string, event: PointerLikeEvent, head: HeadPointer) {
        const state = this.getMetadata(head);
        const now = event.timeStamp;
        const wasDown = state.isDown;
        const nextButtonsMask = event.buttons;
        const nextIsDown = this.isButtonsActive(nextButtonsMask);

        // Only start/reset press tracking when transitioning into the active state.
        if (!wasDown && nextIsDown) {
            if (now - state.lastPressTime > this.pressWindow) {
                state.pressCount = 0;
            }

            state.heldTime = 0;
            state.lastPressTime = now;
            state.pressCount++;
            state.wasPressed = true;
        }

        state.currentButtonsMask = nextButtonsMask;
        state.isDown = nextIsDown;
    }

    override tick(event: TickEvent, head: HeadPointer) {
        const state = this.getMetadata(head);

        if (state.isDown) {
            state.heldTime += event.detail.deltaTime;
        }
    }

    private localConditions(state: PointerNodeState): NodePort | null {
        const { pressCount, heldTime, wasPressed, isDown } = state;

        if (!isDown && wasPressed) {
            if (pressCount >= this.requiredPressCount && heldTime < this.requiredHoldTime) {
                return this.ports.fail;
            }
        }

        if (!this.triggerOnPress && wasPressed && !isDown) {
            if (pressCount >= this.requiredPressCount) {
                return heldTime >= this.requiredHoldTime ? this.ports.success : this.ports.fail;
            }
        }

        if (this.triggerOnPress && isDown) {
            if (pressCount >= this.requiredPressCount && heldTime >= this.requiredHoldTime) {
                return this.ports.success;
            }
        }

        return null;
    }

    override onEnter(head: HeadPointer) {
        this.setMetadata(head, new PointerNodeState(performance.now()));
    }

    override isRelevantSignal(type: string, event: PointerLikeEvent): boolean {
        return this.isRelevantButtonSignal(type, event);
    }

    override isWakeupSignal(type: string, event: PointerLikeEvent): boolean {
        if (!type.endsWith("down")) {
            return false;
        }

        if (!this.isRelevantButtonSignal(type, event)) {
            return false;
        }

        return this.configuredButtonsMask === 0 || (this.configuredButtonsMask & PointerNode.buttonToMask(event.button)) !== 0;
    }

    override isActiveState(head: HeadPointer): boolean {
        const state = this.getMetadata(head);
        return state.isDown && state.pressCount === this.requiredPressCount && state.heldTime >= this.requiredHoldTime;
    }

    override handleSignal(type: string, event: PointerLikeEvent, head: HeadPointer): boolean {
        if (!this.isRelevantButtonSignal(type, event)) {
            return false;
        }

        this.handleButtonSignal(type, event, head);

        return true;
    }
}
