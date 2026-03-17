import { GateNode } from "@core/inputStateMachine/composedNode";
import { KeyNode } from "@core/inputStateMachine/keyNodes";
import { SignalProvider } from "@core/inputStateMachine/signalProvider";
import { StateMachine } from "@core/inputStateMachine/stateMachine";
import { StateManager } from "../../packages/core/inputStateMachine/stateManager";

const stateManager = new StateManager();
const signalProvider = new SignalProvider(stateManager);

// --- GateNode Demo ---
// Two simple key nodes as sub-machines
const gateStateManager = new StateManager();
const keyA = new KeyNode("key-a", "a").press().timeout(2000).strict();
const keyB = new KeyNode("key-b", "b").press().timeout(2000).strict();

const smA = new StateMachine("smA").addNode(keyA).rootNode(keyA);
const smB = new StateMachine("smB").addNode(keyB).rootNode(keyB);
gateStateManager.addStateMachine(smA);
gateStateManager.addStateMachine(smB);

const gateNode = new GateNode("gate", gateStateManager);

// Add the gate node to a new state machine and register it with the main state manager
const gateMachine = new StateMachine("gate-machine").addNode(gateNode).rootNode(gateNode);
stateManager.addStateMachine(gateMachine);

// UI instructions
const gateDiv = document.createElement("div");
gateDiv.style.cssText = "font-family:monospace;padding:1em;margin:1em 0;background:#333;color:#fff;max-width:400px;";
gateDiv.innerHTML = `<b>GateNode Demo</b><br>Press <kbd>a</kbd> and <kbd>b</kbd> (in any order, within 2s each) to succeed.<br><span id='gate-status'>Waiting for input...</span>`;
document.body.appendChild(gateDiv);
const gateStatus = document.getElementById("gate-status");
function setGateStatus(msg, color = "#fff") {
	if (gateStatus) {
		gateStatus.textContent = msg;
		gateStatus.style.color = color;
	}
}

// --- Demo UI setup ---
const statusDiv = document.createElement("div");
statusDiv.style.cssText = "font-family:monospace;padding:1em;margin:1em 0;background:#222;color:#fff;max-width:400px;";
statusDiv.innerHTML = `<b>Manual Shortcut Demo</b><br>Press: <kbd>k</kbd> <kbd>v</kbd> <kbd>t</kbd> <kbd>t</kbd><br><span id='shortcut-status'>Waiting for input...</span>`;
document.body.prepend(statusDiv);
const shortcutStatus = document.getElementById("shortcut-status")!;

function setStatus(msg: string, color = "#fff") {
	shortcutStatus.textContent = msg;
	shortcutStatus.style.color = color;
}


function log(msg: string) {
	setStatus(msg);
	console.log(`[manual-state-machine] ${msg}`);
}


const machine = new StateMachine("manual-shortcut-k-v-t-t");
const stepK = new KeyNode("step-k", "k")
	.setPorts({
		success: { targetNode: "step-v" },
	})
	.press()
	.timeout(1200)
	.strict(); // 1.2s timeout


const stepV = new KeyNode("step-v", "v")
	.setPorts({
		success: { targetNode: "step-t-1" },
	})
	.strict()
	.press()
	.timeout(1200); // 1.2s timeout


const stepT1 = new KeyNode("step-t-1", "t")
	.setPorts({success: { targetNode: "step-t-2" }})
	.press()
	.strict()
	.timeout(1200); // 1.2s timeout


const stepT2 = new KeyNode("step-t-2", "t")
	.setPorts({
		success: { targetNode: "SUCCESS" },
	})
	.strict()
	.release()
	.timeout(1200); // 1.2s timeout

machine.addNode(stepK, stepV, stepT1, stepT2).rootNode(stepK);


stateManager.addStateMachine(machine);

// Listen for transitions to update UI
stateManager.addTransitionListener("ALL", (head, eventType) => {
	console.log(`Transition event: ${eventType} (active node: ${head.activeNode?.name})`);
	setStatus(`Current node: ${head.activeNode?.name || "None"} - Event: ${eventType}`, "#0f0");
});

signalProvider.syncEventListeners();
signalProvider.startTicking();

window.addEventListener("beforeunload", () => {
	signalProvider.stopTicking();
});

// --- Additional KeyNode demo examples ---

// Double-press example (press 'd' twice quickly)
const doubleD = new KeyNode("double-d", "d")
	.press()
	.pressCount(2)
	.timeout(Infinity);

// Hold example (hold 'h' for 1 second)
const holdH = new KeyNode("hold-h", "h")
	.press()
	.requieredHeldTime(1000)
	.timeout(2000);

// Chord example (press 'ctrl+alt+k')
const chordCtrlAltK = new KeyNode("chord-ctrl-alt-k", "ctrl+alt+k")
	.press()
	.timeout(2000);

// --- Refactored: Each gesture is a separate StateMachine ---

// Helper to register a gesture machine and status feedback
function registerGestureMachine(machine: StateMachine, root: KeyNode, label: string, color: string) {
	stateManager.addStateMachine(machine);
	machine.rootNode(root);
	stateManager.addTransitionListener("ALL", (head, eventType) => {
		if (eventType.endsWith(`:${root.name}->IDLE`)) {
			setStatus(label, color);
			setTimeout(() => setStatus("Waiting for input...", "#fff"), 1200);
		}
	});
}

// Main shortcut sequence
const machineMain = new StateMachine("manual-shortcut-k-v-t-t");
machineMain.addNode(stepK, stepV, stepT1, stepT2);
machineMain.rootNode(stepK);
stateManager.addStateMachine(machineMain);

// Double-press D
const doubleDMachine = new StateMachine("double-d-machine");
doubleDMachine.addNode(doubleD);
registerGestureMachine(doubleDMachine, doubleD, "Double-press D detected!", "#0af");

// Hold H
const holdHMachine = new StateMachine("hold-h-machine");
holdHMachine.addNode(holdH);
registerGestureMachine(holdHMachine, holdH, "Held H for 1s!", "#fa0");

// Chord Ctrl+Alt+K
const chordCtrlAltKMachine = new StateMachine("chord-ctrl-alt-k-machine");
chordCtrlAltKMachine.addNode(chordCtrlAltK);
registerGestureMachine(chordCtrlAltKMachine, chordCtrlAltK, "Pressed Ctrl+Alt+K!", "#0ff");

// Remove previous addNode for extra gestures from the main machine
// (machine.addNode(doubleD, holdH, chordCtrlAltK);) // <-- now obsolete

// Remove previous extra transition listener for extra gestures
// (stateManager.addTransitionListener...) // <-- now obsolete
