import { styleSheet } from "@core/util/styleSheet";
import { compose, event, query, queryAll, reflect, slotted, watcher } from "@decorators";
import type { Composed } from "@decorators/compose";

export interface TabView extends Composed<HTMLElement> {}

@compose("tab-view")
export class TabView extends HTMLElement {

    static styles = styleSheet(/*css */`
    `);

    static template = /*html*/`
       <slot name="header"></slot>
        <div part="tabs">
            <slot name="tab"></slot>
        </div>
		<slot></slot>
    `;

    @reflect('active-tab')
    accessor activeTab: string = "";

    @queryAll("button", { cache: false, shadow: false })
    accessor headers!: NodeListOf<Element>;

    @query('slot[name="tab"]')
    accessor tabSlot!: HTMLSlotElement;

    @slotted('tab')
    accessor tabs!: HTMLElement[];

    @query("[slot='header'] [for][active]", { cache: false, shadow: false })
    accessor activeTabHeader!: HTMLElement;

    @slotted('tab', '[name][active]', true)
    accessor activeTabContent!: HTMLElement;

    @slotted('header', '[for]', true)
    accessor headerContainer!: HTMLElement | null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open', delegatesFocus: true });
        this.shadowRoot!.adoptedStyleSheets = [TabView.styles];
        this.shadowRoot!.innerHTML = TabView.template;
    }

    getTheInput(withFor: string) {
        if (!withFor) return null;

        const shallowTarget = this.querySelector(`[slot=header] [for="${withFor}"], [slot=header] [value="${withFor}"]`);
        if (shallowTarget?.tagName === "OPTION") {
            const parent = shallowTarget.parentElement;
            if (!parent) return null;

            if (parent.tagName === "SELECT") {
                return parent as HTMLSelectElement;
            }

            if (parent.tagName === "DATALIST") {
                return this.querySelector(`[slot=header] input[list="${parent.id}"]`) as HTMLInputElement;
            }
        }

        return shallowTarget;
    }

    @watcher('active-tab')
    onTabChange(oldValue: string, newValue: string) {
        const canceled = this.dispatchEvent(new CustomEvent('tab-change', {
            cancelable: true,
            bubbles: true,
            composed: true,
            detail: {
                oldTab: oldValue,
                newTab: newValue
            },
        }));

        if (!canceled) {
            return oldValue;
        }

        const activeTab = this.activeTabContent;
        const activeHeader = this.activeTabHeader;
        const [newHeader, newContent] = this.getPair(newValue);

        if (!newContent) {
            return oldValue;
        }

        activeHeader?.removeAttribute("active")
        newHeader?.setAttribute("active", "");

        activeTab?.removeAttribute("active");
        activeTab?.setAttribute("hidden", "");

        newContent.setAttribute("active", "");
        newContent.removeAttribute("hidden");

        if (newHeader instanceof HTMLInputElement || newHeader instanceof HTMLSelectElement) {
            if (newHeader.getAttribute("type") === "radio") {
                (newHeader as any).checked = true;
            }else if (newHeader.getAttribute("type") === "checkbox") {
                (newHeader as any).checked = true;
                if (activeHeader && activeHeader.getAttribute("type") === "checkbox") {
                    activeHeader.toggleAttribute("checked", false);
                }
            } else {
                newHeader.value = newValue;
            }
        }

    }

    @event('click', { selector: "[slot='header'] [for]" })
    chooseHeader(e: MouseEvent) {
        const target = e.target;
        if (target instanceof Element) {
            this.select(target.getAttribute("for"));
        }
    }

    select(tab: string | number | undefined | null) {
        if (tab === undefined || tab === null) {
            return;
        }

        const tabName = typeof tab === "number" ? this.tabs[tab]?.getAttribute("name") : tab;
        if (tabName) {
            this.activeTab = tabName;
        }
    }

    next(offset: number = 1) {
        this.select((this.getActiveIndex() + offset) % this.tabs.length);
    }

    previous(offset: number = 1) {
        this.select((this.getActiveIndex() - offset + this.tabs.length) % this.tabs.length);
    }

    getActiveIndex() {
        return this.tabs.findIndex(tab => tab.getAttribute("name") === this.activeTab);
    }

    getPair(name: string) {
        return [
            this.getTheInput(name),
            this.querySelector(`[slot=tab][name="${name}"]`)
        ];
    }

    *pairs() {
        for (const tab of this.tabs) {
            const name = tab.getAttribute("name");
            const header = this.getTheInput(name!);
            yield [header as HTMLElement, tab];
        }
    }

    @event('keydown')
    handleKeydown(e: KeyboardEvent) {
        switch (e.key) {
            case "ArrowRight":
            case "ArrowDown":
                this.next();
                e.preventDefault();
                break;
            case "ArrowLeft":
            case "ArrowUp":
                this.previous();
                e.preventDefault();
                break;
        }
    }

    @event('slotchange', { target: (el) => (el as TabView).tabSlot })
    onTabSlotChange(e: Event) {
        this._syncAria();
    }

    @event('input', {
        selector: `[slot=header] [for], [slot = header] select, [slot = header] input,
            select[slot=header], input[slot=header]`
    })
    onInput(e: InputEvent) {
        const target = e.target as HTMLInputElement;
        const list = target.list;
        const value = target.value;

        console.log("Input event:", value, list);
        if (list) {
            const option = Array.from(list.options).find(opt => opt.value === value);
            this.select(option?.getAttribute("for") || option?.value);
        } else {
            this.select(value);
        }
    }


    private _syncAria() {
        for (const [header, tab] of this.pairs()) {
            if (!tab) continue;

            const isActive = tab.getAttribute("name") === this.activeTab;

            if (header) {
                header.role = "tab";
                header.ariaControlsElements = [tab];
                header.ariaSelected = isActive ? "true" : "false";
                header.tabIndex = isActive ? 0 : -1;
                tab.ariaLabelledByElements = [header];
            }

            tab.role = "tabpanel";
            tab.hidden = !isActive;

            header?.toggleAttribute("active", isActive);
            tab.toggleAttribute("active", isActive);

        }
    }

    connectedCallback() {
        if (!this.activeTab && this.activeTabContent) {
            this.select(this.activeTabContent.getAttribute("name"));
        }

        if (!this.activeTab && this.activeTabHeader) {
            this.select(this.activeTabHeader.getAttribute("for"));
        }

        if (!this.activeTab && this.tabs.length > 0) {
            this.select(this.tabs[0].getAttribute("name"));
        }

        this._syncAria();
    }

}