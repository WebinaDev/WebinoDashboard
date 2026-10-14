/** Components (symbols), presets and global-class helpers (pure; used by the editor, renderer and tests). */
import type { BuilderComponent, BuilderGlobals, GlobalClass, StylePreset } from "./globals"
import { documentCss, safeToken } from "./style"
import { cloneSection } from "./tree"
import type { ResponsiveStyle, SectionNode, WidgetNode } from "./types"

export const COMPONENT_TYPE = "component"
const MAX_DEPTH = 3

function mapWidgets(sections: SectionNode[], visit: (widget: WidgetNode) => WidgetNode): SectionNode[] {
  return sections.map((section) => ({
    ...section,
    columns: section.columns.map((column) => ({
      ...column,
      widgets: column.widgets.map((widget) => {
        const next = visit(widget)
        return next.children ? { ...next, children: mapWidgets(next.children, visit) } : next
      }),
    })),
  }))
}

export function eachWidget(sections: SectionNode[], visit: (widget: WidgetNode) => void) {
  for (const section of sections) for (const column of section.columns) for (const widget of column.widgets) {
    visit(widget)
    if (widget.children) eachWidget(widget.children, visit)
  }
}

export function findComponent(globals: Pick<BuilderGlobals, "components">, id: unknown): BuilderComponent | null {
  return typeof id === "string" ? (globals.components ?? []).find((c) => c.id === id) ?? null : null
}

/** Sections of a component instance: chosen variant, exposed-prop overrides applied. */
export function resolveInstance(globals: Pick<BuilderGlobals, "components">, props: Record<string, unknown>): SectionNode[] | null {
  const component = findComponent(globals, props.component)
  if (!component) return null
  const variant = typeof props.variant === "string" ? component.variants?.find((v) => v.id === props.variant) : undefined
  const base = variant?.sections ?? component.sections
  const overrides = props.overrides && typeof props.overrides === "object" ? (props.overrides as Record<string, unknown>) : {}
  const byWidget = new Map<string, Record<string, unknown>>()
  for (const exposed of component.props ?? []) {
    if (!(exposed.key in overrides)) continue
    const value = overrides[exposed.key]
    if (value === undefined || value === "") continue
    byWidget.set(exposed.widget, { ...(byWidget.get(exposed.widget) ?? {}), [exposed.prop]: value })
  }
  return mapWidgets(base, (widget) => (byWidget.has(widget.id) ? { ...widget, props: { ...widget.props, ...byWidget.get(widget.id) } } : widget))
}

/** Ids of components used in sections (recursively through components, depth-limited). */
export function usedComponents(sections: SectionNode[], globals: Pick<BuilderGlobals, "components">, depth = 0, out = new Set<string>()): Set<string> {
  if (depth > MAX_DEPTH) return out
  eachWidget(sections, (widget) => {
    if (widget.type !== COMPONENT_TYPE) return
    const component = findComponent(globals, widget.props.component)
    if (!component || out.has(component.id)) return
    out.add(component.id)
    usedComponents(component.sections, globals, depth + 1, out)
    for (const variant of component.variants ?? []) usedComponents(variant.sections, globals, depth + 1, out)
  })
  return out
}

/** Node CSS of every component (and variant) referenced by the document. */
export function componentsCss(sections: SectionNode[], globals: Pick<BuilderGlobals, "components">): string {
  const ids = usedComponents(sections, globals)
  const rules: string[] = []
  for (const id of ids) {
    const component = findComponent(globals, id)
    if (!component) continue
    rules.push(documentCss({ version: 2, sections: component.sections }))
    for (const variant of component.variants ?? []) rules.push(documentCss({ version: 2, sections: variant.sections }))
  }
  return rules.filter(Boolean).join("\n")
}

export function newToken(name: string, taken: string[]): string {
  const base = (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item").slice(0, 30)
  let id = /^[a-z0-9]/.test(base) ? base : `x-${base}`
  let n = 2
  while (taken.includes(id) || !safeToken(id)) id = `${base.slice(0, 30)}-${n++}`
  return id
}

/** New component from sections (deep-copied with fresh ids so the page copy and master never share ids). */
export function makeComponent(name: string, sections: SectionNode[], taken: string[]): BuilderComponent {
  return { id: newToken(name, taken), name: name.slice(0, 80) || "component", sections: sections.map(cloneSection), props: [] }
}

/** Instance widget for a component. */
export function instanceWidget(id: string, componentId: string): WidgetNode {
  return { id, type: COMPONENT_TYPE, props: { component: componentId, overrides: {} } }
}

/** Pairs every node id of `copy` with the id at the same position in `original` (same shape after cloneSection). */
function idMap(original: SectionNode[], copy: SectionNode[], out: Record<string, string> = {}): Record<string, string> {
  original.forEach((section, si) => {
    const s2 = copy[si]
    if (!s2) return
    out[s2.id] = section.id
    section.columns.forEach((column, ci) => {
      const c2 = s2.columns[ci]
      if (!c2) return
      out[c2.id] = column.id
      column.widgets.forEach((widget, wi) => {
        const w2 = c2.widgets[wi]
        if (!w2) return
        out[w2.id] = widget.id
        if (widget.children && w2.children) idMap(widget.children, w2.children, out)
      })
    })
  })
  return out
}

/** Restores master ids on a detached copy (new nodes keep their own ids), so exposed props keep working. */
export function remapIds(sections: SectionNode[], map: Record<string, string>): SectionNode[] {
  const back = (id: string) => map[id] ?? id
  return sections.map((section) => ({
    ...section,
    id: back(section.id),
    columns: section.columns.map((column) => ({
      ...column,
      id: back(column.id),
      widgets: column.widgets.map((widget) => ({ ...widget, id: back(widget.id), ...(widget.children ? { children: remapIds(widget.children, map) } : {}) })),
    })),
  }))
}

/** Detach: the instance becomes a container with editable copies; `componentSource` + `componentMap` let you push changes back. */
export function detachInstance(widget: WidgetNode, globals: Pick<BuilderGlobals, "components">): WidgetNode | null {
  const sections = resolveInstance(globals, widget.props)
  if (!sections) return null
  const copy = sections.map(cloneSection)
  return {
    id: widget.id,
    type: "container",
    props: { componentSource: widget.props.component, componentVariant: widget.props.variant ?? "", componentMap: idMap(sections, copy) },
    style: widget.style,
    advanced: widget.advanced,
    children: copy,
  }
}

/** Replace a component's master sections (or one variant's) with edited sections. */
export function updateComponentSections(components: BuilderComponent[], id: string, sections: SectionNode[], variantName?: string): BuilderComponent[] {
  return components.map((component) => {
    if (component.id !== id) return component
    if (!variantName) return { ...component, sections }
    const variants = component.variants ?? []
    const existing = variants.find((v) => v.name === variantName)
    const next = existing
      ? variants.map((v) => (v === existing ? { ...v, sections } : v))
      : [...variants, { id: newToken(variantName, variants.map((v) => v.id)), name: variantName.slice(0, 60), sections }]
    return { ...component, variants: next }
  })
}

/** Widgets + prop keys that can be exposed on a component. */
export function exposableTargets(component: BuilderComponent): { widget: string; type: string; props: string[] }[] {
  const out: { widget: string; type: string; props: string[] }[] = []
  eachWidget(component.sections, (widget) => {
    if (widget.type === COMPONENT_TYPE) return
    const keys = Object.keys(widget.props ?? {}).filter((key) => ["string", "number", "boolean"].includes(typeof widget.props[key]))
    if (keys.length) out.push({ widget: widget.id, type: widget.type, props: keys })
  })
  return out
}

/** Preset props are defaults under the widget's own props (preset changes reach every linked widget). */
export function applyPreset(widget: WidgetNode, globals: Pick<BuilderGlobals, "presets">): WidgetNode {
  const id = widget.advanced?.preset
  if (!id) return widget
  const preset = (globals.presets ?? []).find((p) => p.id === id && p.widget === widget.type)
  if (!preset?.props) return widget
  return { ...widget, props: { ...preset.props, ...widget.props } }
}

export function makePreset(name: string, widget: WidgetNode, taken: string[]): StylePreset {
  const props: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(widget.props ?? {})) if (typeof value !== "object" || value === null) props[key] = value
  return { id: newToken(name, taken), name: name.slice(0, 80) || widget.type, widget: widget.type, style: widget.style ?? {}, props }
}

export function makeClass(name: string, style: ResponsiveStyle | undefined, taken: string[]): GlobalClass {
  return { id: newToken(name, taken), name: name.slice(0, 80) || "class", style: style ?? {} }
}
