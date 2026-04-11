import { NodeState, TickingNode, type BaseNode, type NodePort } from "./baseNode";
import type { TickEvent } from "./signalProvider";
import type { StateMachine } from "./stateMachine";
import type { StateManager, TransitionEventType } from "./stateManager";

export class HeadPointer {
    public activeNode: BaseNode | null = null;
    public previousNode: BaseNode | null = null;
    private maxNodeTransitions = 32;
    public data: Record<string, NodeState> = {};

    constructor(
        public stateManager: StateManager,
        public stateMachine: StateMachine
    ) {
    }

    /** @internal Emitted by engine lifecycle transitions only. */
    public emitTransitionEvent(fromState: string, toState: string) {
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

        if (newState === "IDLE" || newState === "SUCCESS") {
            currentNode.onExit(this);
            this.previousNode = currentNode;
            this.emitTransitionEvent(fromState, newState);
            return newState;
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

        if (this.activeNode && transitions < this.maxNodeTransitions) {
            const node = this.activeNode;
            const nextPort = node.onSignal(type, event, this);

            if (!nextPort) {
                return null;
            }

            const result = this.transitionTo(nextPort, event, node.name);
            transitions++;

            if (result === "IDLE" || result === "SUCCESS") return "IDLE";
            if (!result) return null; // invalid transition or explicit stop
            if (result === node.name) return null; // self-transition: reset but stop composing
        }

        return null;
    }

    tick(event: TickEvent) {
        if (!this.activeNode || !(this.activeNode instanceof TickingNode)) {
            return null;
        }
        
        const port = this.activeNode.onTick(event, this);
        if (!port) {
            return null;
        }
        return this.transitionTo(port, event, this.activeNode.name);
    }

    abort() {
        if (!this.activeNode) {
            return;
        }
        this.activeNode.onExit(this);
        const fromState = this.activeNode.name;
        this.activeNode = null;
        this.emitTransitionEvent(fromState, "IDLE");
    }
}
