import { TickingNode, type BaseNode } from "./baseNode";

export class StateMachine {
    private nodes = new Map<string, BaseNode<any, any>>();
    public root!: BaseNode<any, any>;

    public locked = false;

    constructor(public name: string) {

    }


    rootNode(node: BaseNode<any, any>) {
        this.root = node;
        return this;
    }

    addNode(...nodes: BaseNode<any, any>[]): this {
        for (const node of nodes) {
            if (this.nodes.has(node.name)) {
                throw new Error(`Node with name ${node.name} already exists in the state machine`);
            }
            this.nodes.set(node.name, node);
        }
        return this;
    }

    getNode(nodeName: string): BaseNode<any, any> | null {
        return this.nodes.get(nodeName) ?? null;
    }

    isWakeupSignal(type: string, event: Event) {
        return this.root?.isWakeupSignal(type, event) ?? false;
    }

    hasTickingNodes(): boolean {
        return this.nodes.values().some(node => node instanceof TickingNode);
    }

    toggleLock(value: boolean = !this.locked) {
        this.locked = value;
    }

    collectSignalTypes() {
        return new Set(this.nodes.values().flatMap(node => (node.constructor as typeof BaseNode).observedSignals));
    }
}
