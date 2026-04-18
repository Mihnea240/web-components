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
