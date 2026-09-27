import { ApiError, api } from "@/lib/api"

export type ProductVariantHit = {
  id: number
  name: string
  sku?: string | null
  price_minor?: number
}

export type ProductHit = {
  id: number
  name: string
  sku?: string | null
  price_minor?: number
  variants?: ProductVariantHit[]
}

export type PosCartLine = {
  lineKey: string
  product_id: number
  product_variant_id?: number | null
  name: string
  qty: number
  unit_price_minor: number
  purchase_type?: string
}

export const POS_PURCHASE_TYPES = ["cash", "credit", "installment", "wholesale"] as const

export const POS_SALES_CHANNELS = [
  "in_store",
  "phone",
  "bale",
  "eitaa",
  "rubika",
  "telegram",
  "instagram",
  "other",
  "online",
] as const

export const POS_PAYMENT_TENDERS = ["cash", "card_to_card", "pos_terminal", "online", "wallet", "other"] as const

export function displayPurchaseType(value: string): string {
  return value === "retail" ? "cash" : value
}

export function purchaseTypeForSave(value: string): string {
  return value === "retail" ? "cash" : value
}

export function lineKey(productId: number, variantId?: number | null): string {
  return `${productId}:${variantId ?? 0}`
}

export async function searchPosProducts(q: string): Promise<ProductHit[]> {
  try {
    return await api<ProductHit[]>(`/api/v1/products/pos-search?q=${encodeURIComponent(q)}`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      return api<ProductHit[]>(`/api/v1/products?search=${encodeURIComponent(q)}&per_page=20`)
    }
    throw e
  }
}

export type GeoState = { code: string; name: string }

export async function fetchGeoStates(): Promise<GeoState[]> {
  const res = await api<{ states: GeoState[] }>("/api/v1/public/geo/states")
  return res.states ?? []
}

export async function fetchGeoCities(stateCode: string): Promise<string[]> {
  const res = await api<{ cities: { name: string }[] }>(
    `/api/v1/public/geo/cities?state=${encodeURIComponent(stateCode)}`,
  )
  return (res.cities ?? []).map((c) => c.name)
}

export type StructuredAddress = {
  province_code?: string
  city?: string
  plaque?: string
  unit?: string
  postcode?: string
  address?: string
}

export function parseStructuredAddress(raw: unknown): StructuredAddress {
  if (!raw || typeof raw !== "object") return {}
  const o = raw as Record<string, unknown>
  return {
    province_code: String(o.province_code ?? o.state ?? ""),
    city: typeof o.city === "string" ? o.city : "",
    plaque: typeof o.plaque === "string" ? o.plaque : "",
    unit: typeof o.unit === "string" ? o.unit : "",
    postcode: typeof o.postcode === "string" ? o.postcode : "",
    address: typeof o.address === "string" ? o.address : typeof o.address_1 === "string" ? o.address_1 : "",
  }
}

export function buildShippingAddress(fields: StructuredAddress): Record<string, string> {
  const parts = [fields.address, fields.plaque ? `پلاک ${fields.plaque}` : "", fields.unit ? `واحد ${fields.unit}` : ""]
    .map((x) => x?.trim())
    .filter(Boolean)
  return {
    province_code: fields.province_code?.trim() ?? "",
    state: fields.province_code?.trim() ?? "",
    city: fields.city?.trim() ?? "",
    plaque: fields.plaque?.trim() ?? "",
    unit: fields.unit?.trim() ?? "",
    postcode: fields.postcode?.trim() ?? "",
    address: parts.join(" · "),
    address_1: parts.join(" · "),
  }
}
