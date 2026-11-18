export type CartLine = {
  slug: string
  name: string
  price: number
  qty: number
  tone: string
  image?: string | null
  productId?: number
  /** Chosen product variant (size, colour...): lines are unique per product + variant. */
  variantId?: number | null
  variantName?: string | null
  /** Regular price before a sale (struck through when higher than `price`). */
  compare?: number
}

/** Stable key of a local line (product slug + variant). */
export function cartLineKey(line: Pick<CartLine, "slug" | "variantId">): string {
  return line.variantId ? `${line.slug}#v${line.variantId}` : line.slug
}

const KEY = "webino.storefront.cart"
const listeners = new Set<() => void>()

function read(): CartLine[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((line): line is CartLine => {
      if (!line || typeof line !== "object") return false
      const row = line as Partial<CartLine>
      return typeof row.slug === "string" && typeof row.name === "string" && typeof row.price === "number" && typeof row.qty === "number"
    })
  } catch {
    return []
  }
}

function write(lines: CartLine[]) {
  window.localStorage.setItem(KEY, JSON.stringify(lines))
  listeners.forEach((listener) => listener())
}

const EMPTY_CART: CartLine[] = []
let snapshotRaw: string | null | undefined
let snapshotValue: CartLine[] = EMPTY_CART

/**
 * Stable snapshot for useSyncExternalStore: must return the same reference
 * until localStorage actually changes, otherwise React loops (error #185).
 */
export function cartSnapshot(): CartLine[] {
  if (typeof window === "undefined") return EMPTY_CART
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    raw = null
  }
  if (raw !== snapshotRaw) {
    snapshotRaw = raw
    const lines = read()
    snapshotValue = lines.length ? lines : EMPTY_CART
  }
  return snapshotValue
}

/** Server snapshot for useSyncExternalStore (constant reference). */
export function cartServerSnapshot(): CartLine[] {
  return EMPTY_CART
}

export function cartCount(): number {
  return read().reduce((sum, line) => sum + line.qty, 0)
}

export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function addToCart(line: Omit<CartLine, "qty">, qty = 1) {
  const lines = read()
  const key = cartLineKey(line)
  const found = lines.find((item) => cartLineKey(item) === key)
  if (found) found.qty += qty
  else lines.push({ ...line, qty })
  write(lines)
}

/** `key` is a product slug or a `cartLineKey` (slug#v<variant>). */
export function setQty(key: string, qty: number) {
  const lines = read()
    .map((line) => (cartLineKey(line) === key || (line.slug === key && !line.variantId) ? { ...line, qty } : line))
    .filter((line) => line.qty > 0)
  write(lines)
}

export function clearCart() {
  write([])
}
