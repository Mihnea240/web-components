import { TemplateGenerator } from "@components/template-generator";

import "@components/list-view";
import { ListView } from "@core/components/list-view";
import { DefaultStrategy, MoveStrategy } from "@core/components/list-view/drop_strategy";


TemplateGenerator.registry.define("list-view:custom-demo", {
	template: () => {
		const el = document.createElement("div");
		el.className = "demo-item";
		el.draggable = true;
		el.innerHTML = `
			<span class="circle"></span>
			<strong class="title"></strong>
			<em class="meta"></em>
		`;
		return el;
	},
	hydrate: (node, data) => {
		node.querySelector(".title")!.textContent = `Item ${String(data)}`;
		node.querySelector(".meta")!.textContent = `value ${String(data)}`;
	}
});

const sourceList = document.querySelector("#source-list") as ListView;
const targetList = document.querySelector("#target-list") as ListView;

sourceList.list = Array.from({ length: 8 }, (_, index) => index + 1);
sourceList.size = sourceList.list.length;
sourceList.dropStrategy = new DefaultStrategy();

targetList.list = [100, 101, 102, 103];
targetList.size = targetList.list.length;
targetList.dropStrategy = new MoveStrategy();

