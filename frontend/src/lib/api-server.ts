import { headers } from "next/headers"

const API_BASE = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"

export type ApiServerOptions = {
  revalidate?: number | false
  host?: string
  json?: unknown
  method?: string
}

export async function apiServer<T>(path: string, opts: ApiServerOptions = {}): Promise<T> {
  const hdrs = await headers()
  const host = opts.host ?? hdrs.get("host") ?? "localhost"

  const init: RequestInit = {
    method: opts.method ?? (opts.json !== undefined ? "POST" : "GET"),
    headers: {
      Accept: "application/json",
      Host: host,
      ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(opts.json !== undefined ? { body: JSON.stringify(opts.json) } : {}),
  }

  if (opts.revalidate === false) {
    init.cache = "no-store"
  } else if (typeof opts.revalidate === "number") {
    init.next = { revalidate: opts.revalidate }
  } else {
    init.next = { revalidate: 60 }
  }

  const res = await fetch(`${API_BASE}${path}`, init)
  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    const msg = typeof data?.message === "string" ? data.message : `HTTP ${res.status}`
    throw new Error(msg)
  }

  return data as T
}

export async function getPublicTenant() {
  return apiServer<{
    data: {
      name: string
      store_display_name?: string | null
      active_theme_slug?: string | null
      branding?: Record<string, unknown> | null
    }
  }>("/api/v1/public/tenant")
}
