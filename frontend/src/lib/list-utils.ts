/** Normalize Laravel paginated or array API payloads to a row array. */
export function normalizeListPayload(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw as Record<string, unknown>[]
  }
  if (raw && typeof raw === "object" && "data" in raw) {
    const inner = (raw as { data: unknown }).data
    if (Array.isArray(inner)) {
      return inner as Record<string, unknown>[]
    }
  }
  return []
}

export function readListMeta(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && "meta" in raw) {
    const meta = (raw as { meta?: unknown }).meta
    if (meta && typeof meta === "object") {
      return meta as Record<string, unknown>
    }
  }
  return {}
}

/**
 * Coerce an API value to an array without trusting its shape.
 *
 * `const { data: rows = [] }` only guards `undefined`. A backend that answers with an error
 * object, `{data: {...}}`, or a single record leaves `rows` non-array, and the first
 * `rows.map(...)` during render throws `k.map is not a function` — which the route error
 * boundary turns into a full-page failure. Use this at the query boundary instead.
 */
export function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value && typeof value === "object" && "data" in value) {
    const inner = (value as { data: unknown }).data
    if (Array.isArray(inner)) return inner as T[]
  }
  return []
}
