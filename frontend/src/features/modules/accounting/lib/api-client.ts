import { unwrapApiResponse } from "@webina/ui";

import { ApiError } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-helpers";

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
 * - **Envelope unwrapping.** `unwrapApiResponse` runs here, not in the pages, so a page
 *   that reads `res.data.rows` gets the same shape the ERP gave it, and `res.meta` keeps
 *   the paginator fields the envelope carries.
 * - **Typed errors.** Failures throw {@link ApiError} carrying the HTTP status, which is
 *   what the ported pages check (`err.status === 422`).
 */

const BASE = "/api";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
  /**
   * Query string parameters; nullish and empty values are dropped.
   *
   * `unknown` rather than a scalar union because the ERP pages build the bag incrementally
   * (`const params: Record<string, unknown> = {…}; params.x = y`). Narrowing it here would
   * force a cast in every ported page for a value that is serialised with `String()`
   * anyway.
   */
  params?: Record<string, unknown>;
  signal?: AbortSignal;
};

/** What the ported pages treat a response as: `{ data }` with the envelope removed. */
export type ApiResult<T> = {
  data: T;
  status: number;
  /**
   * Envelope `meta`, i.e. Laravel paginator fields (`last_page`, `total`, …).
   *
   * `ApiResponseFormatter` hoists a paginated response's `meta` to the envelope, so
   * unwrapping `data` alone throws the page count away and every list renders a single
   * page. The ported pages read `res.meta.last_page`, so it has to survive here.
   */
  meta?: Record<string, unknown> | null;
};

function buildUrl(path: string, params?: RequestOptions["params"]): string {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!params) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }

  const query = search.toString();

  return query ? `${url}?${query}` : url;
}

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(buildUrl(path, options?.params), {
    method,
    headers,
    credentials: "same-origin",
    signal: options?.signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // 204 has no body and is a success, so it must not reach response.json().
  const payload =
    response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(getApiErrorMessage(payload), response.status, payload);
  }

  const unwrapped = unwrapApiResponse<T>(payload);

  return { data: unwrapped.data, status: response.status, meta: unwrapped.meta };
}

/**
 * Fetch an endpoint that answers with a file rather than a JSON envelope.
 *
 * The JSON path above parses every response with `response.json()`, which would turn a CSV into
 * `null` and a print view into an exception. Downloads and print views are the two places the
 * dashboard hands something to the browser that it does not render itself, so they get their own
 * entry point — same origin, same cookies, same error handling.
 */
async function download(path: string, options?: RequestOptions): Promise<Blob> {
  const response = await fetch(buildUrl(path, options?.params), {
    method: "GET",
    headers: { Accept: "*/*", "X-Requested-With": "XMLHttpRequest" },
    credentials: "same-origin",
    signal: options?.signal,
  });

  if (!response.ok) {
    // A failed export answers with JSON, so read it the same way the JSON path does rather than
    // throwing "unexpected token <" at the user.
    const payload = await response.json().catch(() => null);

    throw new ApiError(getApiErrorMessage(payload), response.status, payload);
  }

  return response.blob();
}

const apiClient = {
  get: <T = unknown>(path: string, options?: RequestOptions) =>
    request<T>("GET", path, undefined, options),
  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, body, options),
  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PUT", path, body, options),
  patch: <T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ) => request<T>("PATCH", path, body, options),
  delete: <T = unknown>(path: string, options?: RequestOptions) =>
    request<T>("DELETE", path, undefined, options),
  download,
};

export default apiClient;

export type ApiClient = typeof apiClient;
