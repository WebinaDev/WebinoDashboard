/** Tiny registry: shared core first, then platform/theme plugins (ERP corporate «وبینا», Dashboard commerce). */
export type WidgetPlugin<W extends { type: string }> = { name: string; widgets: W[] }

export type WidgetRegistry<W extends { type: string }> = {
  register: (plugin: WidgetPlugin<W>) => void
  get: (type: string) => W | undefined
  list: () => W[]
}

/** Later plugins may override a type on purpose; duplicates are reported via `onConflict`. */
export function createWidgetRegistry<W extends { type: string }>(core: W[], onConflict?: (type: string, plugin: string) => void): WidgetRegistry<W> {
  const map = new Map<string, W>()
  for (const w of core) map.set(w.type, w)
  return {
    register(plugin) {
      for (const w of plugin.widgets) {
        if (map.has(w.type)) onConflict?.(w.type, plugin.name)
        map.set(w.type, w)
      }
    },
    get: (type) => map.get(type),
    list: () => [...map.values()],
  }
}
