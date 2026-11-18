const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

export type QuietResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string }

/** Same-origin session fetch that never redirects. Guests stay on the shop. */
export async function quietApi<T>(
  path: string,
  opts: { method?: string; json?: unknown } = {},
): Promise<QuietResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
    })
    const text = await res.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null
    if (!res.ok) {
      return { ok: false, status: res.status, message: typeof record?.message === "string" ? record.message : "" }
    }
    if (record && record.success === true && "data" in record) {
      return { ok: true, data: record.data as T }
    }
    return { ok: true, data: body as T }
  } catch {
    return { ok: false, status: 0, message: "" }
  }
}

export const CART_EVENT = "webino-cart"

export function notifyCart() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(CART_EVENT))
}
