// --- Additional template for swapping ---
TemplateGenerator.registry.define<HTMLElement, RowData>("alt-row", {
	template() {
		const row = document.createElement("div");
		row.className = "row";
		row.innerHTML = `
			<span data-state class="pill"></span>
			<span data-message></span>
			<span style="font-size:11px;color:#888;">ALT TEMPLATE</span>
		`;
		return row;
	},
	hydrate(instance, data) {
		if (!data) return;
		const state = instance.querySelector("[data-state]") as HTMLElement | null;
		const message = instance.querySelector("[data-message]") as HTMLElement | null;
		if (!state || !message) return;
		state.className = `pill ${data.state}`;
		state.textContent = data.state === "ok" ? "ALT OK" : "ALT FAIL";
		message.textContent = data.message;
	}
});

// --- Internally managed instance & template swap demo ---
const managed = document.getElementById("managed-generator") as TemplateGenerator;
const currentTemplate = document.getElementById("current-template")!;
let usingAlt = false;

const demoData: RowData[] = [
	{ state: "ok", message: "Hydrated: All systems go" },
	{ state: "fail", message: "Hydrated: Something went wrong" },
	{ state: "ok", message: "Hydrated: Data updated successfully" },
	{ state: "fail", message: "Hydrated: Network error" }
];
let hydrateIndex = 0;

function updateCurrentTemplateLabel() {
	currentTemplate.textContent = `Current template: ${managed.template}`;
}

document.getElementById("instantiate-default")?.addEventListener("click", () => {
	managed.instantiate({ state: "ok", message: "Default instantiated row" });
	hydrateIndex = 0;
	updateCurrentTemplateLabel();
});

document.getElementById("cycle-hydrate")?.addEventListener("click", () => {
	if (managed.instance) {
		hydrateIndex = (hydrateIndex + 1) % demoData.length;
		managed.hydrate(demoData[hydrateIndex]);
	}
});

document.getElementById("swap-template")?.addEventListener("click", () => {
	usingAlt = !usingAlt;
	managed.template = usingAlt ? "alt-row" : "promise-row";
	updateCurrentTemplateLabel();
});

updateCurrentTemplateLabel();
import "@components/template-generator";
import { TemplateGenerator } from "@components/template-generator";

type RowData = {
	state: "ok" | "fail";
	message: string;
};

TemplateGenerator.registry.define<HTMLElement, RowData>("promise-row", {
	template() {
		const row = document.createElement("div");
		row.className = "row";
		row.innerHTML = `
			<span data-state class="pill"></span>
			<span data-message></span>
		`;
		return row;
	},
	hydrate(instance, data) {
		if (!data) return;

		const state = instance.querySelector("[data-state]") as HTMLElement | null;
		const message = instance.querySelector("[data-message]") as HTMLElement | null;
		if (!state || !message) return;

		state.className = `pill ${data.state}`;
		state.textContent = data.state === "ok" ? "RESOLVED" : "FAILED";
		message.textContent = data.message;
	}
});

const rows = document.querySelector("#rows") as HTMLElement;

function delayedTask(label: string): Promise<RowData> {
	const ms = 250 + Math.floor(Math.random() * 1800);
	const shouldFail = Math.random() < 0.25;

	return new Promise<RowData>((resolve, reject) => {
		setTimeout(() => {
			if (shouldFail) {
				reject(new Error(`${label}: request failed after ${ms}ms`));
			} else {
				resolve({
					state: "ok",
					message: `${label}: loaded in ${ms}ms`
				});
			}
		}, ms);
	}).catch((e: Error) => ({
		state: "fail",
		message: e.message
	}));
}

function createRowGenerator(label: string) {
	const generator = document.createElement("template-generator") as TemplateGenerator;
	generator.setAttribute("template", "promise-row");
	generator.setAttribute("placement", "childlist");

	const lazy = document.createElement("template");
	lazy.setAttribute("slot", "lazy");
	lazy.innerHTML = `
		<div class="row">
			<span class="pill pending"><span class="spinner"></span>PENDING</span>
			<span>${label}: waiting for response...</span>
		</div>
	`;

	generator.appendChild(lazy);
	rows.appendChild(generator);

	generator.spawnAndPlace(delayedTask(label));
}

const generator = document.querySelector<TemplateGenerator>("template-generator")!;

function runBatch() {
    rows.querySelectorAll(":not(template-generator)").forEach(el => el.remove());

	const labels = [
		"Fetch profile",
		"Load preferences",
		"Resolve permissions",
		"Load feature flags",
		"Get recommendations",
		"Fetch notifications"
	];

	// for (const label of labels) {
	// 	createRowGenerator(label);
    // }
    
    for (const label of labels) {
        const promise = delayedTask(label);
        generator.spawnAndPlace(promise);
    }
}

document.querySelector("#run")?.addEventListener("click", runBatch);
document.querySelector("#clear")?.addEventListener("click", () => {
	rows.innerHTML = "";
});

runBatch();
