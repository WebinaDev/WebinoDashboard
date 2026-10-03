export type CartLine = {
  slug: string
  name: string
  price: number
  qty: number
  tone: string
  image?: string | null
  productId?: number
}

const KEY = "webino.ishop.cart"
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

export function cartSnapshot(): CartLine[] {
  return read()
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
  const found = lines.find((item) => item.slug === line.slug)
  if (found) found.qty += qty
  else lines.push({ ...line, qty })
  write(lines)
}

export function setQty(slug: string, qty: number) {
  const lines = read()
    .map((line) => (line.slug === slug ? { ...line, qty } : line))
    .filter((line) => line.qty > 0)
  write(lines)
}

export function clearCart() {
  write([])
}
