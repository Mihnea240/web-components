import { styleSheet } from "@core/util/styleSheet";
import { ComposedDecoratorManager, type Composed, type Constructor } from "@decorators/compose";

class ShadowRegistry extends ComposedDecoratorManager<HTMLElement, never> {
    static symbol = Symbol("ShadowRegistry");

    constructor(
        public styleSheets: CSSStyleSheet[] = [],
        public shadowHtml: string | null = null,
        public shadowRootInit: ShadowRootInit | null = null,
    ) {
        super();
    }

    static collectSheets(constructor: Constructor<HTMLElement>) {
        const sheets: CSSStyleSheet[] = [];
        for (let klass = constructor; klass !== HTMLElement; klass = Object.getPrototypeOf(klass).constructor) {
            const metadata = klass[Symbol.metadata];
            if (!metadata) continue;
            
            const registry = ShadowRegistry.getManager(metadata);
            if (registry) {
                sheets.unshift(...registry.styleSheets);
            }
        }

        return sheets;
    }

    static constructorInitializer(this: Composed<HTMLElement>) {
        const metadata = this.constructor[Symbol.metadata];
        if (!metadata) {
            throw new Error("No metadata found for this component. Make sure to use @compose on the class.");
        }

        const registry = ShadowRegistry.getManager(metadata);

        if (!this.shadowRoot && registry.shadowRootInit) {
            this.attachShadow(registry.shadowRootInit);
            this.shadowRoot!.innerHTML = registry.shadowHtml ?? "";
        }

        if (registry.styleSheets.length > 0) {
            this.shadowRoot!.adoptedStyleSheets = ShadowRegistry.collectSheets(this.constructor);
        }
    }

    static shadowStyle<T extends Composed<HTMLElement>>(
        value: ClassAccessorDecoratorResult<T, string>,
        context: ClassAccessorDecoratorContext<T>,
        cssText: string
    ) {
        if (!cssText) return;
        const registry = this.getManager(context.metadata);
        const sheet = styleSheet(cssText);
        registry.styleSheets.push(sheet);

        registry.addHook("constructor", this.constructorInitializer);
    }

    static shadowRoot<T extends Composed<HTMLElement>>(
        value: ClassAccessorDecoratorResult<T, string>,
        context: ClassAccessorDecoratorContext<T>,
        shadowHtml: string,
        init: ShadowRootInit
    ) {
        const registry = this.getManager(context.metadata);
        registry.shadowRootInit = init;
        registry.shadowHtml = shadowHtml;

        registry.addHook("constructor", this.constructorInitializer);
    }
}

export function shadowRoot(shadowRootInit: ShadowRootInit) {
    return function <T extends Composed<HTMLElement>>(
        value: ClassAccessorDecoratorResult<T, string>,
        context: ClassAccessorDecoratorContext<T, string>
    ) {
        if (!context.static) {
            throw new Error("@shadowRoot can only be used on static accessors");
        }

        context.addInitializer(function () {
            const shadowHtml = value.get?.call(this);
            if (typeof shadowHtml === "string") {
                ShadowRegistry.shadowRoot(value, context, shadowHtml, shadowRootInit);
            }
        });
    }
}

export function shadowStyle() {
    return function <T extends Composed<HTMLElement>>(
        value: ClassAccessorDecoratorResult<T, string>,
        context: ClassAccessorDecoratorContext<T, string>
    ) {
        if (!context.static) {
            throw new Error("@shadowStyle can only be used on static accessors");
        }

        context.addInitializer(function (this: T) {
            ShadowRegistry.shadowStyle(value, context, value.get?.call(this) ?? "");
        });
    }
}