import { KeyNode } from "@core/inputStateMachine/keyNodes";
import { SignalProvider } from "@core/inputStateMachine/signalProvider";
import { StateMachine } from "@core/inputStateMachine/stateMachine";
import { StateManager } from "../../packages/core/inputStateMachine/stateManager";

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
		fail: { targetNode: "IDLE" },
		abort: { targetNode: "IDLE" },
		idle: { targetNode: "IDLE" },
	})
	.press()
	.timeout(1200); // 1.2s timeout


const stepV = new KeyNode("step-v", "v")
	.setPorts({
		success: { targetNode: "step-t-1" },
		fail: { targetNode: "IDLE" },
		abort: { targetNode: "IDLE" },
		idle: { targetNode: "IDLE" },
	})
	.press()
	.timeout(1200); // 1.2s timeout


const stepT1 = new KeyNode("step-t-1", "t")
	.setPorts({
		success: { targetNode: "step-t-2" },
		fail: { targetNode: "IDLE" },
		abort: { targetNode: "IDLE" },
		idle: { targetNode: "IDLE" },
	})
	.press()
	.timeout(1200); // 1.2s timeout


const stepT2 = new KeyNode("step-t-2", "t")
	.setPorts({
		success: { targetNode: "IDLE" },
		fail: { targetNode: "IDLE" },
		abort: { targetNode: "IDLE" },
		idle: { targetNode: "IDLE" },
	})
	.press()
	.timeout(1200); // 1.2s timeout

machine.rootNode(stepK);
machine.addNode(stepV);
machine.addNode(stepT1);
machine.addNode(stepT2);


const stateManager = new StateManager();
const signalProvider = new SignalProvider(stateManager);
stateManager.addStateMachine(machine);

// Listen for transitions to update UI
stateManager.addTransitionListener("ALL", (head, eventType) => {
	console.log(`Transition event: ${eventType} (active node: ${head.activeNode?.name})`);
	if (eventType.endsWith("->IDLE")) {
		if (eventType.includes("step-t-2")) {
			setStatus("Shortcut SUCCESS! k + v + t + t", "#0f0");
			setTimeout(() => setStatus("Waiting for input...", "#fff"), 1500);
		} else if (eventType.includes("fail") || eventType.includes("abort")) {
			setStatus("Failed or aborted. Try again.", "#f55");
			setTimeout(() => setStatus("Waiting for input...", "#fff"), 1200);
		} else {
			setStatus("Waiting for input...", "#fff");
		}
	} else if (eventType.includes(":step-k->step-v")) {
		setStatus("Step 1/4: k");
	} else if (eventType.includes(":step-v->step-t-1")) {
		setStatus("Step 2/4: v");
	} else if (eventType.includes(":step-t-1->step-t-2")) {
		setStatus("Step 3/4: t");
	}
});

signalProvider.syncEventListeners();
signalProvider.startTicking();

window.addEventListener("beforeunload", () => {
	signalProvider.stopTicking();
});
