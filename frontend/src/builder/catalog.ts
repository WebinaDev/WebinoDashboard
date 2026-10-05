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
  variants: ShopVariant[]
  installments: ShopInstallment[]
  faqs: Array<{ question: string; answer: string }>
  priceUpdatedAt?: string | null
}

export type ShopCategory = {
  slug: string
  name: string
  tone: string
}

export const SAMPLE_CATEGORIES: ShopCategory[] = [
  { slug: "skin", name: "مراقبت پوست", tone: "pink" },
  { slug: "hair", name: "مراقبت مو", tone: "lilac" },
  { slug: "wash", name: "شوینده", tone: "sky" },
  { slug: "makeup", name: "آرایش", tone: "rose" },
  { slug: "lip", name: "آرایش لب", tone: "coral" },
  { slug: "eye", name: "آرایش چشم", tone: "navy" },
]


function product(partial: Omit<ShopProduct, "images" | "variants" | "installments" | "inStock" | "live" | "brandSlug"> & Partial<ShopProduct>): ShopProduct {
  return {
    images: [],
    variants: [],
    installments: [],
    faqs: [],
    inStock: true,
    live: false,
    brandSlug: partial.brandSlug || partial.brand,
    ...partial,
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
    variants,
    installments,
    faqs: mapFaqs(raw.faqs),
    priceUpdatedAt: str(raw.price_updated_at) || null,
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
  return { slug, name, tone: SAMPLE_CATEGORIES[index % SAMPLE_CATEGORIES.length].tone }
}
