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

/**
 * Per-node runtime state bag stored on a head pointer.
 */
export abstract class NodeState {
    public normalizedTime = 0;
    public currentTime = 0;
    public exitTime = 0;

    constructor(public startTime = 0) {
        this.currentTime = startTime;
    }

    newTimestamp(timeStamp: number) {
        this.currentTime = timeStamp;
        this.normalizedTime = timeStamp - this.startTime;
    }

    abstract clean(): void;
}

export const DEFAULT_NODE_PORTS: NodeRouter = {
    success: { targetNode: "SUCCESS" },
    fail: { targetNode: "IDLE" },
};

/**
 * Base configuration options for all state machine nodes.
 */
export type BaseNodeConfig = {
    /** Optional explicit node name. If omitted, a default name is generated. */
    name?: string;
    /** If true, the node will fail if no conditions are matched. If false, unmatched states are ignored. @default false */
    strict?: boolean;
};

/**
 * Configuration options for nodes that support timing constraints.
 * Extends BaseNodeConfig with timeout support.
 */
export type TickingNodeConfig = BaseNodeConfig & {
    /** Maximum time in milliseconds allowed to elapse before the node times out and fails. @default Infinity */
    timeout?: number;
};

const DEFAULT_BASE_NODE_CONFIG: Required<Pick<BaseNodeConfig, "strict">> = {
    strict: false,
};

const DEFAULT_TICKING_NODE_CONFIG: Required<Pick<TickingNodeConfig, "timeout">> = {
    timeout: Infinity,
};

/**
 * Base abstraction for all state machine nodes.
 */
export abstract class BaseNode<T extends NodeState = NodeState, P extends NodeRouter = NodeRouter> {
    static observedSignals: string[] = [];

    private _name = "";

    protected ports: P = DEFAULT_NODE_PORTS as any;
    protected strictMode = false;

    private conditions: Array<(state: T) => NodePort | null> = [];
    private filteredSignals = new Set<string>();

    constructor(config: BaseNodeConfig = {}) {
        const options = { ...DEFAULT_BASE_NODE_CONFIG, ...config };
        this.strictMode = options.strict;
    }

    get name() {
        return this._name ||= this.defaultName();
    }

    /**
     * Fallback name generator when no explicit name is provided.
     * Concrete nodes can override this for more descriptive defaults.
     */
    protected defaultName(): string {
        return `node_${Math.random().toString(36).slice(2, 10)}`;
    }

    /**
     * Overrides one or more routing ports for this node.
     */
    setPorts(ports: Partial<P>): this {
        this.ports = { ...this.ports, ...ports };
        return this;
    }

    /**
     * When enabled, irrelevant signals immediately route to fail.
     */
    strict(value = true): this {
        this.strictMode = value;
        return this;
    }

    abstract handleSignal(type: string, event: Event, head: HeadPointer): boolean;
    abstract onExit(head: HeadPointer): void;
    abstract onEnter(head: HeadPointer): void;
    abstract isActiveState(head: HeadPointer): boolean;

    /**
     * Processes a signal and resolves the next transition port, if any.
     */
    onSignal(type: string, event: Event, head: HeadPointer): NodePort | null {
        const mySignal = this.isSignalAllowed(type);
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

    /**
     * Reads this node's metadata from the active head.
     */
    getMetadata(head: HeadPointer): T {
        return head.data[this.name] as T;
    }

    /**
     * Writes this node's metadata to the active head.
     */
    setMetadata(head: HeadPointer, value: T) {
        head.data[this.name] = value;
    }

    protected addCondition(condition: (state: T) => NodePort | null): this {
        this.conditions.push(condition);
        return this;
    }

    clearConditions(): this {
        this.conditions = [];
        return this;
    }

    protected addFilteredSignal(...signalType: string[]): this {
        for (const signal of signalType) 
            this.filteredSignals.add(signal);
        return this;
    }

    protected removeFilteredSignal(...signalType: string[]): this {
        for (const signal of signalType)
            this.filteredSignals.delete(signal);
        return this;
    }

    protected clearFilteredSignals(): this {
        this.filteredSignals.clear();
        return this;
    }

    /**
     * Returns the signal types this node currently listens for.
     */
    getFilteredSignals(): ReadonlySet<string> {
        return this.filteredSignals;
    }

    protected evaluateConditions(state: T): NodePort | null {
        let result: any = null;
        for (const condition of this.conditions) {
            result = condition.call(this, state);
            if (result) {
                break;
            }
        }

        return result;
    }

    protected isSignalAllowed(type: string): boolean {
        return this.filteredSignals.size == 0 ? true: this.filteredSignals.has(type);
    }

    isRelevantSignal(type: string, event: Event): boolean {
        return this.isSignalAllowed(type);
    }

    isWakeupSignal(type: string, event: Event): boolean {
        return this.isSignalAllowed(type);
    }

    /**
     * True when at least one port routes directly to SUCCESS.
     */
    isTerminalNode(): boolean {
        const ports = this.ports;
        for (const portKey in ports) {
            if (ports[portKey].targetNode === "SUCCESS") {
                return true;
            }
        }
        return false;
    }
}

/**
 * Base node with timeout-aware ticking lifecycle.
 */
export abstract class TickingNode<
    T extends NodeState = NodeState,
    P extends NodeRouter = NodeRouter
> extends BaseNode<T, P> {
    private timeoutValue = Infinity;

    constructor(config: TickingNodeConfig = {}) {
        const options = { ...DEFAULT_TICKING_NODE_CONFIG, ...config };
        super(config);
        this.timeoutValue = options.timeout;
        this.addCondition(this.checkTimeout.bind(this));
    }

    /**
     * Fails the node when elapsed node time reaches the given threshold.
     */
    timeout(time: number): this {
        this.timeoutValue = time;
        return this;
    }

    onExit(head: HeadPointer): void {
        const state = this.getMetadata(head);
        state.exitTime = performance.now();
        state.clean();
    }

    abstract tick(event: TickEvent, head: HeadPointer): void;

    /**
     * Runs a tick update and evaluates transition conditions.
     */
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