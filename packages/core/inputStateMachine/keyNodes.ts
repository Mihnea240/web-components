import { NodeState, TickingNode, type NodePort } from "./baseNode";
import type { HeadPointer } from "./headPointer";
import type { TickEvent } from "./signalProvider";

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

export class KeyNode extends TickingNode<KeyNodeState> {
    static observedSignals = ["keydown", "keyup"];
    public keys: string[];

    private triggerOnPress = true;
    private requieredHoldTime = 0;
    private requieredPressCount = 1;

    private pressWindow = 1000;

    constructor(name: string, chord: string) {
        super(name);

        this.keys = chord.split("+").map(key => key.trim().toLowerCase());
        this.addCondition(this.loacalConditions);
    }

    release(): this {
        this.triggerOnPress = false;
        return this;
    }

    press() : this {
        this.triggerOnPress = true;
        return this;
    }

    pressCount(count: number) : this {
        this.requieredPressCount = count;
        return this;
    }

    requieredHeldTime(ms: number): this {
        this.requieredHoldTime = ms;
        return this;
    }

    isKeyMine(event: KeyboardEvent) {
        const shift = event.shiftKey ? "shift" : "";
        const ctrl = event.ctrlKey ? "ctrl" : "";
        const alt = event.altKey ? "alt" : "";
        const meta = event.metaKey ? "meta" : "";

        return this.keys.every(key => key === shift || key === ctrl || key === alt || key === meta || key === event.key.toLowerCase());
    }

    handleKeyDown(event: KeyboardEvent, head: HeadPointer) {
        const state = this.getMetadata(head);
        const now = event.timeStamp;

        // Reset press count if the last press was outside the press window
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

    handleKeyUp(event: KeyboardEvent, head: HeadPointer) {
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

        if(!state.isDown) {
            return false;
        }

        return (state.pressCount === this.requieredPressCount && state.heldTime >= this.requieredHoldTime);
    }

    override handleSignal(type: string, event: KeyboardEvent, head: HeadPointer, data?: any) {
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