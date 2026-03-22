import { NodeState, TickingNode } from "./baseNode";
import type { HeadPointer } from "./headPointer";
import type { TickEvent } from "./signalProvider";
import { StateMachine } from "./stateMachine";
import { StateManager } from "./stateManager";

class ComposedNodeState extends NodeState {
    public data: Map<string, number> = new Map();
    public started = false;
    public stateManager: StateManager;

    constructor(startTime: number, stateMachines?: StateMachine[]) {
        super(startTime);

        this.stateManager = new StateManager();
        for (const sm of stateMachines ?? []) {
            this.stateManager.addStateMachine(sm);
        }

        this.stateManager.addTransitionListener("ALL", (head, eventType) => {
            const [machineName, fromNode, toNode] = eventType.split(":->");
            console.log(`Internal transition ${eventType}`);

            if (this.started && this.data.has(machineName)) {
                //Invalidate on machine reawake
            }

            if (toNode === "SUCCESS") {
                this.data.set(machineName, head[fromNode].exitTime);
                this.started = true;
            }
        });
    }

    clean() {
        this.data.clear();
        this.started = false;
    }
}

export class GateNode extends TickingNode<ComposedNodeState> {
    private burstTimeout = 0;

    constructor(name: string, public stateMachines: StateMachine[]) {
        super(name);

        this.addCondition(this.checkConditions.bind(this));
    }

    timeWindow(ms: number): this {
        this.burstTimeout = ms;
        return this;
    }

    override isWakeupSignal(type: string, event: Event): boolean {
        for (const sm of this.stateMachines) {
            if (sm.isWakeupSignal(type, event)) {
                return sm.root?.isWakeupSignal(type, event) ?? false;
            }
        }

        return false;
    }

    override isRelevantSignal(type: string, event: Event): boolean {
        return true;
    }


    onEnter(head: HeadPointer) {
        this.setMetadata(head, new ComposedNodeState(performance.now(), this.stateMachines));
    }

    onExit(head: HeadPointer): void {
        super.onExit(head);
    }

    checkConditions(state: ComposedNodeState) {
        const stateMachines = this.stateMachines;
        const heads = state.stateManager.getHeads();

        for (const head of heads) {
            const { activeNode, stateMachine } = head;
            const machineName = stateMachine.name;

            if (!activeNode) {
                continue;
            }
            const active = activeNode.isActiveState(head);
            
            if (!active && state.data.has(machineName) && state.currentTime - state.data.get(machineName)! > this.burstTimeout) {
                state.stateManager.abort();
                return this.ports.fail;
            }

            if (active) {
                state.started = true;
                state.data.set(head.stateMachine.name, activeNode.getMetadata(head).currentTime);
            }
        }

        if (!state.started) {
            return null;
        }

        let count = 0;
        for (const [machineName, time] of state.data) {
            if (state.currentTime - time > this.burstTimeout) {
                state.stateManager.abort();
                return this.ports.fail;
            }

            count++;
        }

        if (count === stateMachines.length) {
            state.stateManager.abort();
            return this.ports.success;
        }

        return null;
    }

    override handleSignal(type: string, event: Event, head: HeadPointer): boolean {
        this.getMetadata(head).stateManager.emitSignal(type, event);
        return true;
    }

    override tick(event: TickEvent, head: HeadPointer): void {
        this.getMetadata(head).stateManager.tick(event);
    }

    override isActiveState(head: HeadPointer): boolean {
        throw new Error("Method not implemented.");
    }

}