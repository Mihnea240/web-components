import { TickingNode, type BaseNode } from "./baseNode";

/**
 * Declarative container of nodes and routing for one gesture/state flow.
 */
export class StateMachine {
    private nodes = new Map<string, BaseNode<any, any>>();
    public root!: BaseNode<any, any>;
    private _locked = false;

    constructor(public name: string) {
    }

    /** @internal Locking is reserved for future orchestration internals. */
    get locked() {
        return this._locked;
    }

    /** @internal Locking is reserved for future orchestration internals. */
    toggleLock(state: boolean) {
        this._locked = state;
    }

    /**
     * Adds a node to the machine and optionally overrides its ports.
     * The first added node becomes the root by convention.
     */
    addNode(node: BaseNode<any, any>, ports?: Record<string, string>): this {
        if (this.nodes.has(node.name)) {
            throw new Error(`Node with name ${node.name} already exists in the state machine`);
        }

        if (ports) {
            const normalizedPorts = Object.fromEntries(
                Object.entries(ports).map(([portName, targetNode]) => [
                    portName,
                    { targetNode },
                ])
            );
            node.setPorts(normalizedPorts as any);
        }

        this.nodes.set(node.name, node);

        // Convention: first added node becomes the default root.
        this.root ??= node;

        return this;
    }

    /**
     * Looks up a node by name.
     */
    getNode(nodeName: string): BaseNode<any, any> | null {
        return this.nodes.get(nodeName) ?? null;
    }

    /**
     * Returns true when the root node should awaken for the given signal.
     */
    isWakeupSignal(type: string, event: Event) {
        return this.root?.isWakeupSignal(type, event) ?? false;
    }

    /**
     * Returns true if any node in this machine participates in ticking.
     */
    hasTickingNodes(): boolean {
        return this.nodes.values().some(node => node instanceof TickingNode);
    }

    /**
     * Collects all signal types required by nodes in this machine.
     */
    collectSignalTypes() {
        return new Set(this.nodes.values().flatMap(node => node.getFilteredSignals().values()));
    }
}
