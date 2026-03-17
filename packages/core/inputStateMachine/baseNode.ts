import type { HeadPointer } from "./headPointer";
import type { TickEvent } from "./signalProvider";

export type NodePort = {
    targetNode: string;
    // sideEffect?: (event: Event, head: HeadPointer) => void;
}

export type NodeRouter = {
    fail: NodePort;
    success: NodePort;
    [portName: string]: NodePort;
}

export class NodeState {
    public normalizedTime = 0;
    constructor(public startTime = 0) {
    }

    newTimestamp(timeStamp: number) {
        this.normalizedTime = timeStamp - this.startTime;
    }
}

const defaultPorts: NodeRouter = {
    success: { targetNode: "SUCCESS" },
    fail: { targetNode: "IDLE" },
};

export abstract class BaseNode<T extends NodeState = NodeState, P extends NodeRouter = NodeRouter> {
    static observedSignals: string[] = [];

    public ports: P = defaultPorts as any;
    private conditions: Array<(state: T) => NodePort | null> = [];
    public strictMode = false;
    constructor(public name: string) {
    }

    setPorts(ports: Partial<P>): this {
        this.ports = {...this.ports, ...ports};
        return this;
    }

    strict(value = true): this {
        this.strictMode = value;
        return this;
    }

    abstract handleSignal(type: string, event: Event, head: HeadPointer): boolean;
    abstract onExit(head: HeadPointer): void;
    abstract onEnter(head: HeadPointer): void;

    onSignal(type: string, event: Event, head: HeadPointer): NodePort | null {
        const mySignal = this.filterSignal(type);
        if (!mySignal) {
            return null;
        }

        const relevantSignal = this.isRelevantSignal(type, event);
        if (this.strictMode && !relevantSignal) {
            return this.ports.fail;
        }

        if (relevantSignal && this.handleSignal(type, event, head)) {
            return this.evaluateConditions(this.getMetadata(head));
        }

        return null;
    }

    getMetadata(head: HeadPointer): T {
        return head.data[this.name] as T;
    }

    setMetadata(head: HeadPointer, value: T) {
        head.data[this.name] = value;
    }

    addCondition(condition: (state: T) => NodePort | null): this {
        this.conditions.push(condition);
        return this;
    }

    clearConditions(): this {
        this.conditions = [];
        return this;
    }

    evaluateConditions(state: T): NodePort | null {
        let result: any = null;
        for (const condition of this.conditions) {
            result = condition.call(this, state);
            if (result) {
                break;
            }
        }

        return result;
    }

    filterSignal(type: string): boolean {
        let found = false;
        for (let klass = this.constructor as typeof BaseNode; klass !== BaseNode; klass = Object.getPrototypeOf(klass) as typeof BaseNode) {
            if(!klass.observedSignals || klass.observedSignals.length === 0) {
                continue;
            }
            found = true;
            if (klass.observedSignals.includes(type)) {
                return true;
            }
        }

        return !found; // If no observedSignals defined in the hierarchy, consider all signals relevant
    }

    isRelevantSignal(type: string, event: Event): boolean {
        return this.filterSignal(type);
    }

    isWakeupSignal(type: string, event: Event): boolean {
        return this.filterSignal(type);
    }
}

export abstract class TickingNode<
    T extends NodeState = NodeState,
    P extends NodeRouter = NodeRouter
> extends BaseNode<T, P> {
    private timeoutValue = Infinity;

    constructor(name: string) {
        super(name);
        this.addCondition(this.checkTimeout);
    }

    timeout(time: number): this {
        this.timeoutValue = time;
        return this;
    }

    onEnter(head: HeadPointer): void {
        this.setMetadata(head, new NodeState(performance.now()) as T);
    }

    abstract tick(event: TickEvent, head: HeadPointer): void;
    onTick(event: TickEvent, head: HeadPointer) {
        const state = this.getMetadata(head);
        state.newTimestamp(event.detail.timestamp);
        this.tick(event, head);
        return this.evaluateConditions(state);
    }

    private checkTimeout(state: T) {
        if (state.normalizedTime >= this.timeoutValue) {
            return this.ports.fail;
        }

        return null;
    }
}