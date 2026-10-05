export type ShopVariant = {
  id: number
  name: string
  price: number
  compare?: number
  image?: string | null
  stock: number | null
  inStock: boolean
}

export type ShopInstallment = {
  months: number
  monthly: number
  total: number
}

export type ShopBrand = {
  slug: string
  name: string
}

export type ShopProduct = {
  id?: number
  slug: string
  name: string
  price: number
  compare?: number
  cashPrice?: number
  tone: string
  category: string
  categorySlug: string
  brand: string
  brandSlug: string
  image?: string | null
  images: string[]
  description: string
  live: boolean
  inStock: boolean
  isNew?: boolean
  variants: ShopVariant[]
  installments: ShopInstallment[]
  faqs: Array<{ question: string; answer: string }>
  priceUpdatedAt?: string | null
  /** Average review score (0–5) when the API exposes it. */
  rating?: number
  /** Simple-product stock count when managed; null = unmanaged. */
  stock?: number | null
}

export type ShopCategory = {
  slug: string
  name: string
  tone: string
  /** Present when the public catalog exposes hierarchy. */
  id?: number
  parentId?: number | null
  image?: string | null
  children?: ShopCategory[]
}

export const SAMPLE_CATEGORIES: ShopCategory[] = [
  {
    slug: "skin",
    name: "مراقبت پوست",
    tone: "pink",
    children: [
      { slug: "sunscreen", name: "کرم ضد آفتاب", tone: "pink" },
      { slug: "serum", name: "سرم پوست", tone: "pink" },
      { slug: "moisturizer", name: "مرطوب‌کننده", tone: "pink" },
      { slug: "eye-cream", name: "کرم دور چشم", tone: "pink" },
      {
        slug: "repair",
        name: "ترمیم‌کننده",
        tone: "pink",
        children: [
          { slug: "repair-gel", name: "ژل ترمیم", tone: "pink" },
          { slug: "repair-cream", name: "کرم ترمیم", tone: "pink" },
        ],
      },
    ],
  },
  {
    slug: "hair",
    name: "مراقبت مو",
    tone: "lilac",
    children: [
      { slug: "shampoo", name: "شامپو", tone: "lilac" },
      { slug: "conditioner", name: "نرم‌کننده", tone: "lilac" },
      { slug: "hair-oil", name: "روغن مو", tone: "lilac" },
      { slug: "hair-mask", name: "ماسک مو", tone: "lilac" },
    ],
  },
  {
    slug: "wash",
    name: "شوینده",
    tone: "sky",
    children: [
      { slug: "face-wash", name: "شوینده صورت", tone: "sky" },
      { slug: "makeup-remover", name: "پاک‌کننده آرایش", tone: "sky" },
      { slug: "toner", name: "تونر", tone: "sky" },
    ],
  },
  {
    slug: "makeup",
    name: "آرایش",
    tone: "rose",
    children: [
      { slug: "lip", name: "آرایش لب", tone: "coral", children: [
        { slug: "lipstick", name: "رژ لب", tone: "coral" },
        { slug: "lipgloss", name: "لیپ‌گلاس", tone: "coral" },
      ]},
      { slug: "eye", name: "آرایش چشم", tone: "navy", children: [
        { slug: "mascara", name: "ریمل", tone: "navy" },
        { slug: "eyeliner", name: "خط چشم", tone: "navy" },
      ]},
      { slug: "face-makeup", name: "آرایش صورت", tone: "rose" },
      { slug: "tools", name: "ابزار آرایشی", tone: "rose" },
    ],
  },
]

/** Build a rooted tree from a flat category list that may carry parentId. */
export function buildCategoryTree(categories: ShopCategory[]): ShopCategory[] {
  const withKids = categories.filter((c) => Array.isArray(c.children) && c.children.length > 0)
  if (withKids.length && withKids.length >= Math.ceil(categories.length / 2)) {
    return withKids.map((c) => ({ ...c, children: c.children ?? [] }))
  }

  const byId = new Map<number, ShopCategory & { children: ShopCategory[] }>()
  const roots: Array<ShopCategory & { children: ShopCategory[] }> = []
  const flat = categories.map((c) => ({ ...c, children: [] as ShopCategory[] }))

  for (const c of flat) {
    if (typeof c.id === "number") byId.set(c.id, c)
  }

  for (const c of flat) {
    const parent = typeof c.parentId === "number" ? byId.get(c.parentId) : undefined
    if (parent && parent !== c) parent.children.push(c)
    else if (c.parentId == null || c.parentId === undefined) roots.push(c)
  }

  if (roots.length) {
    // Drop orphan leaves that were nested under a known parent elsewhere
    const nested = new Set<string>()
    const walk = (nodes: ShopCategory[]) => {
      for (const n of nodes) {
        for (const ch of n.children ?? []) {
          nested.add(ch.slug)
          walk([ch])
        }
      }
    }
    walk(roots)
    return roots.filter((r) => !nested.has(r.slug) || (r.children?.length ?? 0) > 0)
  }

  // Flat API: invent a 2-level layout by grouping leftover leaf categories under the top ones.
  const tops = categories.filter((c) => c.parentId == null || c.parentId === undefined).slice(0, 6)
  if (tops.length <= 1) {
    return categories.map((c, i) => ({
      ...c,
      children: categories.filter((_, j) => j !== i).slice(0, 6).map((ch) => ({ ...ch, children: undefined })),
    }))
  }
  return tops.map((top, i) => ({
    ...top,
    children: categories
      .filter((c) => c.slug !== top.slug)
      .slice(i * 3, i * 3 + 4)
      .map((ch) => ({ ...ch, children: undefined })),
  }))
}


function product(partial: Omit<ShopProduct, "images" | "variants" | "installments" | "faqs" | "inStock" | "live" | "brandSlug"> & Partial<ShopProduct>): ShopProduct {
  return {
    ...partial,
    images: partial.images ?? [],
    variants: partial.variants ?? [],
    installments: partial.installments ?? [],
    faqs: partial.faqs ?? [],
    inStock: partial.inStock ?? true,
    live: partial.live ?? false,
    brandSlug: partial.brandSlug || partial.brand,
  }
}

export const SAMPLE_PRODUCTS: ShopProduct[] = [
  product({
    slug: "lumen-serum",
    name: "سرم درخشان لومِن",
    price: 1860000,
    compare: 2140000,
    tone: "rose",
    category: "مراقبت پوست",
    categorySlug: "skin",
    brand: "لومِن",
    description: "بافت سبک برای پوست خسته شهر. چند قطره قبل از مرطوب‌کننده کافی است.",
  }),
  product({
    slug: "nora-balm",
    name: "بالم لب نورا",
    price: 640000,
    tone: "pink",
    category: "آرایش لب",
    categorySlug: "lip",
    brand: "نورا",
    description: "رنگ ملایم و مراقبت روزانه، بدون چسبندگی.",
  }),
  product({
    slug: "atris-wash",
    name: "ژل شستشوی آتریس",
    price: 890000,
    tone: "mint",
    category: "شوینده",
    categorySlug: "wash",
    brand: "آتریس",
    description: "شوینده ملایم که سد پوست را خشک نمی‌کند.",
  }),
  product({
    slug: "viva-cream",
    name: "کرم سبک ویوا",
    price: 1250000,
    compare: 1490000,
    tone: "lilac",
    category: "مراقبت پوست",
    categorySlug: "skin",
    brand: "ویوا",
    description: "مرطوب‌کننده روز با جذب سریع برای زیر آرایش.",
  }),
  product({
    slug: "kelm-oil",
    name: "روغن مو کَلم",
    price: 980000,
    tone: "gold",
    category: "مراقبت مو",
    categorySlug: "hair",
    brand: "کَلم",
    description: "چند قطره روی طول مو، درخشش بدون سنگینی.",
  }),
  product({
    slug: "webino-mist",
    name: "مه پاش ویبینو",
    price: 540000,
    tone: "sky",
    category: "مراقبت پوست",
    categorySlug: "skin",
    brand: "ویبینو",
    description: "آب‌رسانی وسط روز، مناسب کیف کوچک.",
  }),
]

export const SAMPLE_BRANDS = ["لومِن", "نورا", "آتریس", "ویوا", "کَلم", "ویبینو"]

export function formatPrice(amount: number, currencyLabel?: string): string {
  const formatted = new Intl.NumberFormat("fa-IR").format(Math.max(0, Math.round(amount)))
  return currencyLabel ? `${formatted} ${currencyLabel}` : formatted
}

export function toneClass(tone: string): string {
  switch (tone) {
    case "navy":
      return "from-[#0C2D63] to-[#3d6ea8]"
    case "lilac":
      return "from-[#d9c7f5] to-[#f7f1ff]"
    case "mint":
      return "from-[#c9f0df] to-[#f3fbf7]"
    case "gold":
      return "from-[#f3ddb0] to-[#fff8ea]"
    case "sky":
      return "from-[#d5e7f8] to-[#f5f8fb]"
    case "coral":
      return "from-[#ffc1c8] to-[#fff1f3]"
    case "rose":
      return "from-[#f7c1dc] to-[#fff5fa]"
    default:
      return "from-[#f3b4d4] to-[#fff0f7]"
  }
}

type ApiRecord = Record<string, unknown>

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function mapApiProduct(raw: ApiRecord, index: number): ShopProduct {
  const category = raw.category && typeof raw.category === "object" ? (raw.category as ApiRecord) : null
  const price = num(raw.discounted_price_minor) || num(raw.price_minor)
  const compare = num(raw.price_minor)
  const sample = SAMPLE_PRODUCTS[index % SAMPLE_PRODUCTS.length]
  const brands = Array.isArray(raw.brands) ? raw.brands : []
  const firstBrand = brands.find((item): item is ApiRecord => !!item && typeof item === "object")
  const media = Array.isArray(raw.media) ? raw.media : []
  const images = media
    .filter((item): item is ApiRecord => !!item && typeof item === "object")
    .map((item) => str(item.url))
    .filter(Boolean)
  const cover = str(raw.cover_image_url) || str(raw.image_url)
  if (cover && !images.includes(cover)) images.unshift(cover)
  const variants = (Array.isArray(raw.variants) ? raw.variants : [])
    .filter((item): item is ApiRecord => !!item && typeof item === "object")
    .map(mapVariant)
    .filter((item): item is ShopVariant => item !== null)
  const pricing = raw.pricing && typeof raw.pricing === "object" ? (raw.pricing as ApiRecord) : null
  const types = pricing?.types && typeof pricing.types === "object" ? (pricing.types as ApiRecord) : null
  const installments = Array.isArray(pricing?.installments)
    ? pricing.installments
        .filter((item): item is ApiRecord => !!item && typeof item === "object")
        .map((item) => ({
          months: num(item.months),
          monthly: num(item.monthly_minor),
          total: num(item.total_minor),
        }))
        .filter((item) => item.months > 0 && item.monthly > 0)
    : []
  const soldOut = raw.is_sold_out === true || raw.is_available === false
  return {
    id: num(raw.id) || undefined,
    slug: str(raw.slug) || sample.slug,
    name: str(raw.name) || sample.name,
    price: price || sample.price,
    compare: compare > price ? compare : undefined,
    cashPrice: types && num(types.cash) > 0 ? num(types.cash) : undefined,
    tone: sample.tone,
    category: str(category?.name) || sample.category,
    categorySlug: str(category?.slug) || sample.categorySlug,
    brand: str(firstBrand?.name) || str(raw.brand_name) || sample.brand,
    brandSlug: str(firstBrand?.slug) || sample.brandSlug,
    image: images[0] || null,
    images,
    description: plainText(str(raw.description)) || sample.description,
    live: true,
    inStock: !soldOut,
    isNew: raw.is_new === true,
    variants,
    installments,
    faqs: mapFaqs(raw.faqs),
    priceUpdatedAt: str(raw.price_updated_at) || null,
    rating: num(raw.average_rating) || num(raw.rating_average) || num(raw.rating) || undefined,
    stock: raw.stock == null ? null : num(raw.stock),
  }
}

function mapFaqs(raw: unknown): Array<{ question: string; answer: string }> {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({
      question: str(row.question) || str(row.q),
      answer: str(row.answer) || str(row.a),
    }))
    .filter((row) => row.question && row.answer)
}

function mapVariant(raw: ApiRecord): ShopVariant | null {
  const id = num(raw.id)
  const name = str(raw.name)
  if (!id || !name) return null
  const price = num(raw.sale_price_minor) || num(raw.price_minor)
  const compare = num(raw.price_minor)
  const stock = raw.stock == null ? null : num(raw.stock)
  const status = str(raw.stock_status)
  const inStock = status !== "outofstock" && (stock == null || stock > 0 || raw.manage_stock === false)
  return {
    id,
    name,
    price: price || compare,
    compare: compare > price ? compare : undefined,
    image: str(raw.image_url) || null,
    stock,
    inStock,
  }
}

function plainText(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function mapApiBrand(raw: ApiRecord): ShopBrand | null {
  const name = str(raw.name)
  const slug = str(raw.slug)
  if (!name || !slug) return null
  return { name, slug }
}

export function mapApiCategory(raw: ApiRecord, index: number): ShopCategory | null {
  const name = str(raw.name)
  const slug = str(raw.slug)
  if (!name || !slug) return null
  const id = num(raw.id)
  const parentRaw = raw.parent_id
  const parentId =
    parentRaw === null || parentRaw === undefined || parentRaw === ""
      ? null
      : typeof parentRaw === "number"
        ? parentRaw
        : Number(parentRaw) || null
  const image =
    str(raw.image_url) ||
    str(raw.icon_url) ||
    str(raw.cover_image_url) ||
    str(raw.thumbnail_url) ||
    null
  const nested = Array.isArray(raw.children)
    ? raw.children
        .filter((item): item is ApiRecord => !!item && typeof item === "object")
        .map((item, i) => mapApiCategory(item, i))
        .filter((item): item is ShopCategory => item !== null)
    : undefined
  return {
    slug,
    name,
    tone: SAMPLE_CATEGORIES[index % SAMPLE_CATEGORIES.length].tone,
    id: id || undefined,
    parentId,
    image: image || null,
    children: nested?.length ? nested : undefined,
  }
}
