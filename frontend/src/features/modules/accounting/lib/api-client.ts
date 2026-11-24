import { unwrapApiData } from "@webina/ui"

import { ApiError } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

/**
 * Minimal axios-shaped client for the pages ported from WebinoERP.
 *
 * Those pages were written against `apiClient.get(path)` returning `{ data }`, and they
 * pass that straight to `unwrapData()`. This dashboard has no axios — `@/lib/api` is a
 * fetch wrapper — so rather than rewrite 19 pages, this module presents the same three
 * methods they call.
 *
 * Behaviour that matters and is deliberately preserved:
 *
 * - **Same-origin.** Requests go to `/api/...` with no host, so the Next proxy forwards
 *   them to Laravel. A browser calling `localhost` directly would break on every deployed
 *   host.
 * - **Envelope unwrapping.** `unwrapApiData` runs here, not in the pages, so a page that
 *   reads `res.data.rows` gets the same shape the ERP gave it.
 * - **Typed errors.** Failures throw {@link ApiError} carrying the HTTP status, which is
 *   what the ported pages check (`err.status === 422`).
 */

const BASE = "/api"

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

type RequestOptions = {
  /**
   * Query string parameters; nullish and empty values are dropped.
   *
   * `unknown` rather than a scalar union because the ERP pages build the bag incrementally
   * (`const params: Record<string, unknown> = {…}; params.x = y`). Narrowing it here would
   * force a cast in every ported page for a value that is serialised with `String()`
   * anyway.
   */
  params?: Record<string, unknown>
  signal?: AbortSignal
}

/** What the ported pages treat a response as: `{ data }` with the envelope removed. */
export type ApiResult<T> = { data: T; status: number }

function buildUrl(path: string, params?: RequestOptions["params"]): string {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`
  if (!params) return url

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue
    search.set(key, String(value))
  }

  const query = search.toString()

  return query ? `${url}?${query}` : url
}

async function request<T>(method: Method, path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json"
  }

  const response = await fetch(buildUrl(path, options?.params), {
    method,
    headers,
    credentials: "same-origin",
    signal: options?.signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  // 204 has no body and is a success, so it must not reach response.json().
  const payload = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(getApiErrorMessage(payload), response.status, payload)
  }

  return { data: unwrapApiData<T>(payload), status: response.status }
}

const apiClient = {
  get: <T = unknown>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => request<T>("POST", path, body, options),
  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PUT", path, body, options),
  patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => request<T>("PATCH", path, body, options),
  delete: <T = unknown>(path: string, options?: RequestOptions) => request<T>("DELETE", path, undefined, options),
}

export default apiClient

export type ApiClient = typeof apiClient
