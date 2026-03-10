import { TickingNode, type BaseNode } from "./baseNode";

export class StateMachine {
    private nodes = new Map<string, BaseNode>();
    public root: BaseNode | null = null;

    public locked = false;

    constructor(public name: string) {

    }

    rootNode(node: BaseNode) {
        this.addNode(node);
        this.root = node;
        return this;
    }

    addNode(node: BaseNode) {
        this.nodes.set(node.name, node);
    }

    getNode(nodeName: string): BaseNode | null {
        return this.nodes.get(nodeName) ?? null;
    }

    isWakeupSignal(type: string, event: Event) {
        return this.root?.isWakeUpSignal(type, event) ?? false;
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
