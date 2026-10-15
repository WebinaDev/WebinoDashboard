/** Later plugins may override a type on purpose; duplicates are reported via `onConflict`. */
export function createWidgetRegistry(core, onConflict) {
    const map = new Map();
    for (const w of core)
        map.set(w.type, w);
    return {
        register(plugin) {
            for (const w of plugin.widgets) {
                if (map.has(w.type))
                    onConflict?.(w.type, plugin.name);
                map.set(w.type, w);
            }
        },
        get: (type) => map.get(type),
        list: () => [...map.values()],
    };
}
