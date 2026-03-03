import { styleSheet } from "@core/util/styleSheet";
import { getComposedDataSpace, addLifecycleCallback, addSetupOperation } from "./compose";

const StyleSymbol = Symbol("shadowStyle");

class ShadowRegistryMetadata {
    styles: Array<StyleSheet> = [];
    shadowRootHtml: string = "";
    shadowRootOptions: ShadowRootInit = { mode: "open" };
}

class ShadowRegistry {
    static readonly metadataKey = Symbol("shadowRegistry");

    static getMetadata(metadata: DecoratorMetadataObject): ShadowRegistryMetadata {
        const dataSpace = getComposedDataSpace(metadata);
        return dataSpace[ShadowRegistry.metadataKey] ??= new ShadowRegistryMetadata();
    }

    constructor(public shadowRootOptions: ShadowRootInit = { mode: "open" }) {

    }

    shadowStyle(
        value: ClassAccessorDecoratorTarget<unknown, string>,
        context: ClassAccessorDecoratorContext
    ) {
        if (context.kind != "accessor" || !context.static) {
            throw new TypeError(`@shadowStyle can only be applied to static accessors`);
        }

        const metadata = ShadowRegistry.getMetadata(context.metadata);
        context.addInitializer(function (this: any) {
            const styleText = value.get();
            const style = styleSheet(styleText);
            metadata.styles.push(style);
        });

    }

    shadowRoot(
        value: ClassAccessorDecoratorTarget<unknown, string>,
        context: ClassAccessorDecoratorContext
    ) {
        if (context.kind != "accessor" || !context.static) {
            throw new TypeError(`@shadowRoot can only be applied to static accessors`);
        }

        const metadata = ShadowRegistry.getMetadata(context.metadata);

        metadata.shadowRootOptions = this.shadowRootOptions;
        context.addInitializer(function (this: any) {
            metadata.shadowRootHtml = value.get();
        });
    }

    static resolveShadow(constructor: Function, prototype: any) {
        const metadata = ShadowRegistry.getMetadata(constructor[Symbol.metadata]);
        if (!metadata.shadowRootHtml && !metadata.styles.length) {
            throw new Error(`Must specify @shadowRoot or @shadowStyle for ${constructor.name}`);
        }

        const sheets: StyleSheet[] = [];

        for (let klass = constructor; klass !== HTMLElement; klass = Object.getPrototypeOf(klass)) {
            const metadata = ShadowRegistry.getMetadata(klass[Symbol.metadata]);
            sheets.unshift(...metadata.styles);
        }

    }

}

export function shadowStyle() {
    return function (target: any, context: ClassAccessorDecoratorContext) {
        const registry = new ShadowRegistry();
        registry.shadowStyle(target, context);
    }
}

export function shadowRoot(options: ShadowRootInit = { mode: "open" }) {
    return function (target: any, context: ClassAccessorDecoratorContext) {
        const registry = new ShadowRegistry(options);
        registry.shadowRoot(target, context);
    }
}