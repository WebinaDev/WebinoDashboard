import { unwrapApiData, unwrapApiResponse } from "@webina/ui"

import { getApiErrorMessage } from "@/lib/api-helpers"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

export type ApiOptions = RequestInit & {
  json?: unknown
}

export type ApiListPayload<T> = {
  data: T
  meta?: Record<string, unknown> | null
  message?: string | null
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

async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Unwrap Webina envelope; when `meta` is present, return `{ data, meta, message }`
 * so list pages can read pagination stats without a second fetch.
 */
export function normalizeApiPayload<T>(payload: unknown): T {
  const unwrapped = unwrapApiResponse<T>(payload)
  if (unwrapped.meta != null) {
    return {
      data: unwrapped.data,
      meta: unwrapped.meta,
      ...(unwrapped.message ? { message: unwrapped.message } : {}),
    } as T
  }
  return unwrapped.data
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

  const data = await parseJsonResponse(res)

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

  return normalizeApiPayload<T>(data)
}

/** Raw unwrap for CRM `{ ok, data }` payloads — does not strip sibling fields. */
export async function apiRaw<T>(path: string, opts: ApiOptions = {}): Promise<T> {
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

  const data = await parseJsonResponse(res)

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
