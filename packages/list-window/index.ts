import { reflect, watcher } from "@decorators/reflect"
import { query } from "@decorators/query";
import { composeElement } from "@core/decorators/compose";
import { event } from "@core/decorators/event";
import { raf, microBatch } from "@core/decorators/batch";
import { styleSheet } from "@core/util/styleSheet";

@composeElement("list-window")
export class ListWindow extends HTMLElement {
    static styleSheet = styleSheet(/*css*/`
        :host {
            display: block;
            height: 400px;
            overflow-y: auto;
            border: 1px solid #ccc;
        }
        .spacer {
            width: 1px;
        }
        .item {
            height: var(--item-height, 60px);
            display: flex;
            align-items: center;
            justify-content: center;
            border-bottom: 1px solid #eee;
        }

    `);

    static shadowDom = /*html*/`
        <div id="spacer"></div>
        <div id="container"></div>
    `;

    @query("#spacer") accessor spacer: HTMLElement;
    @query("#container") accessor container: HTMLElement;
}