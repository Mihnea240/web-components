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

export abstract class BaseNode<T extends NodeState = NodeState, P extends NodeRouter = NodeRouter> {
    protected timeoutValue = Infinity;
    private configuredPorts: P | null;

    constructor(public name: string, ports?: P) {
        this.configuredPorts = ports ?? null;
    }

    get ports(): P {
        if (!this.configuredPorts) {
            throw new Error(`Ports are not configured for node "${this.name}".`);
        }

        return this.configuredPorts;
    }

    setPorts(ports: P): this {
        if (this.configuredPorts) {
            throw new Error(`Ports are already configured for node "${this.name}".`);
        }

        this.configuredPorts = ports;
        return this;
    }

    timeout(ms: number) {
        this.timeoutValue = ms;
        return this;
    }

    static observedSignals: string[] = [];
    abstract handleSignal(type: string, event: Event, head: HeadPointer): NodePort | null;
    abstract checkConditions(state: T): NodePort | null;

    abstract onExit(head: HeadPointer): void;
    onEnter(head: HeadPointer): void { }

    onSignal(type: string, event: Event, head: HeadPointer): NodePort | null {
        return this.handleSignal(type, event, head);
    }

    getMetadata(head: HeadPointer): T {
        return head.data[this.name] as T;
    }

    setMetadata(head: HeadPointer, value: T) {
        head.data[this.name] = value;
    }

    filterSignal(type: string): boolean {
        for (let klass = this.constructor as typeof BaseNode; klass !== BaseNode; klass = Object.getPrototypeOf(klass) as typeof BaseNode) {
            if (klass.observedSignals.includes(type)) {
                return true;
            }
        }

        return false;
    }

    isWakeUpSignal(type: string, event: Event): boolean {
        return this.filterSignal(type);
    }
}

export abstract class TickingNode<
    T extends NodeState = NodeState,
    P extends NodeRouter = NodeRouter
> extends BaseNode<T, P> {

    onEnter(head: HeadPointer): void {
        this.setMetadata(head, new NodeState(performance.now()) as T);
    }

    onTick(event: TickEvent, head: HeadPointer): NodePort | null {
        const state = head.data[this.name];
        if (!state) {
            return null;
        }
        
        state.newTimestamp(event.timeStamp);
        return this.checkConditions(state as T);
    }

    checkConditions(state: T): NodePort | null {
        if (state.normalizedTime >= this.timeoutValue) {
            return this.ports.fail;
        }

        return this.checkLocalConditions(state);
    }

    protected checkLocalConditions(state: T): NodePort | null {
        return null;
    }
}