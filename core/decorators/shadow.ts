import { ComposedDecoratorManager, type Composed } from "@decorators/compose";

class ShadowRegistry extends ComposedDecoratorManager<HTMLElement, never> {
    static symbol = Symbol("ShadowRegistry");

    public styleSheets: CSSStyleSheet[] = [];
    public shadowRootInit: ShadowRootInit | null = null;
    public shadowRootValue: string | undefined = undefined;
    public stylesLinked = false;
    private readonly cssCache = new Set<string>();
    private readonly shadowTemplate = document.createElement("template");

    constructor() {
        super();
    }

    addShadowRoot(shadowRootValue: string, shadowRootInit: ShadowRootInit) {
        // First definition wins at class level; repeated instance initializations are expected.
        if (this.shadowRootInit && this.shadowRootValue !== undefined) {
            return;
        }

        this.shadowRootInit = shadowRootInit;
        this.shadowRootValue = shadowRootValue;
        this.shadowTemplate.innerHTML = shadowRootValue;
    }

    addStyle(styleText: string) {
        if (!styleText || this.cssCache.has(styleText)) {
            return;
        }

        const styleSheet = new CSSStyleSheet();
        styleSheet.replaceSync(styleText);
        this.styleSheets.push(styleSheet);
        this.cssCache.add(styleText);
    }

    collectStyleSheets(instance: Composed<HTMLElement>): CSSStyleSheet[] {
        if (this.stylesLinked) {
            return this.styleSheets;
        }

        let out: CSSStyleSheet[] = this.styleSheets;

        // Walk class constructors and stop at the first class that has metadata+registry.
        for (let klass: any = instance.constructor; klass && klass !== HTMLElement; klass = Object.getPrototypeOf(klass)) {
            const metadata = klass?.[Symbol.metadata] as DecoratorMetadata | undefined;
            if (!metadata) {
                continue;
            }

            const registry = ShadowRegistry.getManager(metadata);
            if (!registry) {
                continue;
            }

            // Reuse registry reference so all instances share the same array.
            out = registry.styleSheets;
            break;
        }

        // Persist the collected reference on this registry for subsequent direct use.
        this.styleSheets = out;
        this.stylesLinked = true;
        return out;
    }

    tryApply(instance: Composed<HTMLElement>) {
        if (this.shadowRootInit && this.shadowRootValue && !instance.shadowRoot) {
            const shadowRoot = instance.attachShadow(this.shadowRootInit);
            shadowRoot.replaceChildren(this.shadowTemplate.content.cloneNode(true));
        }

        if (instance.shadowRoot) {
            instance.shadowRoot.adoptedStyleSheets = this.collectStyleSheets(instance);
        }
    }
}

/**
 * Initializes component shadow root from an accessor value.
 * Works regardless of initializer order with @shadowStyle.
 */
export function shadowRoot(shadowRootInit: ShadowRootInit = { mode: "open" }) {
    return function <T extends Composed<HTMLElement>>(
        value: ClassAccessorDecoratorResult<T, string>,
        context: ClassAccessorDecoratorContext<T, string>
    ) {
        const registry = ShadowRegistry.getManager(context.metadata);
        if (!registry) {
            return;
        }

        return {
            get(this: T) {
                return registry.shadowRootValue ?? "";
            },
            init(this: T, shadowRootValue: string) {
                if (shadowRootValue) {
                    registry.addShadowRoot(shadowRootValue, shadowRootInit);
                }

                registry.tryApply(this);
                return "";
            },
            set(this: T, _next: string) {
                throw new TypeError("@shadowRoot value is read-only");
            }
        };
    };
}

/**
 * Registers CSS text from an accessor and applies it when/if shadow root exists.
 * Works regardless of initializer order with @shadowRoot.
 */
export function shadowStyle() {
    return function <T extends Composed<HTMLElement>>(
        value: ClassAccessorDecoratorResult<T, string>,
        context: ClassAccessorDecoratorContext<T, string>
    ) {
        const registry = ShadowRegistry.getManager(context.metadata);
        if (!registry) {
            return;
        }

        return {
            get(this: T) {
                return value.get?.call(this) ?? "";
            },
            init(this: T, cssText: string) {
                if (cssText) {
                    registry.addStyle(cssText);
                }

                registry.tryApply(this);
                return "";
            },
            set(this: T, _next: string) {
                throw new TypeError("@shadowStyle value is read-only");
            }
        };
    };
}