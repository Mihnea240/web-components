import { TickingNode } from "./baseNode";
import type { HeadPointer } from "./headPointer";
import type { TickEvent } from "./signalProvider";

export class KeyNode extends TickingNode {
    static observedSignals = ["keydown", "keyup"];
    public keys: string[];

    private triggerOnPress = false;
    private triggerOnRelease = false;
    private requieredHoldTime = 0;
    private requieredPressCount = 1;

    private pressWindow = 100;

    constructor(name: string, chord: string) {
        super(name);

        this.keys = chord.split("+").map(key => key.trim().toLowerCase());
    }

    release() {
        this.triggerOnPress = false;
        this.triggerOnRelease = true;
        return this;
    }

    press() {
        this.triggerOnPress = true;
        this.triggerOnRelease = false;
        return this;
    }

    pressCount(count: number) {
        this.requieredPressCount = count;
        return this;
    }

    requieredHeldTime(ms: number) {
        this.requieredHoldTime = ms;
        return this;
    }

    hold(deltaTime: number) {
        this.requieredHoldTime += deltaTime;
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
        // Ignore auto-repeat events for composition
        if (event.repeat) {
            return null;
        }

        const state = head.data[this.name];
        const now = event.timeStamp;

        // Reset press count if the last press was outside the press window
        if(now - state.lastPressTime > this.pressWindow) {
            state.pressCount = 0;
        }

        state.isDown = true;
        state.lastPressTime = now;
        state.heldTime = 0;

        if (this.triggerOnPress) {
            state.pressCount++;
        } else {
            state.pressCount = 0; // Reset press count if we're not triggering on press
        }

        return this.checkConditions(state);
    }

    handleKeyUp(event: KeyboardEvent, head: HeadPointer) {
        const state = head.data[this.name];
        const now = event.timeStamp;
        
        state.isDown = false;
        state.heldTime = now - state.lastPressTime;
        state.lastReleaseTime = now;

        if (this.triggerOnRelease) {
            state.pressCount++;
        }else{
            state.pressCount = 0; // Reset press count if we're not triggering on release
        }

        const result = this.checkConditions(state);
        state.heldTime = 0; // Reset press count on release
        return result;
    }

    onTick(event: TickEvent, head: HeadPointer) {
        const state = head.data[this.name];
        if (!state) {
            return null;
        }

        if (state.isDown) {
            state.heldTime += event.detail.deltaTime;
        } else {
            state.heldTime = 0;
        }

        return this.checkConditions(state); 
    }

    checkConditions(state: any) {
        if(state.pressCount < this.requieredPressCount || state.heldTime < this.requieredHoldTime) {
            return null;
        }

        if(this.triggerOnPress && !state.isDown) {
            return null;
        }

        if(this.triggerOnRelease && state.isDown) {
            return null;
        }

        return "SUCCESS";
    }

    onEnter(head : HeadPointer) {
        head.data[this.name] = {
            localTime: 0,
            pressCount: 0,
            heldTime: 0,
            lastPressTime: 0,
            lastReleaseTime: 0,
            isDown: false
        }
    }

    onExit(head: HeadPointer) {
        
    }

    isWakeUpSignal(type: string, event: Event): boolean {
        return super.isWakeUpSignal(type, event) && this.isKeyMine(event as KeyboardEvent);
    }
    
    handleSignal(type: string, event: KeyboardEvent, head: HeadPointer, data?: any) {
        if (!this.isKeyMine(event)) {
            return null;
        }

        switch (type) {
            case "keydown":
                return this.handleKeyDown(event, head);
            case "keyup":
                return this.handleKeyUp(event, head);
        }

        return null;
    }
}