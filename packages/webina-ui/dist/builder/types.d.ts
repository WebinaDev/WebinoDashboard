/** Minimal structural widget contract shared by ERP and Dashboard.
 * Each platform's own WidgetDef/FieldDef is a superset, so shared defs are assignable to it. */
export type SharedOption = {
    value: string;
    label: string;
};
export type SharedRepeaterSubField = {
    key: string;
    label: string;
    kind: "text" | "url" | "media" | "icon" | "textarea" | "select";
    options?: SharedOption[];
};
export type SharedFieldDef = {
    kind: "text" | "textarea" | "color" | "url";
    key: string;
    label: string;
} | {
    kind: "select";
    key: string;
    label: string;
    options: SharedOption[];
} | {
    kind: "switch";
    key: string;
    label: string;
} | {
    kind: "icon";
    key: string;
    label: string;
    options: SharedOption[];
} | {
    kind: "link";
    key: string;
    label: string;
} | {
    kind: "repeater";
    key: string;
    label: string;
    fields: SharedRepeaterSubField[];
};
export type SharedWidgetNode = {
    id: string;
    type: string;
    props: Record<string, unknown>;
};
export type SharedWidgetCategory = "basic" | "content";
export type SharedWidgetDef = {
    type: string;
    label: string;
    category: SharedWidgetCategory;
    fields: SharedFieldDef[];
    create: () => SharedWidgetNode;
};
/** Widget ids both platforms must implement with these props. */
export declare const SHARED_WIDGET_IDS: readonly ["section-heading", "steps", "icon-cards", "badges", "cta-banner", "comparison-table", "form"];
export type SharedWidgetId = (typeof SHARED_WIDGET_IDS)[number];
//# sourceMappingURL=types.d.ts.map