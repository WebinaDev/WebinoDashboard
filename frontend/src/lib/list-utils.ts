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
