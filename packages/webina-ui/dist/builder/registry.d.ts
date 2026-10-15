/** Tiny registry: shared core first, then platform/theme plugins (ERP corporate «وبینا», Dashboard commerce). */
export type WidgetPlugin<W extends {
    type: string;
}> = {
    name: string;
    widgets: W[];
};
export type WidgetRegistry<W extends {
    type: string;
}> = {
    register: (plugin: WidgetPlugin<W>) => void;
    get: (type: string) => W | undefined;
    list: () => W[];
};
/** Later plugins may override a type on purpose; duplicates are reported via `onConflict`. */
export declare function createWidgetRegistry<W extends {
    type: string;
}>(core: W[], onConflict?: (type: string, plugin: string) => void): WidgetRegistry<W>;
//# sourceMappingURL=registry.d.ts.map