import { NodeState, TickingNode, type BaseNode, type NodePort } from "./baseNode";
import type { TickEvent } from "./signalProvider";
import type { StateMachine } from "./stateMachine";
import type { StateManager, TransitionEventType } from "./stateManager";

export class HeadPointer {
    public activeNode: BaseNode | null = null;
    public previousNode: BaseNode | null = null;
    public maxNodeTransitions = 32;
    public data: Record<string, NodeState> = {};

    constructor(
        public stateManager: StateManager,
        public stateMachine: StateMachine
    ) {
    }

    private emitTransitionEvent(fromState: string, toState: string) {
        this.stateManager.handleTransitionEvent(
            `${this.stateMachine.name}:${fromState}->${toState}` as TransitionEventType,
            this,
        );
    }

    private transitionTo(port: NodePort, event: Event, lastState: string | null) {
        if (!this.activeNode || !port?.targetNode) {
            return null;
        }

        const currentNode = this.activeNode;
        const fromState = lastState ?? currentNode.name;
        const newState = port.targetNode;

        if (newState === "IDLE") {
            currentNode.onExit(this);
            this.previousNode = currentNode;
            this.emitTransitionEvent(fromState, newState);
            return "IDLE";
        }

        if (newState === "SUCCESS") {
            currentNode.onExit(this);
            this.previousNode = currentNode;
            this.emitTransitionEvent(fromState, newState);
            return "IDLE";
        }

        if (newState === fromState) {
            // Self-transition: reset lifecycle (exit then re-enter) but stop composition
            currentNode.onExit(this);
            currentNode.onEnter(this);
            this.previousNode = currentNode;
            this.emitTransitionEvent(fromState, newState);
            return newState;
        }

        const newNode = this.stateMachine.getNode(newState);
        if (!newNode) {
            console.debug(`State machine "${this.stateMachine.name}" does not have a node named "${newState}".`);
            return null;
        }

        // Exit current node, then enter new node
        const oldNode = currentNode;
        oldNode.onExit(this);
        this.previousNode = oldNode;
        this.activeNode = newNode;
        this.activeNode.onEnter(this);
        this.emitTransitionEvent(fromState, newState);
        return newState;
    }

    sendSignal(type: string, event: Event) {
        let transitions = 0;

        while (this.activeNode && transitions < this.maxNodeTransitions) {
            const node = this.activeNode;
            if (!node.filterSignal(type)) {
                break;
            }
            
            const nextPort = node.onSignal(type, event, this);
            if (!nextPort) {
                break;
            }

            const result = this.transitionTo(nextPort, event, node.name);
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
        console.log(this.data);
        const port = this.activeNode.onTick(event, this);
        if (!port) {
            return null;
        }
        return this.transitionTo(port, event, this.activeNode.name);
    }
}
