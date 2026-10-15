import type { SharedOption, SharedWidgetDef } from "./types";
export type SharedFormOptions = {
    formKeyLabel?: string;
    fieldsLabel?: string;
};
export declare const DEFAULT_ICON_OPTIONS: SharedOption[];
/** Shared pro form. `formKey` is resolved by the platform adapter (ERP: Marketing form slug). */
export declare function sharedFormWidget(opts?: SharedFormOptions): SharedWidgetDef;
export declare function sharedContentWidgets(iconOptions?: SharedOption[]): SharedWidgetDef[];
//# sourceMappingURL=widgets.d.ts.map