import { KeyNode } from "@core/inputStateMachine/keyNodes";
import { SignalProvider } from "@core/inputStateMachine/signalProvider";
import { StateMachine } from "@core/inputStateMachine/stateMachine";
import { StateManager } from "../../packages/core/inputStateMachine/stateManager";

function log(msg: string) {
	console.log(`[manual-state-machine] ${msg}`);
}

const machine = new StateMachine("manual-hold-k");
const holdNode = new KeyNode("hold-k", "k").press().requieredHeldTime(500);
holdNode.bindTransition("SUCCESS", "IDLE");
machine.rootNode(holdNode);

const stateManager = new StateManager();
const signalProvider = new SignalProvider(stateManager);
stateManager.addStateMachine(machine);


signalProvider.startTicking();
signalProvider.syncEventListeners();

window.addEventListener("beforeunload", () => {
	signalProvider.stopTicking();
});
