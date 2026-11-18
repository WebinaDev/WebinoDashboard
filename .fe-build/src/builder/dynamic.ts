/** Dynamic Tags: a prop value `{ dynamic: { tag, fallback, before, after, key } }` resolved at render time. */

export type DynamicBinding = { tag: string; fallback?: string; before?: string; after?: string; key?: string }
export type DynamicKind = "text" | "image" | "link"

export type DynamicNeed = "product" | "user" | "post"

export const DYNAMIC_TAGS: { tag: string; label: string; kinds: DynamicKind[]; needs?: DynamicNeed; keyed?: boolean }[] = [
  { tag: "product.title", label: "عنوان محصول", kinds: ["text"], needs: "product" },
  { tag: "product.price", label: "قیمت محصول", kinds: ["text"], needs: "product" },
  { tag: "product.image", label: "تصویر محصول", kinds: ["image", "link"], needs: "product" },
  { tag: "product.link", label: "پیوند محصول", kinds: ["link"], needs: "product" },
  { tag: "site.name", label: "نام سایت", kinds: ["text"] },
  { tag: "site.logo", label: "لوگوی سایت", kinds: ["image", "link"] },
  { tag: "user.name", label: "نام کاربر", kinds: ["text"], needs: "user" },
  { tag: "page.title", label: "عنوان صفحه", kinds: ["text"] },
  { tag: "date.current", label: "تاریخ امروز", kinds: ["text"] },
  { tag: "custom.field", label: "فیلد سفارشی", kinds: ["text", "image", "link"], needs: "product", keyed: true },
  { tag: "item.title", label: "عنوان آیتم مجموعه", kinds: ["text"] },
  { tag: "item.slug", label: "نامک آیتم مجموعه", kinds: ["text"] },
  { tag: "item.url", label: "پیوند آیتم مجموعه", kinds: ["link"] },
  { tag: "item.field", label: "فیلد آیتم مجموعه", kinds: ["text", "image", "link"], keyed: true },
  { tag: "item.ref", label: "عنوان آیتم مرتبط (reference)", kinds: ["text"], keyed: true },
  { tag: "item.ref_url", label: "پیوند آیتم مرتبط (reference)", kinds: ["link"], keyed: true },
  { tag: "collection.name", label: "نام مجموعه", kinds: ["text"] },
  { tag: "post.title", label: "عنوان نوشته", kinds: ["text"], needs: "post" },
  { tag: "post.excerpt", label: "خلاصهٔ نوشته", kinds: ["text"], needs: "post" },
  { tag: "post.image", label: "تصویر شاخص نوشته", kinds: ["image", "link"], needs: "post" },
  { tag: "post.date", label: "تاریخ انتشار نوشته", kinds: ["text"], needs: "post" },
  { tag: "post.link", label: "پیوند نوشته", kinds: ["link"], needs: "post" },
  { tag: "post.category", label: "دستهٔ نوشته", kinds: ["text"], needs: "post" },
  { tag: "category.name", label: "دستهٔ جاری (نامک)", kinds: ["text"] },
  { tag: "url.query", label: "پارامتر نشانی (?key=)", kinds: ["text", "link"], keyed: true },
  { tag: "url.path", label: "مسیر صفحه", kinds: ["text", "link"] },
  { tag: "date.year", label: "سال جاری (شمسی)", kinds: ["text"] },
  { tag: "user.email", label: "ایمیل کاربر", kinds: ["text"], needs: "user" },
]

export type DynamicItem = {
  slug: string
  title: string
  data?: Record<string, string>
  refs?: Record<string, { slug: string; title: string; url?: string }[]>
  collection?: { slug: string; name: string }
}

export type DynamicPost = { title?: string; slug?: string; excerpt?: string; image?: string | null; date?: string | null; category?: string }

export type DynamicData = {
  siteName?: string
  logoUrl?: string | null
  pageTitle?: string
  userName?: string
  userEmail?: string
  item?: DynamicItem | null
  post?: DynamicPost | null
  categorySlug?: string
  /** Current location (client) — `url.*` tags. */
  url?: { path: string; search: string } | null
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
export function dynamicNeeds(props: Record<string, unknown>): Record<DynamicNeed, boolean> {
  const needs: Record<DynamicNeed, boolean> = { product: false, user: false, post: false }
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
    case "item.title":
      return data.item?.title ?? ""
    case "item.slug":
      return data.item?.slug ?? ""
    case "item.url":
      return data.item?.collection ? `/c/${encodeURIComponent(data.item.collection.slug)}/${encodeURIComponent(data.item.slug)}` : ""
    case "item.field": {
      const raw = data.item?.data?.[binding.key ?? ""] ?? ""
      // List fields (gallery/multi-reference) resolve to their first entry.
      return raw.split("\n")[0] ?? ""
    }
    case "item.ref":
      return (data.item?.refs?.[binding.key ?? ""] ?? []).map((ref) => ref.title).join("، ")
    case "item.ref_url": {
      const ref = data.item?.refs?.[binding.key ?? ""]?.[0]
      return ref ? ref.url ?? "" : ""
    }
    case "collection.name":
      return data.item?.collection?.name ?? ""
    case "post.title":
      return data.post?.title ?? ""
    case "post.excerpt":
      return data.post?.excerpt ?? ""
    case "post.image":
      return data.post?.image ?? ""
    case "post.link":
      return data.post?.slug ? `/blog/${encodeURIComponent(data.post.slug)}` : ""
    case "post.category":
      return data.post?.category ?? ""
    case "post.date": {
      const d = data.post?.date ? new Date(data.post.date) : null
      return d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long" }).format(d) : ""
    }
    case "category.name":
      return data.categorySlug ?? ""
    case "url.query": {
      const key = binding.key ?? ""
      if (!key || !data.url) return ""
      return (new URLSearchParams(data.url.search).get(key) ?? "").slice(0, 200)
    }
    case "url.path":
      return data.url?.path ?? ""
    case "date.year":
      return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric" }).format(data.now ?? new Date())
    case "user.email":
      return data.userEmail ?? ""
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
