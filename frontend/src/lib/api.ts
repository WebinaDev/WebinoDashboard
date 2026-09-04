import { unwrapApiData } from "@webina/ui"

import { getApiErrorMessage } from "@/lib/api-helpers"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

export type ApiOptions = RequestInit & {
  json?: unknown
}

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

let handlingUnauthorized = false

function redirectToLogin(): void {
  if (typeof window === "undefined" || handlingUnauthorized) return
  const path = window.location.pathname
  if (path.startsWith("/login") || path.startsWith("/setup")) return
  handlingUnauthorized = true
  const next = encodeURIComponent(path + window.location.search)
  window.location.assign(`/login?next=${next}`)
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: HeadersInit = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(opts.headers ?? {}),
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers,
      credentials: "include",
      body:
        opts.json !== undefined
          ? JSON.stringify(opts.json)
          : (opts.body as BodyInit | undefined),
    })
  } catch (err) {
    throw new ApiError(getApiErrorMessage(err), 0)
  }

  if (res.status === 204) {
    return undefined as T
  }

  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  if (!res.ok) {
    if (res.status === 401) {
      redirectToLogin()
    }
    const body = data as { message?: string; errors?: Record<string, unknown> } | null
    const msg = getApiErrorMessage(
      new ApiError(typeof body?.message === "string" ? body.message : `HTTP ${res.status}`, res.status, data),
      body,
    )
    throw new ApiError(msg, res.status, data)
  }

  return unwrapApiData<T>(data)
}
