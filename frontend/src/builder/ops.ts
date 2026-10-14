/** Editor operations: node lookup, meta (label/lock/hide), section moves, clipboard, paste style, import. */
import { migrateDocument } from "./migrate"
import { addSection, cloneSection, cloneWidget, defaultColumnId, findSelection, findWidget, insertWidget, isDocument } from "./tree"
import type { AdvancedProps, BuilderDocument, ColumnNode, ResponsiveStyle, SectionNode, WidgetNode } from "./types"

export type AnyNode =
  | { kind: "section"; node: SectionNode; parent: SectionNode[] }
  | { kind: "column"; node: ColumnNode; section: SectionNode }
  | { kind: "widget"; node: WidgetNode; column: ColumnNode }

export function findNode(doc: BuilderDocument, id: string): AnyNode | null {
  const walk = (sections: SectionNode[]): AnyNode | null => {
    for (const section of sections) {
      if (section.id === id) return { kind: "section", node: section, parent: sections }
      for (const column of section.columns) {
        if (column.id === id) return { kind: "column", node: column, section }
        for (const widget of column.widgets) {
          if (widget.id === id) return { kind: "widget", node: widget, column }
          if (widget.children) {
            const hit = walk(widget.children)
            if (hit) return hit
          }
        }
      }
    }
    return null
  }
  return walk(doc.sections)
}

type NodePatch = Partial<Pick<WidgetNode, "label" | "locked" | "hidden" | "style" | "advanced">>

/** Patch any node (section / column / widget, at any depth). */
export function patchNode(doc: BuilderDocument, id: string, patch: NodePatch): BuilderDocument {
  const apply = <T extends object>(node: T): T => {
    const next = { ...node, ...patch } as T & Record<string, unknown>
    for (const key of Object.keys(patch)) if ((patch as Record<string, unknown>)[key] === undefined) delete next[key]
    return next
  }
  const walk = (sections: SectionNode[]): SectionNode[] =>
    sections.map((section) =>
      section.id === id
        ? apply(section)
        : {
            ...section,
            columns: section.columns.map((column) =>
              column.id === id
                ? apply(column)
                : {
                    ...column,
                    widgets: column.widgets.map((widget) => {
                      if (widget.id === id) return apply(widget)
                      return widget.children ? { ...widget, children: walk(widget.children) } : widget
                    }),
                  },
            ),
          },
    )
  return { ...doc, sections: walk(doc.sections) }
}

/** True when the node or any ancestor is locked. */
export function isLocked(doc: BuilderDocument, id: string): boolean {
  const walk = (sections: SectionNode[], inherited: boolean): boolean | null => {
    for (const section of sections) {
      const s = inherited || Boolean(section.locked)
      if (section.id === id) return s
      for (const column of section.columns) {
        const c = s || Boolean(column.locked)
        if (column.id === id) return c
        for (const widget of column.widgets) {
          const w = c || Boolean(widget.locked)
          if (widget.id === id) return w
          if (widget.children) {
            const hit = walk(widget.children, w)
            if (hit !== null) return hit
          }
        }
      }
    }
    return null
  }
  return walk(doc.sections, false) ?? false
}

/** Move a top-level section to `index` (after removal). */
export function moveSection(doc: BuilderDocument, id: string, index: number): BuilderDocument {
  const from = doc.sections.findIndex((section) => section.id === id)
  if (from < 0) return doc
  const sections = [...doc.sections]
  const [moved] = sections.splice(from, 1)
  sections.splice(Math.max(0, Math.min(index, sections.length)), 0, moved)
  return { ...doc, sections }
}

export function duplicateSection(doc: BuilderDocument, id: string): { doc: BuilderDocument; id: string | null } {
  const index = doc.sections.findIndex((section) => section.id === id)
  if (index < 0) return { doc, id: null }
  const copy = cloneSection(doc.sections[index])
  const sections = [...doc.sections]
  sections.splice(index + 1, 0, copy)
  return { doc: { ...doc, sections }, id: copy.id }
}

/* ---------- clipboard (localStorage so it works across pages / tabs) ---------- */

export const CLIPBOARD_KEY = "wb_clipboard_v1"

export type Clip =
  | { v: 1; kind: "widget"; node: WidgetNode }
  | { v: 1; kind: "section"; node: SectionNode }

export function makeClip(doc: BuilderDocument, id: string): Clip | null {
  const hit = findNode(doc, id)
  if (!hit) return null
  if (hit.kind === "widget") return { v: 1, kind: "widget", node: structuredClone(hit.node) }
  if (hit.kind === "section") return { v: 1, kind: "section", node: structuredClone(hit.node) }
  // A column copies as a one-column section.
  return { v: 1, kind: "section", node: { id: "sec-clip", columns: [structuredClone({ ...hit.node, span: 12 })] } }
}

export function parseClip(raw: string | null): Clip | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<Clip>
    if (value?.v !== 1 || !value.node || typeof value.node !== "object") return null
    if (value.kind === "widget" && typeof (value.node as WidgetNode).type === "string") return value as Clip
    if (value.kind === "section" && Array.isArray((value.node as SectionNode).columns)) return value as Clip
  } catch {
    return null
  }
  return null
}

/** Paste: widgets go after the selected widget (or end of the target column), sections after the selected top-level section. */
export function pasteClip(doc: BuilderDocument, clip: Clip, selectedId: string | null): { doc: BuilderDocument; id: string } {
  if (clip.kind === "widget") {
    const widget = cloneWidget(clip.node)
    const loc = selectedId ? findWidget(doc, selectedId) : null
    if (loc) return { doc: insertWidget(doc, loc.columnId, loc.index + 1, widget), id: widget.id }
    let base = doc
    let columnId = defaultColumnId(doc, selectedId)
    if (!columnId) {
      base = addSection(doc)
      columnId = base.sections[base.sections.length - 1]?.columns[0]?.id ?? base.sections[0]?.columns[0]?.id ?? null
    }
    if (!columnId) return { doc, id: widget.id }
    const hit = findNode(base, columnId)
    const index = hit?.kind === "column" ? hit.node.widgets.length : 0
    return { doc: insertWidget(base, columnId, index, widget), id: widget.id }
  }
  const section = cloneSection(clip.node)
  const selection = findSelection(doc, selectedId)
  const anchorId = selection?.kind === "section" ? selection.id : selection?.kind === "column" || selection?.kind === "widget" ? topSectionOf(doc, selectedId ?? "") : null
  const at = anchorId ? doc.sections.findIndex((item) => item.id === anchorId) : -1
  const sections = [...doc.sections]
  sections.splice(at >= 0 ? at + 1 : sections.length, 0, section)
  return { doc: { ...doc, sections }, id: section.id }
}

function topSectionOf(doc: BuilderDocument, id: string): string | null {
  for (const section of doc.sections) {
    if (JSON.stringify(section).includes(`"id":"${id}"`)) return section.id
  }
  return null
}

/** Paste style: copy responsive style (and widget advanced settings) from the clip onto the target node. */
export function pasteStyle(doc: BuilderDocument, targetId: string, clip: Clip): BuilderDocument {
  const target = findNode(doc, targetId)
  if (!target) return doc
  const style: ResponsiveStyle | undefined = clip.node.style ? structuredClone(clip.node.style) : undefined
  const patch: NodePatch = { style }
  if (target.kind === "widget" && clip.kind === "widget") {
    const advanced: AdvancedProps | undefined = clip.node.advanced ? structuredClone(clip.node.advanced) : undefined
    // Keep the target's own anchor id; copy everything else.
    patch.advanced = advanced ? { ...advanced, cssId: target.node.advanced?.cssId } : target.node.advanced
  }
  return patchNode(doc, targetId, patch)
}

/* ---------- import / export ---------- */

export const EXPORT_FORMAT = "webino-builder"

export function exportPayload(doc: BuilderDocument, title: string): string {
  return JSON.stringify({ format: EXPORT_FORMAT, exported_at: new Date().toISOString(), title, document: doc }, null, 2)
}

/** Accepts our export envelope or a bare document; returns a migrated document with fresh ids, or null. */
export function importPayload(text: string): BuilderDocument | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  const doc = value && typeof value === "object" && "document" in (value as object) ? (value as { document: unknown }).document : value
  if (!isDocument(doc)) return null
  const migrated = migrateDocument(doc)
  return { ...migrated, sections: migrated.sections.map((section) => cloneSection(section)) }
}
