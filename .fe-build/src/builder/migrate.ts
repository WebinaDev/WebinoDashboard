import type { BuilderDocument, SectionNode, WidgetNode } from "./types"

function markLegacy(sections: SectionNode[]): SectionNode[] {
  return sections.map((section) => ({
    ...section,
    legacy: true,
    columns: section.columns.map((column) => ({
      ...column,
      widgets: column.widgets.map((widget): WidgetNode => (widget.children ? { ...widget, children: markLegacy(widget.children) } : widget)),
    })),
  }))
}

/**
 * v1 → v2. Structure is unchanged; every existing section (including nested container children) is
 * flagged `legacy` so it renders exactly as before (fixed 12-column grid, desktop spans, single column
 * in the mobile preview). New sections created after the upgrade use the responsive v2 layout.
 * Idempotent and pure.
 */
export function migrateDocument(doc: BuilderDocument): BuilderDocument {
  if (doc.version === 2) return doc
  return { ...doc, version: 2, sections: markLegacy(doc.sections ?? []) }
}
