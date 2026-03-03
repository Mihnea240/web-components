import "@components/listview";
import { ListView } from "@components/listview";

function work() {
    const list = document.querySelector("#list") as ListView;
    console.log(list);
    
    list.init({
        template() {
            return document.createElement("div");
        },
        load(node: HTMLElement, value: any, index: number) {
            node.textContent = `Data ${String(value)}`;
        }
    });
    
    list.list = Array.from({ length: 30 }, (_, index) => index + 1);
}

work();
// await setTimeout(work, 12);

