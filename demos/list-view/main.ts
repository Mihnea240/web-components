import { TemplateGenerator } from "@components/template-generator";

import "@components/list-view";
import { ListView } from "@core/components/list-view";
import { DropStrategy } from "@core/components/list-view/drop_strategy";


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

class DefaultStrategy extends DropStrategy {
	override hoverClass = "drag-over drag-default";

	override onDrop = (event: DragEvent, listView: ListView, dropIndex: number | null) => {
		const payload = this.getPayload(event);
		if (!payload || dropIndex === null) {
			return null;
		}

		const sourceListView = document.getElementById(payload.sourceListId) as ListView | null;
		const sourceList = sourceListView?.list;
		const targetList = listView.list;

		if (!Array.isArray(sourceList) || !Array.isArray(targetList)) {
			return null;
		}

		const item = sourceList[payload.itemIndex];
		if (item === undefined) {
			return null;
		}

		if (sourceListView === listView) {
			const fromIndex = payload.itemIndex;
			if (fromIndex < 0 || fromIndex >= sourceList.length || fromIndex === dropIndex || fromIndex + 1 === dropIndex) {
				return null;
			}

			const targetIndex = fromIndex < dropIndex ? dropIndex - 1 : dropIndex;
			const nextList = sourceList.slice();
			nextList.splice(fromIndex, 1);
			nextList.splice(Math.max(0, targetIndex), 0, item);
			sourceListView.list = nextList;
			sourceListView.size = nextList.length;
		} else {
			targetList.splice(Math.max(0, dropIndex), 0, item);
		}

		return { index: Math.max(0, dropIndex), data: item };
	};
}

const sourceList = document.querySelector("#source-list") as ListView;
const targetList = document.querySelector("#target-list") as ListView;

sourceList.list = Array.from({ length: 8 }, (_, index) => index + 1);
sourceList.size = sourceList.list.length;
sourceList.dropStrategy = new DefaultStrategy();

targetList.list = [100, 101, 102, 103];
targetList.size = targetList.list.length;
targetList.dropStrategy = new DefaultStrategy();

