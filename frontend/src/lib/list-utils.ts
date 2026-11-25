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
  // Laravel's LengthAwarePaginator serializes pagination fields at the top level
  // (current_page, last_page, …), not under `meta`. Endpoints that return the
  // paginator directly used to report one page no matter how many rows existed.
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>
    if ("last_page" in obj || "current_page" in obj || "total" in obj) {
      return obj
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
