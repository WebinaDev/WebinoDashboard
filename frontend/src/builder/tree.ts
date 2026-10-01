import { uid } from "./ids"
import type { BuilderDocument, ColumnNode, SectionNode, WidgetNode } from "./types"

export function emptyDocument(): BuilderDocument {
  return { version: 1, sections: [] }
}

export function isDocument(value: unknown): value is BuilderDocument {
  if (!value || typeof value !== "object") return false
  const sections = (value as { sections?: unknown }).sections
  return Array.isArray(sections)
}

export function createSection(spans: number[] = [12]): SectionNode {
  return {
    id: uid("sec"),
    columns: spans.map((span) => ({
      id: uid("col"),
      span,
      mobileSpan: 12,
      widgets: [],
    })),
  }
}

export function createColumn(span: number): ColumnNode {
  return { id: uid("col"), span, mobileSpan: 12, widgets: [] }
}

function mapSections(sections: SectionNode[], visit: (section: SectionNode) => SectionNode): SectionNode[] {
  return sections.map((section) => {
    const next = visit(section)
    return {
      ...next,
      columns: next.columns.map((column) => ({
        ...column,
        widgets: column.widgets.map((widget) =>
          widget.children ? { ...widget, children: mapSections(widget.children, visit) } : widget,
        ),
      })),
    }
  })
}

export function updateSection(
  doc: BuilderDocument,
  id: string,
  patch: (section: SectionNode) => SectionNode,
): BuilderDocument {
  return {
    ...doc,
    sections: mapSections(doc.sections, (section) => (section.id === id ? patch(section) : section)),
  }
}

export function updateColumn(
  doc: BuilderDocument,
  id: string,
  patch: (column: ColumnNode) => ColumnNode,
): BuilderDocument {
  return {
    ...doc,
    sections: mapSections(doc.sections, (section) => ({
      ...section,
      columns: section.columns.map((column) => (column.id === id ? patch(column) : column)),
    })),
  }
}

function mapWidgets(widgets: WidgetNode[], id: string, patch: (widget: WidgetNode) => WidgetNode): WidgetNode[] {
  return widgets.map((widget) => {
    const next = widget.id === id ? patch(widget) : widget
    if (!next.children) return next
    return {
      ...next,
      children: next.children.map((section) => ({
        ...section,
        columns: section.columns.map((column) => ({
          ...column,
          widgets: mapWidgets(column.widgets, id, patch),
        })),
      })),
    }
  })
}

export function updateWidget(
  doc: BuilderDocument,
  id: string,
  patch: (widget: WidgetNode) => WidgetNode,
): BuilderDocument {
  return {
    ...doc,
    sections: mapSections(doc.sections, (section) => ({
      ...section,
      columns: section.columns.map((column) => ({
        ...column,
        widgets: mapWidgets(column.widgets, id, patch),
      })),
    })),
  }
}

export function removeNode(doc: BuilderDocument, id: string): BuilderDocument {
  const strip = (sections: SectionNode[]): SectionNode[] =>
    sections
      .filter((section) => section.id !== id)
      .map((section) => ({
        ...section,
        columns: section.columns
          .filter((column) => column.id !== id)
          .map((column) => ({
            ...column,
            widgets: column.widgets
              .filter((widget) => widget.id !== id)
              .map((widget) => (widget.children ? { ...widget, children: strip(widget.children) } : widget)),
          })),
      }))
  return { ...doc, sections: strip(doc.sections) }
}

export type WidgetLoc = { columnId: string; index: number; widget: WidgetNode }

export function findWidget(doc: BuilderDocument, id: string): WidgetLoc | null {
  const search = (sections: SectionNode[]): WidgetLoc | null => {
    for (const section of sections) {
      for (const column of section.columns) {
        const index = column.widgets.findIndex((widget) => widget.id === id)
        if (index >= 0) return { columnId: column.id, index, widget: column.widgets[index] }
        for (const widget of column.widgets) {
          if (!widget.children) continue
          const nested = search(widget.children)
          if (nested) return nested
        }
      }
    }
    return null
  }
  return search(doc.sections)
}

export function findSection(doc: BuilderDocument, id: string): SectionNode | null {
  const search = (sections: SectionNode[]): SectionNode | null => {
    for (const section of sections) {
      if (section.id === id) return section
      for (const column of section.columns) {
        for (const widget of column.widgets) {
          if (!widget.children) continue
          const nested = search(widget.children)
          if (nested) return nested
        }
      }
    }
    return null
  }
  return search(doc.sections)
}

export function findColumn(doc: BuilderDocument, id: string): { section: SectionNode; column: ColumnNode } | null {
  const search = (sections: SectionNode[]): { section: SectionNode; column: ColumnNode } | null => {
    for (const section of sections) {
      for (const column of section.columns) {
        if (column.id === id) return { section, column }
        for (const widget of column.widgets) {
          if (!widget.children) continue
          const nested = search(widget.children)
          if (nested) return nested
        }
      }
    }
    return null
  }
  return search(doc.sections)
}

export type Selection =
  | { kind: "section"; id: string; section: SectionNode }
  | { kind: "column"; id: string; column: ColumnNode; sectionId: string }
  | { kind: "widget"; id: string; widget: WidgetNode; columnId: string }

export function findSelection(doc: BuilderDocument, id: string | null): Selection | null {
  if (!id) return null
  const section = findSection(doc, id)
  if (section) return { kind: "section", id, section }
  const column = findColumn(doc, id)
  if (column) return { kind: "column", id, column: column.column, sectionId: column.section.id }
  const widget = findWidget(doc, id)
  if (widget) return { kind: "widget", id, widget: widget.widget, columnId: widget.columnId }
  return null
}

export function insertWidget(doc: BuilderDocument, columnId: string, index: number, widget: WidgetNode): BuilderDocument {
  const place = (sections: SectionNode[]): SectionNode[] =>
    sections.map((section) => ({
      ...section,
      columns: section.columns.map((column) => {
        if (column.id === columnId) {
          const widgets = [...column.widgets]
          const at = Math.max(0, Math.min(index, widgets.length))
          widgets.splice(at, 0, widget)
          return { ...column, widgets }
        }
        return {
          ...column,
          widgets: column.widgets.map((item) => (item.children ? { ...item, children: place(item.children) } : item)),
        }
      }),
    }))
  return { ...doc, sections: place(doc.sections) }
}

export function moveWidget(doc: BuilderDocument, widgetId: string, columnId: string, index: number): BuilderDocument {
  const loc = findWidget(doc, widgetId)
  if (!loc) return doc
  if (loc.columnId === columnId && (loc.index === index || loc.index + 1 === index)) return doc
  const without = removeNode(doc, widgetId)
  const adjusted = loc.columnId === columnId && loc.index < index ? index - 1 : index
  return insertWidget(without, columnId, adjusted, loc.widget)
}

export function addSection(doc: BuilderDocument, index?: number): BuilderDocument {
  const sections = [...doc.sections]
  sections.splice(index ?? sections.length, 0, createSection([12]))
  return { ...doc, sections }
}

export function addColumn(doc: BuilderDocument, sectionId: string): BuilderDocument {
  return updateSection(doc, sectionId, (section) => {
    if (section.columns.length >= 6) return section
    const count = section.columns.length + 1
    const base = Math.floor(12 / count)
    const extra = 12 - base * count
    const columns = [...section.columns, createColumn(base)]
    return {
      ...section,
      columns: columns.map((column, i) => ({ ...column, span: base + (i < extra ? 1 : 0) })),
    }
  })
}

export function resizeColumn(doc: BuilderDocument, columnId: string, span: number): BuilderDocument {
  const nextSpan = Math.min(11, Math.max(1, Math.round(span)))
  const located = findColumn(doc, columnId)
  if (!located) return doc
  const columns = located.section.columns
  const index = columns.findIndex((column) => column.id === columnId)
  if (index < 0) return doc
  const neighbor = columns[index + 1] ?? columns[index - 1]
  if (!neighbor || neighbor.id === columnId) {
    return updateColumn(doc, columnId, (column) => ({ ...column, span: nextSpan }))
  }
  const current = columns[index]
  const pair = current.span + neighbor.span
  const clamped = Math.min(pair - 1, Math.max(1, nextSpan))
  return updateSection(doc, located.section.id, (section) => ({
    ...section,
    columns: section.columns.map((column) => {
      if (column.id === columnId) return { ...column, span: clamped }
      if (column.id === neighbor.id) return { ...column, span: pair - clamped }
      return column
    }),
  }))
}

function cloneWidget(widget: WidgetNode): WidgetNode {
  return {
    ...widget,
    id: uid("w"),
    props: { ...widget.props },
    style: widget.style ? structuredClone(widget.style) : undefined,
    children: widget.children?.map((section) => cloneSection(section)),
  }
}

function cloneSection(section: SectionNode): SectionNode {
  return {
    ...section,
    id: uid("sec"),
    style: section.style ? structuredClone(section.style) : undefined,
    columns: section.columns.map((column) => ({
      ...column,
      id: uid("col"),
      style: column.style ? structuredClone(column.style) : undefined,
      widgets: column.widgets.map((widget) => cloneWidget(widget)),
    })),
  }
}

export function duplicateWidget(doc: BuilderDocument, widgetId: string): BuilderDocument {
  const loc = findWidget(doc, widgetId)
  if (!loc) return doc
  return insertWidget(doc, loc.columnId, loc.index + 1, cloneWidget(loc.widget))
}

export function defaultColumnId(doc: BuilderDocument, selectedId: string | null): string | null {
  const selection = findSelection(doc, selectedId)
  if (selection?.kind === "column") return selection.id
  if (selection?.kind === "widget") return selection.columnId
  if (selection?.kind === "section") return selection.section.columns[0]?.id ?? null
  const last = doc.sections[doc.sections.length - 1]
  return last?.columns[0]?.id ?? null
}

export function sectionIndexForColumn(doc: BuilderDocument, columnId: string): number {
  return doc.sections.findIndex((section) => section.columns.some((column) => column.id === columnId))
}
