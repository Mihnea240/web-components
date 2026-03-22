import getOrCompute from "@core/util/getOrCompute";
import { HeadPointer } from "./headPointer";
import type { TickEvent } from "./signalProvider";
import type { StateMachine } from "./stateMachine";

export type TransitionEventType = `${string}:${string}->${string}`;
export type TransitionHandler = (head: HeadPointer, eventType: TransitionEventType) => void;

export class StateManager {
    public readonly stateMachines = new Map<string, StateMachine>();
    private heads = new Set<HeadPointer>();
    private transitionCallbacks = new Map<
        TransitionEventType | "ALL",
        Array<TransitionHandler>
    >();

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

    private wakeStateMachines(type: string, event: Event) {
        for (const stateMachine of this.stateMachines.values()) {
            if (!stateMachine.isWakeupSignal(type, event)) continue;
            if (this.lockedMachines.has(stateMachine.name)) continue;

            this.createHeadPointer(stateMachine.name);
        }
    }

    private handleNewState(head: HeadPointer, newState: string | null) {
        if (newState === "IDLE" || newState === "SUCCESS") {
            this.removeHeadPointer(head);
        }
    }

    addTransitionListener(eventType: TransitionEventType | "ALL", callback: TransitionHandler) {
        getOrCompute(this.transitionCallbacks, eventType, () => []).push(callback);
    }

    removeTransitionCallbacks(eventType: TransitionEventType | "ALL", callback: TransitionHandler) {
        const callbacks = this.transitionCallbacks.get(eventType);
        if (!callbacks) return;

        const index = callbacks.indexOf(callback);
        if (index !== -1) {
            callbacks.splice(index, 1);
        }
    }

    handleTransitionEvent(eventType: TransitionEventType, head: HeadPointer) {
        const callbacks = this.transitionCallbacks.get(eventType);
        const allCallbacks = this.transitionCallbacks.get("ALL");

        allCallbacks?.forEach(callback => callback(head, eventType));
        callbacks?.forEach(callback => callback(head, eventType));
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
            const result = head.sendSignal(type, event)
            this.handleNewState(head, result);
        }
    }

    isWakeupSignal(type: string, event: Event): StateMachine | null {
        return this.stateMachines.values().find(machine => machine.isWakeupSignal(type, event)) ?? null;
    }

    abort(stateMachineName: string | null = null) {
        if (!stateMachineName) {
            this.heads.values().forEach(head => head.abort());
            return;
        }

        this.heads.values().find(head => head.stateMachine?.name === stateMachineName)?.abort();
    }
}
