import { reflect, watcher, Mappers } from "@core/decorators/reflect";
import { composeElement } from "@core/decorators/compose";
import { event } from "@core/decorators/event";

@composeElement("demo-test")
class DemoTest extends HTMLElement { 
    @reflect("value", Mappers.Number)
    accessor value = 0;

    @watcher("value")
    onValueChange(oldValue: number, newValue: number) {
        console.log(`chamge1 from ${oldValue} to ${newValue}`);
        return newValue % 5;
    }

    @watcher("value")
    logValueChange(oldValue: number, newValue: number) {
        console.log(`change2 ${oldValue} to ${newValue}`);
    }

    constructor() {
        super();
        console.log("DemoTest constructor");
    }

    @event("click")
    handleClick(event: Event) {
        console.log("DemoTest clicked", event);
        this.value++;
    }
}


(window as any).DemoTest = DemoTest;
console.log(DemoTest[Symbol.metadata]);
