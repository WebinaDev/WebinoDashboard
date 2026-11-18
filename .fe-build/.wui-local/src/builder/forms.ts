/** Shared form model (ERP + Dashboard). Types include `heading` (group title, no input) and `file` (private upload, value = token).
 * Pro form model: `label|name|type|options|required|step|showIf` per line (first three columns = legacy format). */
export type FormFieldType = "text" | "email" | "tel" | "number" | "textarea" | "select" | "radio" | "checkbox" | "date" | "file" | "heading"
export type FormField = { label: string; name: string; type: FormFieldType; options: string[]; required: boolean; step: number; showIf?: { name: string; value: string } }

export const FORM_FIELD_TYPES: FormFieldType[] = ["text", "email", "tel", "number", "textarea", "select", "radio", "checkbox", "date", "file", "heading"]

const DEFAULT_FIELDS = "نام|name|text\nموبایل|phone|tel\nپیام|message|textarea"

export function parseFormFields(raw: unknown): FormField[] {
  const text = typeof raw === "string" && raw.trim() ? raw : DEFAULT_FIELDS
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = "", name = "", type = "", options = "", required = "", step = "", showIf = ""] = line.split("|").map((part) => part.trim())
      const cond = showIf.match(/^([\w.-]+)\s*=\s*(.*)$/)
      return {
        label: label || name || "فیلد",
        name: (name || label || "field").replace(/[^\p{L}\p{N}_.-]/gu, "_"),
        type: (FORM_FIELD_TYPES as string[]).includes(type) ? (type as FormFieldType) : "text",
        options: options.split(/[,،]/).map((item) => item.trim()).filter(Boolean),
        // Legacy forms required every field; an empty column keeps that.
        required: type !== "heading" && !["no", "خیر", "0", "false"].includes(required.toLowerCase()),
        step: Math.max(1, Number.parseInt(step, 10) || 1),
        showIf: cond ? { name: cond[1], value: cond[2].trim() } : undefined,
      }
    })
}

export function isVisible(field: FormField, values: Record<string, string>): boolean {
  if (!field.showIf) return true
  return (values[field.showIf.name] ?? "") === field.showIf.value
}

export function stepCount(fields: FormField[]): number {
  return fields.reduce((max, field) => Math.max(max, field.step), 1)
}

/** Names of visible required fields on `step` that are still empty. */
export function missingOnStep(fields: FormField[], values: Record<string, string>, step: number): string[] {
  return fields.filter((field) => field.type !== "heading" && field.step === step && field.required && isVisible(field, values) && !(values[field.name] ?? "").trim()).map((field) => field.name)
}

/** Payload sent to the server: only visible fields. */
export function visiblePayload(fields: FormField[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of fields) if (field.type !== "heading" && isVisible(field, values)) out[field.name] = values[field.name] ?? ""
  for (const key of ["email", "phone"]) if (values[key] !== undefined && out[key] === undefined) out[key] = values[key]
  return out
}

/** Marketing form definition (`marketing_forms.fields`) → builder fields, so a widget can use the form's own schema. */
export function fieldsFromDefinition(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const name = typeof row.name === "string" ? row.name : ""
    if (!name) return []
    const type = typeof row.type === "string" && (FORM_FIELD_TYPES as string[]).includes(row.type) ? (row.type as FormFieldType) : "text"
    return [{
      label: typeof row.label === "string" && row.label ? row.label : name,
      name,
      type,
      options: Array.isArray(row.options) ? row.options.map(String) : [],
      required: type !== "heading" && row.required === true,
      step: Math.max(1, Number(row.step) || 1),
    }]
  })
}
