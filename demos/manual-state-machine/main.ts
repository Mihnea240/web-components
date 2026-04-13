import { GateNode } from "@core/inputStateMachine/composedNode";
import { HoldNode, KeyNode, MultipleTapNode, TapNode } from "@core/inputStateMachine/keys";
import { PointerHoldNode, PointerMultipleTapNode, PointerNode, PointerTapNode } from "@core/inputStateMachine/pointer";
import { SignalProvider } from "@core/inputStateMachine/signalProvider";
import { StateMachine } from "@core/inputStateMachine/stateMachine";
import { StateManager } from "@core/inputStateMachine/stateManager";

type GestureFactory = () => {
	machine: StateMachine;
	onSuccess: (data: unknown) => void;
};

type ShortcutHelp = {
	id: string;
	gesture: string;
	description: string;
};

const shortcutHelpRows: ShortcutHelp[] = [
	{ id: "KVTT", gesture: "K, V, T, T", description: "Runs a strict key sequence." },
	{ id: "A_AND_B", gesture: "A + B (within 2s)", description: "Gate succeeds when both keys are pressed in the time window." },
	{ id: "HOLD_H_2S", gesture: "Hold H for 2s, then release", description: "Release-triggered keyboard hold." },
	{ id: "DOUBLE_TAP_D", gesture: "D twice quickly", description: "Detects a fast double tap." },
	{ id: "CHORD_CTRL_SHIFT_K", gesture: "Ctrl+Shift+K", description: "Chord-based keyboard shortcut." },
	{ id: "FAST_V_T", gesture: "V then T in under 200ms each", description: "Very tight timing sequence." },
	{ id: "SEQUENCE_INTO_GATE", gesture: "Q then (A + B)", description: "Sequence that ends in a gate condition." },
	{ id: "POINTER_DOUBLE_CLICK", gesture: "Left mouse double click", description: "Pointer double-click gesture." },
	{ id: "POINTER_HOLD_1S", gesture: "Hold left mouse 1s, then release", description: "Release-triggered pointer hold." },
	{ id: "POINTER_CHORD_HOLD", gesture: "Hold left+right mouse 300ms, then release", description: "Pointer chord hold on release." },
	{ id: "SHIFT_LEFT_CLICK", gesture: "Hold Shift + left click (quick window)", description: "Held modifier + click combo via GateNode." },
	{ id: "ALT_RIGHT_CLICK", gesture: "Hold Alt + right click (quick window)", description: "Held modifier + right click combo." },
	{ id: "CTRL_DOUBLE_CLICK", gesture: "Hold Ctrl + left double click (quick window)", description: "Held modifier plus multi-click combo." },
];

const ShortcutRegistry: Record<string, GestureFactory> = {
	KVTT: () => {
		return {
			machine: new StateMachine("KVTT")
				.addNode(new TapNode("k", { timeout: 1200, strict: true }), { success: "v" })
				.addNode(new TapNode("v", { timeout: 1200, strict: true }), { success: "t1" })
				.addNode(new TapNode("t", { name: "t1", timeout: 1200, strict: true }), { success: "t2" })
				.addNode(new TapNode("t", { name: "t2", timeout: 1200, strict: true })),
			onSuccess: () => console.warn(">>> KVTT SEQUENCE EXECUTED"),
		};
	},

	A_AND_B: () => {
		return {
			machine: new StateMachine("A+B").addNode(
				new GateNode([
					new StateMachine("A").addNode(new TapNode("a", { countsAsActive: true })),
					new StateMachine("B").addNode(new TapNode("b")),
				], { timeWindow: 300 })
			),
			onSuccess: (data) => console.warn(">>> GATE OPENED", data),
		};
	},

	HOLD_H_2S: () => {
		return {
			machine: new StateMachine("Hold_H").addNode(
				new HoldNode("h", 2000, { name: "hold-h", timeout: 3000, triggerOnPress: false })
			),
			onSuccess: () => console.warn(">>> H HELD FOR 2 SECONDS (TRIGGERED ON RELEASE)"),
		};
	},

	DOUBLE_TAP_D: () => {
		return {
			machine: new StateMachine("Double_D").addNode(new MultipleTapNode("d", 2, { name: "double-d", timeout: 500 })),
			onSuccess: () => console.warn(">>> DOUBLE TAP D DETECTED"),
		};
	},

	CHORD_CTRL_SHIFT_K: () => {
		return {
			machine: new StateMachine("Chord_K").addNode(new KeyNode("ctrl+shift+k", { name: "chord-k", triggerOnPress: false, timeout: 1000 })),
			onSuccess: () => console.warn(">>> CTRL+SHIFT+K CHORD DETECTED"),
		};
	},

	FAST_V_T: () => {
		return {
			machine: new StateMachine("Fast_VT")
				.addNode(new TapNode("v", { name: "v-fast", strict: true, timeout: 200 }), { success: "t-fast" })
				.addNode(new TapNode("t", { name: "t-fast", strict: true, timeout: 200 })),
			onSuccess: () => console.warn(">>> FAST V->T SUCCESS (Pro Speed)"),
		};
	},

	SEQUENCE_INTO_GATE: () => {
		return {
			machine: new StateMachine("Q_THEN_AB")
				.addNode(new TapNode("q", { timeout: 1000 }), { success: "A & B" })
				.addNode(
					new GateNode([
						new StateMachine("A").addNode(new TapNode("a")),
						new StateMachine("B").addNode(new TapNode("b")),
					], { timeWindow: 1000 })
				),
			onSuccess: () => console.warn(">>> COMBO: Q followed by A+B Gate!"),
		};
	},

	POINTER_DOUBLE_CLICK: () => {
		return {
			machine: new StateMachine("Pointer_Double_Click").addNode(
				new PointerMultipleTapNode(2, { name: "double-click", pointerType: "mouse", buttons: [0], timeout: 600 })
			),
			onSuccess: () => console.warn(">>> POINTER DOUBLE CLICK DETECTED"),
		};
	},

	POINTER_HOLD_1S: () => {
		return {
			machine: new StateMachine("Pointer_Hold_1s").addNode(
				new PointerHoldNode(1000, { name: "hold-primary", pointerType: "mouse", buttons: [0], timeout: 1500, triggerOnDown: false })
			),
			onSuccess: () => console.warn(">>> POINTER HELD FOR 1 SECOND (TRIGGERED ON RELEASE)"),
		};
	},

	POINTER_CHORD_HOLD: () => {
		return {
			machine: new StateMachine("Pointer_Chord_Hold").addNode(
				new PointerHoldNode(300, {
					name: "hold-left-right",
					pointerType: "mouse",
					buttons: [0, 2],
					buttonMode: "all",
					timeout: 1200,
					triggerOnDown: false,
				})
			),
			onSuccess: () => console.warn(">>> POINTER LEFT+RIGHT CHORD HOLD (TRIGGERED ON RELEASE)"),
		};
	},

	SHIFT_LEFT_CLICK: () => {
		return {
			machine: new StateMachine("Shift_Left_Click").addNode(
				new GateNode([
					new StateMachine("ShiftDown").addNode(new KeyNode("shift", { triggerOnPress: false, countsAsActive: true, timeout: 2000 })),
					new StateMachine("LeftClick").addNode(new PointerNode({ buttons: [0] })),
				], { timeWindow: 300 })
			),
			onSuccess: () => console.warn(">>> SHIFT + LEFT CLICK COMBO"),
		};
	},

	ALT_RIGHT_CLICK: () => {
		return {
			machine: new StateMachine("Alt_Right_Click").addNode(
				new GateNode([
					new StateMachine("AltDown").addNode(new KeyNode("alt", { name: "alt-down", triggerOnPress: false, timeout: 4000 })),
					new StateMachine("RightClick").addNode(new PointerTapNode({ name: "right-click", pointerType: "mouse", buttons: [2], timeout: 2000 })),
				], { timeWindow: 350 })
			),
			onSuccess: () => console.warn(">>> ALT + RIGHT CLICK COMBO"),
		};
	},

	CTRL_DOUBLE_CLICK: () => {
		return {
			machine: new StateMachine("Ctrl_Double_Click").addNode(
				new GateNode([
					new StateMachine("CtrlDown").addNode(new KeyNode("ctrl", {triggerOnPress: false, countsAsActive: true})),
					new StateMachine("DoubleClick").addNode(new PointerMultipleTapNode(2, {buttons: [0], timeout: 2500 })),
				], { timeWindow: 700 })
			),
			onSuccess: () => console.warn(">>> CTRL + DOUBLE CLICK COMBO"),
		};
	},
};

function renderShortcutsTable(rows: ShortcutHelp[]) {
	const body = document.querySelector<HTMLTableSectionElement>("#shortcuts-table tbody");
	if (!body) {
		return;
	}

	body.innerHTML = rows
		.map((row) => `<tr><td>${row.id}</td><td>${row.gesture}</td><td>${row.description}</td></tr>`)
		.join("");
}

const stateManager = new StateManager();
const signalProvider = new SignalProvider(stateManager);
const successCallbacks = new Map<string, (data: unknown) => void>();

Object.entries(ShortcutRegistry).forEach(([, factory]) => {
	const { machine, onSuccess } = factory();
	stateManager.addStateMachine(machine);
	successCallbacks.set(machine.name, onSuccess);
});

stateManager.addTransitionListener((head, event) => {
	if (event.machineName !== "Ctrl_Double_Click") return;
	const eventLabel = `${event.machineName}:${event.fromState}->${event.toState}`;
	console.log(`Transition Event: ${eventLabel} on machine ${head.stateMachine.name}`);
	if (event.machineName === head.stateMachine.name && event.toState === "SUCCESS") {
		successCallbacks.get(head.stateMachine.name)?.(head.data);
	}
});

signalProvider.syncEventListeners();
document.addEventListener("contextmenu", (event) => event.preventDefault());
signalProvider.startTicking();
renderShortcutsTable(shortcutHelpRows);