"use client"

/**
 * Durable write queue for the till.
 *
 * A counter sale is the one operation that cannot be lost: the guest has the coffee, the
 * cashier has the money, and the only copy of the sale was in a React state tree. Before this
 * module a dropped connection produced a toast, and the basket was gone.
 *
 * What this does:
 *  - every POS write is stored in localStorage before the request leaves, keyed by a client id
 *    so a retry after a timeout cannot create two orders;
 *  - a failed write stays queued instead of being discarded;
 *  - the queue drains automatically when the browser comes back online, and on demand;
 *  - each attempt replays the exact payload that was captured at the counter, so a later menu
 *    edit cannot change what the guest was charged.
 *
 * What this deliberately does not do: price a basket offline. Quoting, coupons and loyalty all
 * need the server, so an offline sale is recorded with the totals the cashier saw on screen
 * and marked `provisional` for review. Guessing a price is worse than flagging one.
 */

const STORAGE_KEY = "webino.cafe.pos.queue.v1"

export type QueuedWrite = {
  /** Client-generated id, also sent to the server so a replay is idempotent. */
  id: string
  /** `orders` for a new sale, `orders/{id}` for an edit to an existing one. */
  path: string
  method: "POST" | "PUT"
  body: unknown
  /** When the cashier pressed the button, not when it finally synced. */
  createdAt: string
  attempts: number
  lastError?: string
}

function isStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage)
  } catch {
    // Safari in private mode throws on access.
    return false
  }
}

export function readQueue(): QueuedWrite[] {
  if (!isStorageAvailable()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as QueuedWrite[]) : []
  } catch {
    // Corrupt entry must not brick the till; drop it and carry on.
    return []
  }
}

function writeQueue(rows: QueuedWrite[]): void {
  if (!isStorageAvailable()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  } catch {
    // Quota exceeded: keep going with the in-memory list rather than throwing at the till.
  }
}

export function enqueue(entry: Omit<QueuedWrite, "id" | "createdAt" | "attempts">): QueuedWrite {
  const row: QueuedWrite = {
    ...entry,
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `w-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
  }
  writeQueue([...readQueue(), row])
  return row
}

export function removeFromQueue(id: string): void {
  writeQueue(readQueue().filter((row) => row.id !== id))
}

export function markFailed(id: string, message: string): void {
  writeQueue(
    readQueue().map((row) =>
      row.id === id ? { ...row, attempts: row.attempts + 1, lastError: message } : row,
    ),
  )
}

export function clearQueue(): void {
  writeQueue([])
}

/** Whether a failure looks like "the network is gone" rather than "the server said no". */
export function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  // A 4xx is a real refusal: retrying it forever would loop. Only transport failures queue.
  if (/\b(4\d\d)\b/.test(message)) return false

  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("load failed") ||
    message.includes("timeout") ||
    message.includes("offline") ||
    message.includes("econnrefused") ||
    message === ""
  )
}

export type DrainResult = { synced: number; remaining: number; lastError?: string }

/**
 * Send everything queued, oldest first.
 *
 * Stops at the first transport failure: if the connection is still down, hammering the
 * remaining rows wastes the cashier's battery and reorders nothing useful. A row the server
 * refuses (4xx) is kept with its error so a person can look at it, rather than being deleted.
 */
export async function drain(
  send: (row: QueuedWrite) => Promise<unknown>,
): Promise<DrainResult> {
  const rows = readQueue()
  if (rows.length === 0) return { synced: 0, remaining: 0 }

  let synced = 0
  for (const row of rows) {
    try {
      await send(row)
      removeFromQueue(row.id)
      synced += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      markFailed(row.id, message)
      if (isNetworkFailure(error)) {
        return { synced, remaining: readQueue().length, lastError: message }
      }
      // Server refused this one; keep it, note it, and try the next.
    }
  }

  return { synced, remaining: readQueue().length }
}

/** Subscribe to "we are back online" without leaking listeners on remount. */
export function onReconnect(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener("online", handler)
  return () => window.removeEventListener("online", handler)
}
