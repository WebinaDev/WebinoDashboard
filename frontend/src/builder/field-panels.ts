import type { FieldDef } from "./types"

export type FieldPanel = "content" | "design" | "settings"

export function fieldsForPanel(fields: FieldDef[], panel: FieldPanel): FieldDef[] {
  return fields.filter((field) => (field.panel ?? "content") === panel)
}
