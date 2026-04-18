import { HeadPointer } from "./headPointer";
import type { TickEvent } from "./signalProvider";
import type { StateMachine } from "./stateMachine";

export type TransitionEvent = {
    machineName: string;
    fromState: string;
    toState: string;
};

export type TransitionHandler = (head: HeadPointer, event: TransitionEvent) => void;

/**
 * Runtime coordinator that owns machines, active heads, and transitions.
 */
export class StateManager {
    private readonly stateMachines = new Map<string, StateMachine>();
    public readonly heads = new Set<HeadPointer>();
    private transitionCallbacks: Array<TransitionHandler> = [];

    private lockedMachines = new Set<string>();

    private createHeadPointer(stateMachineName: string): HeadPointer | null {
        const machine = this.getStateMachine(stateMachineName);
        if (!machine) {
            return null;
        }

        const head = new HeadPointer(this, machine);
        head.activeNode = machine.root;
        head.activeNode?.onEnter(head);

        this.heads.add(head);
        this.lockedMachines.add(stateMachineName);

        head.emitTransitionEvent("IDLE", head.activeNode.name);
        return head;
    }

    private removeHeadPointer(head: HeadPointer) {
        this.heads.delete(head);
        this.lockedMachines.delete(head.stateMachine.name);
    }

    private wakeStateMachines(event: Event) {
        const type = event.type;
        for (const stateMachine of this.stateMachines.values()) {
            if (!stateMachine.isWakeupSignal(event)) continue;
            if (this.lockedMachines.has(stateMachine.name)) continue;

            this.createHeadPointer(stateMachine.name);
        }
    }

    private handleNewState(head: HeadPointer, newState: string | null) {
        if (newState === "IDLE" || newState === "SUCCESS") {
            this.removeHeadPointer(head);
        }
    }

    /**
     * Subscribes to all transition events.
     */
    addTransitionListener(callback: TransitionHandler) {
        this.transitionCallbacks.push(callback);
    }

    /**
     * Removes a previously registered transition callback.
     */
    removeTransitionCallbacks(callback: TransitionHandler) {
        const index = this.transitionCallbacks.indexOf(callback);
        if (index !== -1) {
            this.transitionCallbacks.splice(index, 1);
        }
    }

    /**
     * Dispatches a transition event to all listeners.
     */
    handleTransitionEvent(event: TransitionEvent, head: HeadPointer) {
        this.transitionCallbacks.forEach(callback => callback(head, event));
    }

    /**
     * Returns the union of signal types required by all registered machines.
     */
    collectSignalTypes() {
        return new Set(this.stateMachines.values().flatMap(machine => machine.collectSignalTypes()));
    }

    /**
     * Returns true when any active head is currently in an active node state.
     */
    hasActiveHeads(): boolean {
        return this.heads.values().some(head => head.activeNode?.isActiveState(head));

    }

    /**
     * Advances all active heads for one animation-frame tick.
     */
    tick(event: TickEvent) {
        for (const head of this.heads.values()) {
            this.handleNewState(head, head.tick(event));
        }
    }

    /**
     * Registers a machine under its name.
     */
    addStateMachine(machine: StateMachine) {
        this.stateMachines.set(machine.name, machine);
    }

    private getStateMachine(name: string): StateMachine | null {
        return this.stateMachines.get(name) ?? null;
    }

    /**
     * Returns true when at least one registered machine needs ticking.
     */
    hasTickingMachines(): boolean {
        return this.stateMachines.values().some(machine => machine.hasTickingNodes());

    }

    /**
     * Emits a DOM signal into the manager and advances awakened heads.
     */
    emitSignal(event: Event) {
        this.wakeStateMachines(event);

        for (const head of this.heads.values()) {
            const result = head.sendSignal(event)
            this.handleNewState(head, result);
        }
    }

    /** @internal Engine helper; prefer machine-level checks from callers. */
    isWakeupSignal(event: Event): StateMachine | null {
        return this.stateMachines.values().find(machine => machine.isWakeupSignal(event)) ?? null;
    }

    /**
     * Aborts one machine or all machines, forcing active heads to IDLE.
     */
    abort(stateMachineName: string | null = null) {
        if (!stateMachineName) {
            this.heads.forEach(head => head.abort());
            return;
        }

        this.heads.values().find(head => head.stateMachine?.name === stateMachineName)?.abort();
    }
}
