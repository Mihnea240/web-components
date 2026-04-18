import { NodeState, TickingNode, type TickingNodeConfig } from "./baseNode";
import type { HeadPointer } from "./headPointer";
import type { TickEvent } from "./signalProvider";
import { StateMachine } from "./stateMachine";
import { StateManager } from "./stateManager";

export type ComposeNodeConfig = TickingNodeConfig & {
    /**
     * Time window in milliseconds for the gate condition to be satisfied after
     * the first machine success or active contribution.
     */
    timeWindow?: number;
    /**
     * If true, child machines must satisfy in the declared order.
     * If false, any order is accepted as long as all machines satisfy.
     */
    enforceOrder?: boolean;
};

const DEFAULT_GATE_OPTIONS = {
    timeWindow: 300,
    enforceOrder: true,
}

class State extends NodeState {
    public satisfiedAt: Map<string, number> = new Map();
    public hasFailed = false;
    public childManager: StateManager;
    public hasEmittedSuccess = false;

    constructor(startTime: number, stateMachines?: StateMachine[]) {
        super(startTime);

        this.childManager = new StateManager();
        for (const sm of stateMachines ?? []) {
            this.childManager.addStateMachine(sm);
        }

        this.childManager.addTransitionListener((head, event) => {
            const { machineName, fromState, toState } = event;
            console.log(`Internal transition ${machineName}:${fromState}->${toState}`);

            if (toState === "SUCCESS") {
                this.satisfiedAt.set(machineName, head.data[fromState].currentTime);
            }

            if (toState === "IDLE") {
                // Machine dropped out of its active/success path; clear stale latch immediately.
                this.satisfiedAt.delete(machineName);
                this.hasFailed = true;
            }
        });
    }

    clean() {
        this.satisfiedAt.clear();
        this.hasFailed = false;
        this.hasEmittedSuccess = false;
    }
}

export class ComposeNode extends TickingNode<State> {
    private satisfactionWindowMs = 0;
    private enforceOrder = true;
    public childMachines: StateMachine[];

    constructor(stateMachines: StateMachine[], config: ComposeNodeConfig = {}) {
        const { timeWindow, enforceOrder, ...nodeConfig } = { ...DEFAULT_GATE_OPTIONS, ...config };
        super(nodeConfig);

        this.childMachines = stateMachines;
        this.satisfactionWindowMs = timeWindow;
        this.enforceOrder = enforceOrder;

        this.addCondition(this.checkConditions.bind(this));
    }

    protected override defaultName(): string {
        return this.childMachines.map(sm => sm.name).join(" & ");
    }

    override isWakeupSignal(event: Event): boolean {
        return this.childMachines.some(sm => sm.isWakeupSignal(event));
    }

    override isRelevantSignal(event: Event, head: HeadPointer): boolean {
        return true;
        const state = this.getMetadata(head);
        const heads = state.childManager.heads;
        return !heads.size ? true : heads.values().some(h => h.activeNode!.isRelevantSignal(event, h));
    }


    onEnter(head: HeadPointer) {
        this.setMetadata(head, new State(performance.now(), this.childMachines));
    }

    onExit(head: HeadPointer): void {
        super.onExit(head);
    }

    private checkConditions(state: State) {
        if (state.hasFailed) {
            console.log(`ComposeNode failed: ${state.hasFailed}`);
            return this.ports.fail;
        }

        for (const [machineName, exitTime] of state.satisfiedAt.entries()) {
            if (performance.now() - exitTime > this.satisfactionWindowMs) {
                console.log(`ComposeNode failed: machine ${machineName} exited too long ago (${performance.now() - exitTime}ms)`);
                return this.ports.fail;
            }
        }

        let activeCnt = 0;
        for (const head of state.childManager.heads) {
            const active = head.activeNode!.isActiveState(head);
            if (active && head.activeNode!.countsAsActive) {
                activeCnt++;
                state.satisfiedAt.set(head.stateMachine.name, performance.now());
            }
        }

        if (this.enforceOrder) {
            let gap = false;
            for (const machine of this.childMachines) {
                if (!state.satisfiedAt.has(machine.name)) {
                    gap = true;
                    continue;
                }
                if (gap) {
                    console.log(`ComposeNode failed: order violation`);
                    return this.ports.fail;
                }
            }
        }

        if (state.satisfiedAt.size === this.childMachines.length) {
            state.clean();
            state.hasEmittedSuccess = true;
            return { targetNode: "REPEAT_SUCCESS" };
        }

        if (state.hasEmittedSuccess && activeCnt === 0 && state.satisfiedAt.size == 0) {
            return this.ports.fail;
        }

        return null;
    }

    override handleSignal(event: Event, head: HeadPointer): boolean {
        this.getMetadata(head).childManager.emitSignal(event);
        return true;
    }

    override tick(event: TickEvent, head: HeadPointer): void {
        this.getMetadata(head).childManager.tick(event);
    }

    override isActiveState(head: HeadPointer): boolean {
        return this.getMetadata(head).childManager.hasActiveHeads();
    }

}
