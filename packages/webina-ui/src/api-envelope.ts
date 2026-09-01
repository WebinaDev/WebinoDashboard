export type ApiEnvelope<T = unknown> = {
  success: boolean
  data: T
  message?: string | null
  meta?: Record<string, unknown> | null
  errors?: Record<string, unknown> | null
}

export function isApiEnvelope(value: unknown): value is ApiEnvelope {
  if (!value || typeof value !== "object") return false
  return "success" in value && ("data" in value || "errors" in value)
}

export function unwrapApiData<T>(payload: unknown): T {
  if (isApiEnvelope(payload)) {
    return payload.data as T
  }
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

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
  if (payload && typeof payload === "object" && "data" in payload) {
    const obj = payload as { data: T; message?: string; meta?: Record<string, unknown> }
    return { data: obj.data, message: obj.message, meta: obj.meta }
  }
  return { data: payload as T }
}
