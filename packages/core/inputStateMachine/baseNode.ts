import type { HeadPointer } from "./headPointer";
import type { TickEvent } from "./signalProvider";



export abstract class BaseNode {
    private transitionsMap = new Map<string, string>();

    constructor(public name: string) {
    }

    bindTransition(port: string, targetNode: string) {
        this.transitionsMap.set(port, targetNode);
    }

    getTransition(port: string): string | null {
        return this.transitionsMap.get(port) ?? null;
    }

    static observedSignals: string[] = [];
    abstract handleSignal(type: string, event: Event, head: HeadPointer): string | null | void | undefined;
    abstract onEnter(head: HeadPointer): void;
    abstract onExit(head: HeadPointer): void;

    protected fireSignal(type: string, event: Event, head: HeadPointer) {
        return this.handleSignal(type, event, head) ?? "";
    }

    onSignal(type: string, event: Event, head: HeadPointer): string | null {
        return this.transitionsMap.get(this.fireSignal(type, event, head)) ?? null;
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

export abstract class TickingNode extends BaseNode {
    abstract onTick(event: TickEvent, head: HeadPointer): string | null | void | undefined;

    fireSignal(type: string, event: Event, head: HeadPointer) {
        if (type === "tick") {
            return this.onTick(event as TickEvent, head) ?? "";
        }

        return super.fireSignal(type, event, head);
    }
}