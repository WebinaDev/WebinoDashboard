import { apiServer } from "@/lib/api-server"

/** Normalize Laravel paginator or `{ data: T[] }` responses into an array. */
export function unwrapList<T>(payload: unknown): T[] {
  if (!payload || typeof payload !== "object") return []
  const obj = payload as Record<string, unknown>
  if (Array.isArray(obj.data)) return obj.data as T[]
  if (Array.isArray(payload)) return payload as T[]
  return []
}

export async function fetchPublicList<T>(path: string): Promise<T[]> {
  const res = await apiServer<unknown>(path, { revalidate: 60 })
  return unwrapList<T>(res)
}

export async function fetchPublicItem<T>(path: string): Promise<T | null> {
  const res = await apiServer<{ data: T } | T>(path, { revalidate: 60 })
  if (!res || typeof res !== "object") return null
  if ("data" in res && res.data) return res.data as T
  return res as T
}
