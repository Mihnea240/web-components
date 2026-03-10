import { TickingNode, type BaseNode } from "./baseNode";
import type { TickEvent } from "./signalProvider";
import type { StateMachine } from "./stateMachine";
import type { StateManager } from "./stateManager";

export class HeadPointer {
    public activeNode: BaseNode | null = null;
    public previousNode: BaseNode | null = null;
    public maxNodeTransitions = 32;
    public data = {};

    constructor(
        public stateManager: StateManager,
        public stateMachine: StateMachine
    ) {
    }

    private transitionTo(newState: string, lastState: string | null) {
        if (!this.activeNode || !newState) {
            return null;
        }

        if (newState === "IDLE") {
            this.activeNode.onExit(this);
            return "IDLE";
        }

        if (newState === lastState) {
            // Self-transition: reset lifecycle (exit then re-enter) but stop composition
            this.activeNode.onExit(this);
            this.activeNode.onEnter(this);
            return newState;
        }

        const newNode = this.stateMachine.getNode(newState);
        if (!newNode) {
            console.debug(`State machine "${this.stateMachine.name}" does not have a node named "${newState}".`);
            return null;
        }

        // Exit current node, then enter new node
        const oldNode = this.activeNode;
        oldNode.onExit(this);
        this.previousNode = oldNode;
        this.activeNode = newNode;
        this.activeNode.onEnter(this);
        return newState;
    }

    sendSignal(type: string, event: Event) {
        let transitions = 0;

        while (this.activeNode && transitions < this.maxNodeTransitions) {
            const node = this.activeNode;
            if (!node.filterSignal(type)) {
                break;
            }
            
            const nextState = node.onSignal(type, event, this);
            if (!nextState) {
                break;
            }

            const result = this.transitionTo(nextState, node.name);
            transitions++;

            if (result === "IDLE") return "IDLE";
            if (!result) break; // invalid transition or explicit stop
            if (result === node.name) break; // self-transition: reset but stop composing
            // continue loop so new active node can consume same signal
        }

        return null;
    }

    // Direct tick path for active heads to avoid wake-up side effects from signal routing.
    tick(event: TickEvent) {
        if (!this.activeNode || !(this.activeNode instanceof TickingNode)) {
            return null;
        }
        
        const newState = this.activeNode.onTick(event, this) ?? "";
        return this.transitionTo(newState, this.activeNode.name);
    }
}
