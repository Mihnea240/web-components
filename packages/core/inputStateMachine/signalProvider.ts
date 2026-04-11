import type { StateManager } from "./stateManager";

export const enterEvent = new CustomEvent("ENTER");
export const exitEvent = new CustomEvent("EXIT");
export type TickEvent = CustomEvent<{ timestamp: number, deltaTime: number }>;

/**
 * Bridges DOM events and requestAnimationFrame ticks into a StateManager.
 */
export class SignalProvider {
    private registeredSignalTypes = new Set<string>();
    private animationID: number | null = null;
    private tickEvent = new CustomEvent("tick", { detail: { timestamp: 0, deltaTime: 0 } });

    static enterEvent = enterEvent;
    static exitEvent = exitEvent;

    constructor(public readonly stateManager: StateManager) {
        this.tick = this.tick.bind(this);
    }

    /**
     * Starts the RAF tick loop when not already running.
     */
    startTicking() {
        if (this.animationID === null) {
            this.tick();
        }
    }

    /**
     * Stops the RAF tick loop if active.
     */
    stopTicking() {
        if (this.animationID !== null) {
            cancelAnimationFrame(this.animationID);
            this.animationID = null;
        }
    }

    /**
     * Handles a DOM event by forwarding it as an input signal.
     */
    handleEvent(ev: Event) {
        this.stateManager.emitSignal(ev.type, ev);
    }

    private tick() {
        const now = performance.now();
        const deltaTime = now - (this.tickEvent.detail.timestamp || now);

        this.tickEvent.detail.timestamp = now;
        this.tickEvent.detail.deltaTime = deltaTime;

        this.stateManager.tick(this.tickEvent);
        this.animationID = requestAnimationFrame(this.tick);
    }

    /**
     * Syncs window listeners and ticking mode to current machine requirements.
     */
    syncEventListeners(newEvents: Set<string> = this.stateManager.collectSignalTypes()) {
        const oldSignalTypes = this.registeredSignalTypes.difference(newEvents);
        this.registeredSignalTypes = newEvents;

        // Sync DOM event listeners independently
        for (const signalType of oldSignalTypes) {
            window.removeEventListener(signalType, this);
        }

        for (const signalType of newEvents) {
            window.addEventListener(signalType, this);
        }

        // Sync ticking independently based on machine capabilities
        this.syncTickingCapability();
    }

    private syncTickingCapability() {
        const needsTicking = this.stateManager.hasTickingMachines();
        const isTickingActive = this.animationID !== null;

        if (needsTicking && !isTickingActive) {
            this.startTicking();
        } else if (!needsTicking && isTickingActive) {
            this.stopTicking();
        }
    }
}
