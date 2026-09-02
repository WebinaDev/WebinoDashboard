import { cache } from "react"
import { cookies } from "next/headers"

import { unwrapApiData } from "@webina/ui"

import { getServerApiBase } from "@/lib/server-api-base"

type FetchOptions = RequestInit & { revalidate?: number | false; tags?: string[] }

async function serverFetch(path: string, init?: FetchOptions): Promise<unknown | null> {
  const apiBase = getServerApiBase()
  if (!apiBase) {
    return null
  }

  const jar = await cookies()
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ")

  const revalidate = init?.revalidate
  const nextOpts =
    revalidate === false
      ? { cache: "no-store" as const }
      : {
          next: {
            revalidate: typeof revalidate === "number" ? revalidate : 60,
            tags: init?.tags,
          },
        }

  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    ...nextOpts,
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(init?.headers ?? {}),
    },
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
export async function apiServer<T>(path: string, opts?: FetchOptions): Promise<T | null> {
  try {
    return (await serverFetch(path, opts)) as T | null
  } catch {
    return null
  }
}

/** Unwrapped API `data` payload (authenticated dashboard home). */
export const apiServerData = cache(async <T,>(path: string, opts?: FetchOptions): Promise<T | null> => {
  const raw = await apiServer<unknown>(path, opts)
  if (raw == null) {
    return null
  }
  return unwrapApiData<T>(raw)
})

export async function getPublicTenant(): Promise<{
  data: { name: string; store_display_name?: string | null; active_theme_slug?: string | null }
}> {
  const res = await apiServer<{
    data: { name: string; store_display_name?: string | null; active_theme_slug?: string | null }
  }>("/api/v1/public/tenant", { revalidate: 60, tags: ["tenant"] })
  if (!res) {
    throw new Error("tenant unavailable")
  }
  return res
}
