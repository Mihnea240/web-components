import { NodeState, TickingNode, type NodePort } from "./baseNode";
import type { HeadPointer } from "./headPointer";
import type { TickEvent } from "./signalProvider";
import type { StateManager } from "./stateManager";

class ComposedNodeState extends NodeState {
    public data: Record<string, any> = {};
    constructor(startTime: number) {
        super(startTime);
    }
}

export class ComposedNode extends TickingNode<ComposedNodeState> {
    constructor(name: string, public stateManager: StateManager) {
        super(name);

        stateManager.addTransitionListener("ALL", (head, eventType) => {
            if (eventType.endsWith("SUCCESS")) {
                const state = this.getMetadata(head);
                if (!state) {
                    return;
                }

                state.data[head.activeNode!.name] = head.data[head.activeNode!.name];
            }
        });
    }


    onEnter(head: HeadPointer) {
        this.setMetadata(head, new ComposedNodeState(performance.now()));
    }

    onExit(head: HeadPointer): void {
        
    } 

    handleSignal(type: string, event: Event, head: HeadPointer): NodePort | null {
        this.stateManager.emitSignal(type, event);
        const state = this.getMetadata(head);
        if (!state) {
            return null;
        }

        return this.checkLocalConditions(state);
    }

    onTick(event: TickEvent, head: HeadPointer): NodePort | null {
        const state = this.getMetadata(head);
        if (!state) {
            return null;
        }

        this.stateManager.tick(event);
        return this.checkLocalConditions(state);
    }

    protected checkLocalConditions(state: ComposedNodeState): NodePort | null {
        const heads = this.stateManager.getHeads();
        
        return null;
    }


}