import { cookies } from "next/headers"

import { unwrapApiData } from "@webina/ui"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

async function serverFetch(path: string, init?: RequestInit): Promise<unknown | null> {
  if (!API_BASE) {
    return null
  }

  const jar = await cookies()
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ")

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })

  if (!res.ok) {
    return null
  }

  const text = await res.text()
  if (!text) {
    return null
  }

  return JSON.parse(text) as unknown
}

/** Raw JSON response (public site RSC pages). */
export async function apiServer<T>(path: string): Promise<T | null> {
  try {
    return (await serverFetch(path)) as T | null
  } catch {
    return null
  }
}

/** Unwrapped API `data` payload (authenticated dashboard home). */
export async function apiServerData<T>(path: string): Promise<T | null> {
  const raw = await apiServer<unknown>(path)
  if (raw == null) {
    return null
  }
  return unwrapApiData<T>(raw)
}

export async function getPublicTenant(): Promise<{
  data: { name: string; store_display_name?: string | null }
}> {
  const res = await apiServer<{
    data: { name: string; store_display_name?: string | null }
  }>("/api/v1/public/tenant")
  if (!res) {
    throw new Error("tenant unavailable")
  }
  return res
}
