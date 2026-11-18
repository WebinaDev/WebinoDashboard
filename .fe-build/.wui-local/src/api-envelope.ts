export type ApiEnvelope<T = unknown> = {
  success: boolean
  data: T
  message?: string | null
  meta?: Record<string, unknown> | null
  errors?: Record<string, unknown> | null
}

/**
 * True only for the Webina Laravel envelope (`success` + `data`|`errors`).
 * Does NOT match CRM-style `{ ok, data }` or bare `{ data }` payloads.
 */
export function isApiEnvelope(value: unknown): value is ApiEnvelope {
  if (!value || typeof value !== "object") return false
  return "success" in value && ("data" in value || "errors" in value)
}

/**
 * Unwrap envelope `data` only when `success` is present.
 * Leaves `{ ok, data }` and other shapes untouched so callers keep siblings.
 */
export function unwrapApiData<T>(payload: unknown): T {
  if (isApiEnvelope(payload)) {
    return payload.data as T
  }
  return payload as T
}

/**
 * Unwrap envelope while preserving `meta` / `message`.
 * Non-envelope payloads (including `{ ok, data }`) are returned as `{ data: payload }`.
 */
export function unwrapApiResponse<T>(payload: unknown): {
  data: T
  message?: string | null
  meta?: Record<string, unknown> | null
} {
  if (isApiEnvelope(payload)) {
    return {
      data: payload.data as T,
      message: payload.message,
      meta: payload.meta ?? undefined,
    }
  }
  return { data: payload as T }
}
