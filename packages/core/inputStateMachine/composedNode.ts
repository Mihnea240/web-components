import { NodeState, TickingNode, type TickingNodeConfig } from "./baseNode";
import type { HeadPointer } from "./headPointer";
import type { TickEvent } from "./signalProvider";
import { StateMachine } from "./stateMachine";
import { StateManager } from "./stateManager";

type GateNodeConfig = TickingNodeConfig & {
    timeWindow?: number;
};

const DEFAULT_GATE_TIME_WINDOW = 300;
const DEFAULT_GATE_OPTIONS = {
    /**
     * Time window in milliseconds for the gate condition to be satisfied after the first machine succeeds.
     */
    timeWindow: 300,
}

class ComposedNodeState extends NodeState {
    public machineTime: Map<string, number> = new Map();
    public hasFailed = false;
    public stateManager: StateManager;
    public hasSucceeded = false;

    constructor(startTime: number, stateMachines?: StateMachine[]) {
        super(startTime);

        this.stateManager = new StateManager();
        for (const sm of stateMachines ?? []) {
            this.stateManager.addStateMachine(sm);
        }

        this.stateManager.addTransitionListener((head, event) => {
            const { machineName, fromState, toState } = event;
            console.log(`Internal transition ${machineName}:${fromState}->${toState}`);

            if (toState === "SUCCESS") {
                this.machineTime.set(machineName, head.data[fromState].currentTime);
            }

            if (toState === "IDLE") {
                // Machine dropped out of its active/success path; clear stale latch immediately.
                this.machineTime.delete(machineName);
                this.hasFailed = true;
            }
        });
    }

    clean() {
        this.machineTime.clear();
        this.hasFailed = false;
        this.hasSucceeded = false;
    }
}

export class GateNode extends TickingNode<ComposedNodeState> {
    private burstTimeout = 0;
    public stateMachines: StateMachine[];

    constructor(stateMachines: StateMachine[], config: GateNodeConfig = {}) {
        const { timeWindow, ...nodeConfig } = { ...DEFAULT_GATE_OPTIONS, ...config };
        super(nodeConfig);

        this.stateMachines = stateMachines;
        this.burstTimeout = timeWindow;

        this.addCondition(this.checkConditions.bind(this));
    }

    protected override defaultName(): string {
        return this.stateMachines.map(sm => sm.name).join(" & ");
    }

    override isWakeupSignal(event: Event): boolean {
        return this.stateMachines.some(sm => sm.isWakeupSignal(event));
    }

    override isRelevantSignal(event: Event, head: HeadPointer): boolean {
        return true;
        const state = this.getMetadata(head);
        const heads = state.stateManager.heads;
        return !heads.size ? true : heads.values().some(head => head.activeNode!.isRelevantSignal(event, head));
    }


    onEnter(head: HeadPointer) {
        this.setMetadata(head, new ComposedNodeState(performance.now(), this.stateMachines));
    }

    onExit(head: HeadPointer): void {
        super.onExit(head);
    }

    private checkConditions(state: ComposedNodeState) {
        if (state.hasFailed) {
            console.log(`GateNode failed: ${state.hasFailed}`);
            return this.ports.fail;
        }

        for (const [machineName, exitTime] of state.machineTime.entries()) {
            if (performance.now() - exitTime > this.burstTimeout) {
                console.log(`GateNode failed: machine ${machineName} exited too long ago (${performance.now() - exitTime}ms)`);
                return this.ports.fail;
            }
        }

        let activeCnt = 0;
        for (const head of state.stateManager.heads) {
            const active = head.activeNode!.isActiveState(head);
            if (active && head.activeNode!.countsAsActive) {
                activeCnt++;
                state.machineTime.set(head.stateMachine.name, performance.now());
            }
        }

        if (state.machineTime.size === this.stateMachines.length) {
            state.clean();
            state.hasSucceeded = true;
            return { targetNode: "REPEAT_SUCCESS" };
        }

        if (state.hasSucceeded && activeCnt === 0 && state.machineTime.size == 0) {
            return this.ports.fail;
        }

        return null;
    }

    override handleSignal(event: Event, head: HeadPointer): boolean {
        this.getMetadata(head).stateManager.emitSignal(event);
        return true;
    }

    override tick(event: TickEvent, head: HeadPointer): void {
        this.getMetadata(head).stateManager.tick(event);
    }

    override isActiveState(head: HeadPointer): boolean {
        return this.getMetadata(head).stateManager.hasActiveHeads();
    }

}