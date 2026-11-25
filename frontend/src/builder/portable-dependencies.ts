import type { BuilderGlobals } from "./globals"
import type { BuilderDocument, SectionNode, WidgetNode } from "./types"
import { EXPORT_FORMAT, hasUniqueNodeIds, isImportDocument } from "./ops"
import { safeToken } from "./style"

export type PortableDependencies = Pick<BuilderGlobals, "components" | "classes" | "presets" | "queries" | "variables">

export function readPortableDependencies(text: string): PortableDependencies | null | false {
  let value: unknown
  try { value = JSON.parse(text) } catch { return false }
  const object = (item: unknown): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item)
  if (!object(value) || value.format !== EXPORT_FORMAT || value.dependencies === undefined) return null
  const bundle = value.dependencies
  if (!object(bundle) || bundle.version !== 1) return false
  const keys = ["components", "classes", "presets", "queries", "variables"] as const
  for (const key of keys) {
    const entries = bundle[key]
    if (!Array.isArray(entries) || entries.length > 1000) return false
    const ids = new Set<string>()
    for (const entry of entries) {
      if (!object(entry) || typeof entry.id !== "string" || !entry.id || entry.id.length > 128 || ids.has(entry.id) || typeof entry.name !== "string") return false
      if (key !== "queries" && !safeToken(entry.id)) return false
      ids.add(entry.id)
    }
  }
  const validSections = (sections: unknown) => {
    const document = { version: 2, sections }
    return isImportDocument(document) && hasUniqueNodeIds(document.sections)
  }
  const validStyle = (style: unknown) => object(style) && ["base", "tablet", "mobile"].every((key) => style[key] === undefined || object(style[key]))
  const components = bundle.components as Record<string, unknown>[]
  if (!components.every((item) => validSections(item.sections) && Array.isArray(item.props) && item.props.every((prop: unknown) =>
    object(prop) && ["key", "label", "widget", "prop"].every((key) => typeof prop[key] === "string")) &&
    (item.variants === undefined || (Array.isArray(item.variants) && item.variants.every((variant: unknown) =>
      object(variant) && typeof variant.id === "string" && typeof variant.name === "string" && validSections(variant.sections)))))) return false
  if (!(bundle.classes as Record<string, unknown>[]).every((item) => validStyle(item.style))) return false
  if (!(bundle.presets as Record<string, unknown>[]).every((item) => typeof item.widget === "string" && validStyle(item.style) && (item.props === undefined || object(item.props)))) return false
  if (!(bundle.queries as Record<string, unknown>[]).every((item) => ["products", "posts", "collection"].includes(String(item.source)) &&
    (item.filters === undefined || (Array.isArray(item.filters) && item.filters.every((filter: unknown) => object(filter) && typeof filter.key === "string" && typeof filter.value === "string"))))) return false
  if (!(bundle.variables as Record<string, unknown>[]).every((item) => ["color", "size", "font", "other"].includes(String(item.kind)) && typeof item.value === "string")) return false
  return {
    components: bundle.components,
    classes: bundle.classes,
    presets: bundle.presets,
    queries: bundle.queries,
    variables: bundle.variables,
  } as PortableDependencies
}

export function collectPortableDependencies(document: BuilderDocument, globals: PortableDependencies): PortableDependencies {
  const componentIds = new Set<string>()
  const classIds = new Set<string>()
  const presetIds = new Set<string>()
  const queryIds = new Set<string>()
  const pending: SectionNode[] = [...document.sections]
  const inspectNode = (node: SectionNode | SectionNode["columns"][number] | WidgetNode) => {
    for (const id of Array.isArray(node.advanced?.classes) ? node.advanced.classes : []) if (typeof id === "string") classIds.add(id)
    if (typeof node.advanced?.preset === "string" && node.advanced.preset) presetIds.add(node.advanced.preset)
  }
  while (pending.length) {
    const section = pending.pop()!
    inspectNode(section)
    for (const column of section.columns) {
      inspectNode(column)
      for (const widget of column.widgets) {
        inspectNode(widget)
        if (widget.children) pending.push(...widget.children)
        if (typeof widget.props.queryId === "string" && widget.props.queryId) queryIds.add(widget.props.queryId)
        if (widget.type !== "component" || typeof widget.props.component !== "string" || componentIds.has(widget.props.component)) continue
        const component = globals.components.find((item) => item.id === widget.props.component)
        if (!component) continue
        componentIds.add(component.id)
        pending.push(...component.sections)
        for (const variant of component.variants ?? []) pending.push(...variant.sections)
      }
    }
  }
  const dependencies: PortableDependencies = {
    components: globals.components.filter((item) => componentIds.has(item.id)),
    classes: globals.classes.filter((item) => classIds.has(item.id)),
    presets: globals.presets.filter((item) => presetIds.has(item.id)),
    queries: globals.queries.filter((item) => queryIds.has(item.id)),
    variables: [],
  }
  const variableIds = new Set<string>()
  const scanVariables = (value: unknown) => {
    const source = JSON.stringify(value)
    if (!source) return
    for (const match of source.matchAll(/--wb-v-([a-zA-Z0-9_-]+)/g)) variableIds.add(match[1])
  }
  scanVariables(document)
  scanVariables(dependencies)
  let count = -1
  while (count !== variableIds.size) {
    count = variableIds.size
    for (const variable of globals.variables) if (variableIds.has(variable.id)) scanVariables(variable)
  }
  dependencies.variables = globals.variables.filter((item) => variableIds.has(item.id))
  return dependencies
}

export type DependencyMerge = { globals: BuilderGlobals; added: number; conflicts: string[] }

export function mergePortableDependencies(globals: BuilderGlobals, incoming: PortableDependencies): DependencyMerge {
  const next = { ...globals }
  const conflicts: string[] = []
  let added = 0
  for (const key of ["components", "classes", "presets", "queries", "variables"] as const) {
    const existing = globals[key] as { id: string }[]
    const additions: { id: string }[] = []
    for (const item of incoming[key]) {
      const found = existing.find((value) => value.id === item.id)
      if (!found) additions.push(item)
      else if (JSON.stringify(found) !== JSON.stringify(item)) conflicts.push(`${key}:${item.id}`)
    }
    added += additions.length
    Object.assign(next, { [key]: [...existing, ...additions] })
  }
  return { globals: next, added, conflicts }
}


