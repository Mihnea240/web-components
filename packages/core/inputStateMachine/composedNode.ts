import { NodeState, TickingNode, type NodePort } from "./baseNode";
import type { HeadPointer } from "./headPointer";
import type { TickEvent } from "./signalProvider";
import type { StateManager } from "./stateManager";

class ComposedNodeState extends NodeState {
    public data: Map<string, boolean> = new Map();
    public started = false;
    public trueCount = 0;
    public falseCount = 0;
    constructor(startTime: number) {
        super(startTime);
    }
}

export class GateNode extends TickingNode<ComposedNodeState> {

    constructor(name: string, public stateManager: StateManager) {
        super(name);

        stateManager.addTransitionListener("ALL", this.transitionListener.bind(this));
        this.addCondition(this.checkConditions.bind(this));
    }


    override isWakeupSignal(type: string, event: Event): boolean {
        const wakeupMachine = this.stateManager.isWakeUpSignal(type, event);
        return wakeupMachine?.root?.isRelevantSignal(type, event) ?? false;
    }

    /**
     * Only process signals that are relevant to any root node in the stateManager's state machines.
     */
    override isRelevantSignal(type: string, event: Event): boolean {
        // return this.stateManager.getHeads().some(head => head.activeNode?.isRelevantSignal(type, event) ?? false);
        return true;
    }


    onEnter(head: HeadPointer) {
        this.setMetadata(head, new ComposedNodeState(performance.now()));
    }

    onExit(head: HeadPointer): void {

    }

    transitionListener(head: HeadPointer, eventType: string) {
        console.log(`Transition event: ${eventType} for node ${this.name}`);
        const [state_machine, from, to] = eventType.split(":->");
        const state = this.getMetadata(head);

        if (to === "SUCCESS") {
            state.data.set(state_machine, true);
            state.started = true;
            state.trueCount++;
        } else if (to === "IDLE") {
            state.data.set(state_machine, false);
            state.trueCount--;
            state.falseCount++;
        }
    }

    checkConditions(state: ComposedNodeState): NodePort | null {
        if (!state.started) {
            return null;
        }
        if(state.trueCount === state.data.size) {
            return this.ports.success;
        }

        if(state.trueCount < state.data.size || state.falseCount > 0) {
            return this.ports.fail;
        }

        return null;
    }

    override handleSignal(type: string, event: Event, head: HeadPointer): boolean {
        this.stateManager.emitSignal(type, event);

        return true;
    }

    override tick(event: TickEvent, head: HeadPointer): void {
        this.stateManager.tick(event);
    }

}