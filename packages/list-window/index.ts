import { compose, type Composed } from "@core/decorators/compose";
import { query } from "@decorators/query";
import { shadowRoot, shadowStyle } from "@decorators/shadow";

export interface ListWindow extends Composed<HTMLElement> {}

@compose("list-window")
export class ListWindow extends HTMLElement {
    @shadowRoot()
    accessor root: string = /*html*/`
        <div id="spacer"></div>
        <div id="container"></div>
    `;

    @shadowStyle()
    accessor rootStyle: string = /*css*/`
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

    `;

    @query("#spacer") accessor spacer: HTMLElement = null!;
    @query("#container") accessor container: HTMLElement = null!;
}