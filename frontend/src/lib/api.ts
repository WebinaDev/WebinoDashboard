import { unwrapApiData } from "@webina/ui"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

export type ApiOptions = RequestInit & {
  json?: unknown
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: HeadersInit = {
    Accept: "application/json",
    ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(opts.headers ?? {}),
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
    credentials: "include",
    body:
      opts.json !== undefined
        ? JSON.stringify(opts.json)
        : (opts.body as BodyInit | undefined),
  })

  if (res.status === 204) {
    return undefined as T
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    const msg =
      typeof data?.message === "string" ? data.message : `HTTP ${res.status}`
    throw new ApiError(msg, res.status)
  }

  return unwrapApiData<T>(data)
}
