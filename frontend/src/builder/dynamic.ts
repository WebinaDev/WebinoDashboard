/** Dynamic Tags: a prop value `{ dynamic: { tag, fallback, before, after, key } }` resolved at render time. */

export type DynamicBinding = { tag: string; fallback?: string; before?: string; after?: string; key?: string }
export type DynamicKind = "text" | "image" | "link"

export const DYNAMIC_TAGS: { tag: string; label: string; kinds: DynamicKind[]; needs?: "product" | "user" }[] = [
  { tag: "product.title", label: "عنوان محصول", kinds: ["text"], needs: "product" },
  { tag: "product.price", label: "قیمت محصول", kinds: ["text"], needs: "product" },
  { tag: "product.image", label: "تصویر محصول", kinds: ["image", "link"], needs: "product" },
  { tag: "product.link", label: "پیوند محصول", kinds: ["link"], needs: "product" },
  { tag: "site.name", label: "نام سایت", kinds: ["text"] },
  { tag: "site.logo", label: "لوگوی سایت", kinds: ["image", "link"] },
  { tag: "user.name", label: "نام کاربر", kinds: ["text"], needs: "user" },
  { tag: "page.title", label: "عنوان صفحه", kinds: ["text"] },
  { tag: "date.current", label: "تاریخ امروز", kinds: ["text"] },
  { tag: "custom.field", label: "فیلد سفارشی", kinds: ["text", "image", "link"], needs: "product" },
]

export type DynamicData = {
  siteName?: string
  logoUrl?: string | null
  pageTitle?: string
  userName?: string
  product?: { name?: string; slug?: string; price?: number; image?: string | null } | null
  /** Raw product payload (meta / custom_fields / attributes) plus runtime custom fields. */
  custom?: Record<string, unknown>
  now?: Date
}

export function isDynamic(value: unknown): value is { dynamic: DynamicBinding } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const binding = (value as { dynamic?: unknown }).dynamic
  return Boolean(binding && typeof binding === "object" && typeof (binding as { tag?: unknown }).tag === "string")
}

/** Which data sources a widget's props need (so product/user fetches only happen when bound). */
export function dynamicNeeds(props: Record<string, unknown>): { product: boolean; user: boolean } {
  const needs = { product: false, user: false }
  for (const value of Object.values(props)) {
    if (!isDynamic(value)) continue
    const need = DYNAMIC_TAGS.find((item) => item.tag === value.dynamic.tag)?.needs
    if (need) needs[need] = true
  }
  return needs
}

function lookup(source: Record<string, unknown> | undefined, key: string): string {
  if (!source || !key) return ""
  const containers = [source, source.custom_fields, source.meta, source.attributes]
  for (const box of containers) {
    if (!box) continue
    if (Array.isArray(box)) {
      const hit = box.find((row) => row && typeof row === "object" && ((row as Record<string, unknown>).key === key || (row as Record<string, unknown>).name === key))
      const v = hit ? (hit as Record<string, unknown>).value : undefined
      if (typeof v === "string" || typeof v === "number") return String(v)
    } else if (typeof box === "object") {
      const v = (box as Record<string, unknown>)[key]
      if (typeof v === "string" || typeof v === "number") return String(v)
    }
  }
  return ""
}

export function resolveTag(binding: DynamicBinding, data: DynamicData): string {
  const product = data.product ?? null
  switch (binding.tag) {
    case "product.title":
      return product?.name ?? ""
    case "product.price":
      return typeof product?.price === "number" && product.price > 0 ? `${new Intl.NumberFormat("fa-IR").format(product.price)} تومان` : ""
    case "product.image":
      return product?.image ?? ""
    case "product.link":
      return product?.slug ? `/product/${encodeURIComponent(product.slug)}` : ""
    case "site.name":
      return data.siteName ?? ""
    case "site.logo":
      return data.logoUrl ?? ""
    case "user.name":
      return data.userName ?? ""
    case "page.title":
      return data.pageTitle ?? ""
    case "date.current":
      return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long" }).format(data.now ?? new Date())
    case "custom.field":
      return lookup(data.custom, binding.key ?? "")
    default:
      return ""
  }
}

export function resolveValue(binding: DynamicBinding, data: DynamicData): string {
  const value = resolveTag(binding, data)
  if (!value) return binding.fallback ?? ""
  return `${binding.before ?? ""}${value}${binding.after ?? ""}`
}

/** Replace every bound prop with its resolved string; unbound props pass through untouched. */
export function resolveProps(props: Record<string, unknown>, data: DynamicData): Record<string, unknown> {
  let changed = false
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (isDynamic(value)) {
      out[key] = resolveValue(value.dynamic, data)
      changed = true
    } else out[key] = value
  }
  return changed ? out : props
}
