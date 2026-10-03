export type ShopProduct = {
  slug: string
  name: string
  price: number
  compare?: number
  tone: string
  category: string
  categorySlug: string
  brand: string
  image?: string | null
  description: string
  live: boolean
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

export const SAMPLE_PRODUCTS: ShopProduct[] = [
  {
    slug: "lumen-serum",
    name: "سرم درخشان لومِن",
    price: 1860000,
    compare: 2140000,
    tone: "rose",
    category: "مراقبت پوست",
    categorySlug: "skin",
    brand: "لومِن",
    description: "بافت سبک برای پوست خسته شهر. چند قطره قبل از مرطوب‌کننده کافی است.",
    live: false,
  },
  {
    slug: "nora-balm",
    name: "بالم لب نورا",
    price: 640000,
    tone: "pink",
    category: "آرایش لب",
    categorySlug: "lip",
    brand: "نورا",
    description: "رنگ ملایم و مراقبت روزانه، بدون چسبندگی.",
    live: false,
  },
  {
    slug: "atris-wash",
    name: "ژل شستشوی آتریس",
    price: 890000,
    tone: "mint",
    category: "شوینده",
    categorySlug: "wash",
    brand: "آتریس",
    description: "شوینده ملایم که سد پوست را خشک نمی‌کند.",
    live: false,
  },
  {
    slug: "viva-cream",
    name: "کرم سبک ویوا",
    price: 1250000,
    compare: 1490000,
    tone: "lilac",
    category: "مراقبت پوست",
    categorySlug: "skin",
    brand: "ویوا",
    description: "مرطوب‌کننده روز با جذب سریع برای زیر آرایش.",
    live: false,
  },
  {
    slug: "kelm-oil",
    name: "روغن مو کَلم",
    price: 980000,
    tone: "gold",
    category: "مراقبت مو",
    categorySlug: "hair",
    brand: "کَلم",
    description: "چند قطره روی طول مو، درخشش بدون سنگینی.",
    live: false,
  },
  {
    slug: "webino-mist",
    name: "مه پاش ویبینو",
    price: 540000,
    tone: "sky",
    category: "مراقبت پوست",
    categorySlug: "skin",
    brand: "ویبینو",
    description: "آب‌رسانی وسط روز، مناسب کیف کوچک.",
    live: false,
  },
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
  return {
    slug: str(raw.slug) || sample.slug,
    name: str(raw.name) || sample.name,
    price: price || sample.price,
    compare: compare > price ? compare : undefined,
    tone: sample.tone,
    category: str(category?.name) || sample.category,
    categorySlug: str(category?.slug) || sample.categorySlug,
    brand: str(raw.brand_name) || sample.brand,
    image: str(raw.cover_image_url) || str(raw.image_url) || null,
    description: str(raw.description) || sample.description,
    live: true,
  }
}

export function mapApiCategory(raw: ApiRecord, index: number): ShopCategory | null {
  const name = str(raw.name)
  const slug = str(raw.slug)
  if (!name || !slug) return null
  return { slug, name, tone: SAMPLE_CATEGORIES[index % SAMPLE_CATEGORIES.length].tone }
}
