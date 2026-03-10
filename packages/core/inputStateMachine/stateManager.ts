import { HeadPointer } from "./headPointer";
import type { TickEvent } from "./signalProvider";
import type { StateMachine } from "./stateMachine";

export class StateManager {
    private stateMachines = new Map<string, StateMachine>();
    private heads = new Set<HeadPointer>();

    private createHeadPointer(stateMachineName: string): HeadPointer | null {
        const machine = this.getStateMachine(stateMachineName);
        if (!machine) {
            console.debug(`State machine "${stateMachineName}" not found.`);
            return null;
        }

        const head = new HeadPointer(this, machine);
        head.activeNode = machine.root;
        head.activeNode?.onEnter(head);

        this.heads.add(head);
        machine.toggleLock(true);
        return head;
    }

    private removeHeadPointer(head: HeadPointer) {
        this.heads.delete(head);
        head.stateMachine.toggleLock(false);
    }

    private wakeStateMachines(type: string, event: Event) {
        for (const stateMachine of this.stateMachines.values()) {
            if (stateMachine.locked || !stateMachine.isWakeupSignal(type, event)) continue;

            this.createHeadPointer(stateMachine.name);
        }
    }

    private handleNewState(head: HeadPointer, newState: string | null) {
        if (newState === "IDLE") {
            this.removeHeadPointer(head);
        }
    }


    collectSignalTypes() {
        return new Set(this.stateMachines.values().flatMap(machine => machine.collectSignalTypes()));
    }

    tick(event: TickEvent) {
        for (const head of this.heads.values()) {
            this.handleNewState(head, head.tick(event));
        }
    }

    addStateMachine(machine: StateMachine) {
        this.stateMachines.set(machine.name, machine);
    }

    getStateMachine(name: string): StateMachine | null {
        return this.stateMachines.get(name) ?? null;
    }

    getHeads() {
        return this.heads.values();
    }

    hasTickingMachines(): boolean {
        return this.stateMachines.values().some(machine => machine.hasTickingNodes());

    }

    emitSignal(type: string, event: Event) {
        this.wakeStateMachines(type, event);

        for (const head of this.heads.values()) {
            this.handleNewState(head, head.sendSignal(type, event));
        }
    }
}
