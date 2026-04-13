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
    public failureReason = "";
    public stateManager: StateManager;
    public lastSuccessTime = 0;

    constructor(startTime: number, stateMachines?: StateMachine[]) {
        super(startTime);

        this.stateManager = new StateManager();
        for (const sm of stateMachines ?? []) {
            this.stateManager.addStateMachine(sm);
        }

        this.stateManager.addTransitionListener("ALL", (head, event) => {
            const { machineName, fromState: fromNode, toState: toNode } = event;
            console.log(`Internal transition ${machineName}:${fromNode}->${toNode}`);

            if (toNode === "SUCCESS") { 
                this.machineTime.set(machineName, head.data[fromNode].currentTime);
            }

            if (toNode === "IDLE") {
                // Machine dropped out of its active/success path; clear stale latch immediately.
                this.machineTime.delete(machineName);
                this.failureReason = `Sub-machine ${machineName} failed before success`;
            }
        });
    }

    clean() {
        this.machineTime.clear();
        this.failureReason = "";
    }
}

export class GateNode extends TickingNode<ComposedNodeState> {
    private burstTimeout = 0;
    public stateMachines: StateMachine[];

    constructor(stateMachines: StateMachine[], config: GateNodeConfig = {}) {
        const { timeWindow, ...nodeConfig } = {...DEFAULT_GATE_OPTIONS, ...config};
        super(nodeConfig);

        this.stateMachines = stateMachines;
        this.burstTimeout = timeWindow;

        this.addCondition(this.checkConditions.bind(this));
    }

    protected override defaultName(): string {
        return this.stateMachines.map(sm => sm.name).join(" & ");
    }

    override isWakeupSignal(type: string, event: Event): boolean {
        return this.stateMachines.some(sm => sm.isWakeupSignal(type, event));
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

    private checkConditions(state: ComposedNodeState) {
        if (state.failureReason) {
            console.log(`GateNode failed: ${state.failureReason}`);
            return this.ports.fail;
        }

        for(const [machineName, exitTime] of state.machineTime.entries()) {
            if (performance.now() - exitTime > this.burstTimeout) {
                console.log(`GateNode failed: machine ${machineName} exited too long ago (${performance.now() - exitTime}ms)`);
                return this.ports.fail;
            }
        }

        let activeCnt = 0;
        for (const head of state.stateManager.getHeads()) {
            const active = head.activeNode!.isActiveState(head);
            if (active && head.activeNode!.countsAsActive) {
                activeCnt++;
                state.machineTime.set(head.stateMachine.name, performance.now());
            }
        }

        if (state.machineTime.size === this.stateMachines.length) {
            state.lastSuccessTime = performance.now();
            state.machineTime.clear();
            return {targetNode: "REPEAT_SUCCESS"};
        }

        if (activeCnt === 0 && state.machineTime.size == 0) {
            return this.ports.fail;
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