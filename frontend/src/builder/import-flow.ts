import type { BuilderDocument, SectionNode } from "./types"
import type { BuilderGlobals } from "./globals"

export type ImportMode = "replace" | "append" | "cancel"

export function insertLibraryDocument(current: BuilderDocument, incoming: BuilderDocument, index: number): BuilderDocument | null {
  const result = appendImportedDocument(current, incoming)
  if (!result) return null
  const sections = [...current.sections]
  sections.splice(Math.min(Math.max(index, 0), sections.length), 0, ...incoming.sections)
  return { ...result, sections }
}

/** Unknown widget types remain in the document; callers can warn before importing. */
export function unknownWidgetTypes(document: BuilderDocument, isKnown: (type: string) => boolean, globals?: Pick<BuilderGlobals, "components">): string[] {
  const unknown = new Set<string>()
  const visited = new Set<string>()
  const pending = [...document.sections]
  while (pending.length) {
    const section = pending.pop()!
    for (const column of section.columns) for (const widget of column.widgets) {
      if (!isKnown(widget.type)) unknown.add(widget.type)
      if (widget.children) pending.push(...widget.children)
      if (widget.type === "component" && typeof widget.props.component === "string") {
        const component = globals?.components.find((item) => item.id === widget.props.component)
        const variantId = typeof widget.props.variant === "string" ? widget.props.variant : ""
        const instanceKey = JSON.stringify([widget.props.component, variantId])
        if (component && !visited.has(instanceKey)) {
          visited.add(instanceKey)
          const variant = component.variants?.find((item) => item.id === variantId)
          pending.push(...(variant?.sections ?? component.sections))
        }
      }
    }
  }
  return [...unknown]
}

export function missingDocumentDependencies(document: BuilderDocument, globals: Pick<BuilderGlobals, "components" | "classes" | "presets" | "queries">): string[] {
  const missing = new Set<string>()
  const visited = new Set<string>()
  const pending = [...document.sections]
  const checkAdvanced = (advanced: SectionNode["advanced"]) => {
    for (const id of Array.isArray(advanced?.classes) ? advanced.classes : []) if (typeof id === "string" && !globals.classes.some((item) => item.id === id)) missing.add(`class:${id}`)
    if (typeof advanced?.preset === "string" && advanced.preset && !globals.presets.some((item) => item.id === advanced.preset)) missing.add(`preset:${advanced.preset}`)
  }
  while (pending.length) {
    const section = pending.pop()!
    checkAdvanced(section.advanced)
    for (const column of section.columns) {
      checkAdvanced(column.advanced)
      for (const widget of column.widgets) {
        checkAdvanced(widget.advanced)
        if (widget.children) pending.push(...widget.children)
        const query = widget.props.queryId
        if (typeof query === "string" && query && !globals.queries.some((item) => item.id === query)) missing.add(`query:${query}`)
        if (widget.type !== "component" || typeof widget.props.component !== "string") continue
        const id = widget.props.component
        const component = globals.components.find((item) => item.id === id)
        if (!component) { missing.add(`component:${id}`); continue }
        const variant = typeof widget.props.variant === "string" ? component.variants?.find((item) => item.id === widget.props.variant) : undefined
        if (typeof widget.props.variant === "string" && widget.props.variant && !variant) missing.add(`component-variant:${id}:${widget.props.variant}`)
        const instanceKey = JSON.stringify([id, variant?.id ?? null])
        if (visited.has(instanceKey)) continue
        visited.add(instanceKey)
        pending.push(...(variant?.sections ?? component.sections))
      }
    }
  }
  return [...missing]
}

/** A declined replacement must never append without a separate confirmation. */
export function chooseImportMode(hasContent: boolean, confirmReplace: () => boolean, confirmAppend: () => boolean): ImportMode {
  if (!hasContent || confirmReplace()) return "replace"
  return confirmAppend() ? "append" : "cancel"
}

/** Preserve IDs and document CSS when appending; collisions cannot be remapped safely in arbitrary CSS. */
export function appendImportedDocument(current: BuilderDocument, imported: BuilderDocument): BuilderDocument | null {
  const ids = new Set<string>()
  const collect = (sections: SectionNode[], rejectCollision: boolean): boolean => {
    const pending = [...sections]
    const add = (id: string) => {
      if (rejectCollision && ids.has(id)) return false
      ids.add(id)
      return true
    }
    while (pending.length) {
      const section = pending.pop()!
      if (!add(section.id)) return false
      for (const column of section.columns) {
        if (!add(column.id)) return false
        for (const widget of column.widgets) {
          if (!add(widget.id)) return false
          if (widget.children) pending.push(...widget.children)
        }
      }
    }
    return true
  }
  collect(current.sections, false)
  if (!collect(imported.sections, true)) return null
  const css = [current.css, imported.css].filter((value): value is string => typeof value === "string" && value.length > 0).join("\n")
  const result = { ...current, sections: [...current.sections, ...imported.sections] }
  delete result.compiled
  if (css) result.css = css
  return result
}
