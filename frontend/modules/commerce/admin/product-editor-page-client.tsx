"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"

import { useConfirm } from "@/components/ConfirmDialog"
import { SimpleSeoFields } from "@/components/seo/SimpleSeoFields"
import { MediaPickerDialog } from "@/components/content/MediaPickerDialog"
import { RichTextEditor } from "@/components/content/RichTextEditor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ProductMarketplaceTab } from "./product-marketplace-tab"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PageShell } from "@/components/PageShell"
import { PrintProductLabelButton } from "@/components/products/PrintProductLabelButton"
import { useDashboardNav } from "@/hooks/useDashboardNav"
import { isSubmoduleEnabled } from "@/kernel/route-resolver"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { useEnumLabel } from "@/lib/enum-labels"
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"

type TabId = "content" | "seo" | "pricing" | "attributes" | "downloads" | "coffee" | "marketplace" | "advanced"

type LookupTerm = { id: number; name: string; slug?: string }
type LookupAttr = {
  id: number
  name: string
  type?: string
  show_swatch_label?: boolean
  terms?: Array<LookupTerm & { color?: string | null; image_url?: string | null }>
}
type AttributeGroup = { id: number; name: string; attribute_ids?: number[] | null }
type ProductListHit = { id: number; name: string; sku?: string | null }
type Lookup = {
  permalink_base?: string
  site_url?: string
  ishop_labels: Array<{ key: string; label: string }>
  categories: Array<{ id: number; name: string; parent_id?: number | null }>
  brands: Array<{ id: number; name: string }>
  tags: Array<{ id: number; name: string }>
  attributes: LookupAttr[]
  products?: Array<{ id: number; name: string; sku?: string | null }>
}

type ProductAttrPivot = {
  id: number
  pivot?: { is_visible?: boolean; is_variation?: boolean; position?: number; term_ids?: number[] }
  is_visible?: boolean
  is_variation?: boolean
  position?: number
  term_ids?: number[]
}

type Variant = {
  id: number
  name: string
  sku?: string | null
  price_minor: number
  purchase_price_minor?: number | null
  stock?: number | null
  image_url?: string | null
  wholesale_rule?: Record<string, unknown> | null
  is_default?: boolean
}

type CoffeeVariantWeightRow = {
  variation_id: number
  name: string
  weight_g?: number | null
  purchase_price_minor?: number
  price_minor?: number
  calculated_retail?: number | null
}

type CoffeeProfile = {
  blend_robusta?: number
  blend_arabica?: number
  caffeine_mg?: number | null
  bitterness?: number | null
  sweetness?: number | null
  body?: number | null
  pack_weight_g?: number | null
  price_mode?: string
  origin_ids?: number[] | null
  visible?: Record<string, boolean>
  variant_weight_rows?: CoffeeVariantWeightRow[]
}

type WholesaleTier = { min_qty: number; discount_percent: number }

type Product = {
  id: number
  name: string
  permalink?: string | null
  english_name?: string | null
  slug?: string | null
  short_description?: string | null
  description?: string | null
  image_url?: string | null
  gallery?: string[] | null
  video_url?: string | null
  video_cover_url?: string | null
  type?: string
  status?: string
  catalog_visibility?: string
  sku?: string | null
  is_featured?: boolean
  meta?: Record<string, unknown> | null
  related_ids?: number[] | null
  upsell_ids?: number[] | null
  cross_sell_ids?: number[] | null
  category_ids?: number[]
  categories?: Array<{ id: number }>
  brand_ids?: number[]
  brands?: Array<{ id: number }>
  tags?: Array<{ id: number; name: string }>
  purchase_price_minor?: number | null
  lock_price?: boolean
  price_minor: number
  sale_price_minor?: number | null
  wholesale_rule?: Record<string, unknown> | null
  reference_url?: string | null
  stock?: number | null
  manage_stock?: boolean
  backorders?: string
  stock_status?: string
  reference_source?: string | null
  reference_last_sync?: string | null
  platform_prices?: Record<string, unknown> | null
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
  calculated?: { retail?: number; credit?: number; wholesale?: number; installment?: number }
  attributes?: ProductAttrPivot[]
  variants?: Variant[]
  labels?: string[] | null
  custom_labels?: string[] | null
  shipping_time?: number | null
  initial_stock_quantity?: number | null
  ai_review_summary?: string | null
  faqs?: Array<{ q?: string; a?: string; question?: string; answer?: string }> | null
}

type FormState = {
  name: string
  english_name: string
  slug: string
  short_description: string
  description: string
  image_url: string
  gallery_text: string
  video_url: string
  video_cover_url: string
  type: "simple" | "variable" | "downloadable" | "grouped" | "external"
  status: string
  catalog_visibility: string
  backorders: string
  sku: string
  is_featured: boolean
  category_ids: number[]
  brand_ids: number[]
  tag_names: string
  seo_title: string
  seo_description: string
  seo_keyword: string
  seo_robots: string
  seo_og_title: string
  seo_og_image: string
  wholesale_mode: "simple" | "tiers"
  wholesale_min_qty: string
  wholesale_discount_percent: string
  wholesale_tiers: WholesaleTier[]
  related_ids: number[]
  upsell_ids: number[]
  cross_sell_ids: number[]
  purchase_price_minor: number
  lock_price: boolean
  price_minor: number
  sale_price_minor: string
  reference_url: string
  stock: number
  manage_stock: boolean
  stock_status: string
  weight: string
  length: string
  width: string
  height: string
  labels: string[]
  custom_labels_text: string
  shipping_time: string
  initial_stock_quantity: string
  ai_review_summary: string
  faqs_text: string
}

type AttrAssign = {
  id: number
  is_visible: boolean
  is_variation: boolean
  position: number
  term_ids: number[]
  custom_options: string[]
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
const TABS: TabId[] = ["content", "seo", "pricing", "attributes", "downloads", "coffee", "marketplace", "advanced"]
const SWATCH_TYPES = new Set(["color", "image", "button"])

const emptyForm: FormState = {
  name: "",
  english_name: "",
  slug: "",
  short_description: "",
  description: "",
  image_url: "",
  gallery_text: "",
  video_url: "",
  video_cover_url: "",
  type: "simple",
  status: "draft",
  catalog_visibility: "visible",
  backorders: "no",
  sku: "",
  is_featured: false,
  category_ids: [],
  brand_ids: [],
  tag_names: "",
  seo_title: "",
  seo_description: "",
  seo_keyword: "",
  seo_robots: "index",
  seo_og_title: "",
  seo_og_image: "",
  wholesale_mode: "simple",
  wholesale_min_qty: "",
  wholesale_discount_percent: "",
  wholesale_tiers: [],
  related_ids: [],
  upsell_ids: [],
  cross_sell_ids: [],
  purchase_price_minor: 0,
  lock_price: false,
  price_minor: 0,
  sale_price_minor: "",
  reference_url: "",
  stock: 0,
  manage_stock: true,
  stock_status: "instock",
  weight: "",
  length: "",
  width: "",
  height: "",
  labels: [],
  custom_labels_text: "",
  shipping_time: "",
  initial_stock_quantity: "",
  ai_review_summary: "",
  faqs_text: "",
}

function wholesaleFromRule(rule: Record<string, unknown> | null | undefined): Pick<
  FormState,
  "wholesale_mode" | "wholesale_min_qty" | "wholesale_discount_percent" | "wholesale_tiers"
> {
  if (!rule || typeof rule !== "object") {
    return { wholesale_mode: "simple", wholesale_min_qty: "", wholesale_discount_percent: "", wholesale_tiers: [] }
  }
  const tiersRaw = rule.tiers
  if (Array.isArray(tiersRaw) && tiersRaw.length) {
    const tiers = tiersRaw
      .map((row) => {
        const r = row as Record<string, unknown>
        return {
          min_qty: Number(r.min_qty) || 0,
          discount_percent: Number(r.discount_percent) || 0,
        }
      })
      .filter((t) => t.min_qty > 0)
    return {
      wholesale_mode: "tiers",
      wholesale_min_qty: "",
      wholesale_discount_percent: "",
      wholesale_tiers: tiers.length ? tiers : [{ min_qty: 2, discount_percent: 5 }],
    }
  }
  return {
    wholesale_mode: "simple",
    wholesale_min_qty: rule.min_qty != null ? String(rule.min_qty) : "",
    wholesale_discount_percent: rule.discount_percent != null ? String(rule.discount_percent) : "",
    wholesale_tiers: [],
  }
}

function buildWholesaleRule(form: FormState): Record<string, unknown> | null {
  if (form.wholesale_mode === "tiers") {
    const tiers = form.wholesale_tiers
      .map((t) => ({
        min_qty: Number(t.min_qty) || 0,
        discount_percent: Number(t.discount_percent) || 0,
      }))
      .filter((t) => t.min_qty > 0 && t.discount_percent >= 0)
    return tiers.length ? { tiers } : null
  }
  const min_qty = Number(form.wholesale_min_qty)
  const discount_percent = Number(form.wholesale_discount_percent)
  if (!min_qty && !discount_percent) return null
  return { min_qty: min_qty || 0, discount_percent: discount_percent || 0 }
}

function productToForm(p: Product): FormState {
  const gallery = Array.isArray(p.gallery) ? p.gallery.map(String) : []
  const faqs = Array.isArray(p.faqs) ? p.faqs : []
  const meta = (p.meta ?? {}) as Record<string, unknown>
  const wholesale = wholesaleFromRule(p.wholesale_rule ?? null)
  return {
    name: p.name ?? "",
    english_name: p.english_name ?? "",
    slug: p.slug ?? "",
    short_description: p.short_description ?? "",
    description: p.description ?? "",
    image_url: p.image_url ?? "",
    gallery_text: gallery.join("\n"),
    video_url: p.video_url ?? "",
    video_cover_url: p.video_cover_url ?? "",
    type: (p.type as FormState["type"]) || "simple",
    status: p.status === "trash" ? "draft" : (p.status ?? "draft"),
    catalog_visibility: p.catalog_visibility ?? "visible",
    backorders: p.backorders ?? "no",
    sku: p.sku ?? "",
    is_featured: Boolean(p.is_featured),
    category_ids: p.category_ids ?? p.categories?.map((c) => c.id) ?? [],
    brand_ids: p.brand_ids ?? p.brands?.map((b) => b.id) ?? [],
    tag_names: (p.tags ?? []).map((t) => t.name).join(", "),
    seo_title: String(meta.seo_title ?? ""),
    seo_description: String(meta.seo_description ?? ""),
    seo_keyword: String(meta.seo_keyword ?? ""),
    seo_robots: String(meta.seo_robots ?? "index"),
    seo_og_title: String(meta.seo_og_title ?? ""),
    seo_og_image: String(meta.seo_og_image ?? ""),
    ...wholesale,
    related_ids: Array.isArray(p.related_ids) ? p.related_ids.map(Number) : [],
    upsell_ids: Array.isArray(p.upsell_ids) ? p.upsell_ids.map(Number) : [],
    cross_sell_ids: Array.isArray(p.cross_sell_ids) ? p.cross_sell_ids.map(Number) : [],
    purchase_price_minor: p.purchase_price_minor ?? 0,
    lock_price: Boolean(p.lock_price),
    price_minor: p.price_minor ?? 0,
    sale_price_minor: p.sale_price_minor != null ? String(p.sale_price_minor) : "",
    reference_url: p.reference_url ?? "",
    stock: p.stock ?? 0,
    manage_stock: p.manage_stock ?? true,
    stock_status: p.stock_status ?? "instock",
    weight: p.weight != null ? String(p.weight) : "",
    length: p.length != null ? String(p.length) : "",
    width: p.width != null ? String(p.width) : "",
    height: p.height != null ? String(p.height) : "",
    labels: Array.isArray(p.labels) ? p.labels.map(String) : [],
    custom_labels_text: Array.isArray(p.custom_labels) ? p.custom_labels.map(String).join("\n") : "",
    shipping_time: p.shipping_time != null ? String(p.shipping_time) : "",
    initial_stock_quantity: p.initial_stock_quantity != null ? String(p.initial_stock_quantity) : "",
    ai_review_summary: p.ai_review_summary ?? "",
    faqs_text: faqs
      .map((f) => `${f.q ?? f.question ?? ""}|${f.a ?? f.answer ?? ""}`)
      .join("\n"),
  }
}

function toggleId(list: number[], id: number) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

function parseTermIds(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map(Number).filter(Boolean)
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : []
    } catch {
      return []
    }
  }
  return []
}

function parseCustomOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
    } catch {
      return []
    }
  }
  return []
}

function moveGalleryUrl(urls: string[], index: number, dir: -1 | 1): string[] {
  const next = index + dir
  if (next < 0 || next >= urls.length) return urls
  const copy = [...urls]
  ;[copy[index], copy[next]] = [copy[next], copy[index]]
  return copy
}

function reorderAttrAssigns(list: AttrAssign[], id: number, dir: -1 | 1): AttrAssign[] {
  const sorted = [...list].sort((a, b) => a.position - b.position)
  const idx = sorted.findIndex((a) => a.id === id)
  if (idx < 0) return list
  const swap = idx + dir
  if (swap < 0 || swap >= sorted.length) return list
  const a = sorted[idx]
  const b = sorted[swap]
  return list.map((row) => {
    if (row.id === a.id) return { ...row, position: b.position }
    if (row.id === b.id) return { ...row, position: a.position }
    return row
  })
}

export default function ProductEditorPageClient({ route }: { route: ResolvedAdminRoute }) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const enumLabel = useEnumLabel()
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const { activations } = useDashboardNav()
  const coffeeEnabled = isSubmoduleEnabled(activations, "coffee-profile", "profile")
  const marketplaceEnabled = isSubmoduleEnabled(activations, "commerce", "marketplace")
  const aiEnabled = isSubmoduleEnabled(activations, "ai-content", "studio")

  const rawId = route.params?.productId
  const isNew = !rawId || rawId === "new"
  const productId = isNew ? null : rawId

  const [tab, setTab] = useState<TabId>("content")
  const [form, setForm] = useState<FormState>(emptyForm)
  const [attrAssigns, setAttrAssigns] = useState<AttrAssign[]>([])
  const [coffee, setCoffee] = useState<CoffeeProfile>({})
  const [variantName, setVariantName] = useState("")
  const [variantPrice, setVariantPrice] = useState(0)
  const [calculated, setCalculated] = useState<Product["calculated"]>()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false)
  const [slugEditing, setSlugEditing] = useState(false)
  const [tagInput, setTagInput] = useState("")
  const [catFilter, setCatFilter] = useState("")
  const [attrGroupFilter, setAttrGroupFilter] = useState<number | "all">("all")
  const [customOptionDraft, setCustomOptionDraft] = useState<Record<number, string>>({})
  const [variantPreview, setVariantPreview] = useState<{ count: number; preview: Array<{ name: string }> } | null>(
    null,
  )
  const [bulkVariantIds, setBulkVariantIds] = useState<number[]>([])
  const [bulkPrice, setBulkPrice] = useState("")
  const [bulkStock, setBulkStock] = useState("")
  const [bulkPurchase, setBulkPurchase] = useState("")

  const { data: lookup } = useQuery({
    queryKey: ["products-lookup"],
    queryFn: () => api<Lookup>("/api/v1/products/lookup"),
  })

  const { data: product, isLoading } = useQuery({
    queryKey: ["admin-product", productId],
    enabled: Boolean(productId),
    queryFn: () => api<Product>(`/api/v1/products/${productId}`),
  })

  const { data: attrGroups = [] } = useQuery({
    queryKey: ["attribute-groups"],
    queryFn: () => api<AttributeGroup[]>("/api/v1/attribute-groups"),
  })

  const { data: variants = [], refetch: refetchVariants } = useQuery({
    queryKey: ["admin-product-variants", productId],
    enabled: Boolean(productId),
    queryFn: () => api<Variant[]>(`/api/v1/products/${productId}/variants`),
  })

  useEffect(() => {
    if (!product) return
    setForm(productToForm(product))
    setCalculated(product.calculated)
    const assigns: AttrAssign[] = (product.attributes ?? []).map((a, idx) => ({
      id: a.id,
      is_visible: Boolean(a.pivot?.is_visible ?? a.is_visible ?? true),
      is_variation: Boolean(a.pivot?.is_variation ?? a.is_variation ?? false),
      position: a.pivot?.position ?? a.position ?? idx,
      term_ids: parseTermIds(a.pivot?.term_ids ?? a.term_ids ?? []),
      custom_options: parseCustomOptions(
        (a.pivot as { custom_options?: unknown } | undefined)?.custom_options ??
          (a as { custom_options?: unknown }).custom_options,
      ),
    }))
    setAttrAssigns(assigns.sort((x, y) => x.position - y.position))
  }, [product])

  const hasVariants = variants.length > 0 || (product?.variants?.length ?? 0) > 0

  useEffect(() => {
    if (!productId || !coffeeEnabled || tab !== "coffee") return
    api<CoffeeProfile>(`/api/v1/products/${productId}/coffee-profile`)
      .then(setCoffee)
      .catch((e: Error) => setError(getApiErrorMessage(e)))
  }, [productId, coffeeEnabled, tab])

  const payload = useMemo(() => {
    const gallery = form.gallery_text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
    const faqs = form.faqs_text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [q, ...rest] = line.split("|")
        return { q: q?.trim() ?? "", a: rest.join("|").trim() }
      })
    return {
      name: form.name,
      english_name: form.english_name || null,
      slug: form.slug || undefined,
      short_description: form.short_description || null,
      description: form.description || null,
      image_url: form.image_url || null,
      gallery: gallery.length ? gallery : null,
      video_url: form.video_url || null,
      video_cover_url: form.video_cover_url || null,
      type: form.type,
      status: form.status,
      catalog_visibility: form.catalog_visibility,
      sku: form.sku || null,
      is_featured: form.is_featured,
      category_ids: form.category_ids,
      brand_ids: form.brand_ids,
      tag_names: form.tag_names
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      meta: {
        seo_title: form.seo_title || undefined,
        seo_description: form.seo_description || undefined,
        seo_keyword: form.seo_keyword || undefined,
        seo_robots: form.seo_robots || undefined,
        seo_og_title: form.seo_og_title || undefined,
        seo_og_image: form.seo_og_image || undefined,
      },
      related_ids: form.related_ids,
      upsell_ids: form.upsell_ids,
      cross_sell_ids: form.cross_sell_ids,
      purchase_price_minor: Number(form.purchase_price_minor) || 0,
      lock_price: form.lock_price,
      price_minor: form.type === "variable" ? undefined : Number(form.price_minor) || 0,
      sale_price_minor:
        form.type === "variable"
          ? undefined
          : form.sale_price_minor === ""
            ? null
            : Number(form.sale_price_minor),
      wholesale_rule: buildWholesaleRule(form),
      stock: form.type === "variable" ? undefined : Number(form.stock) || 0,
      manage_stock: form.type === "variable" ? undefined : form.manage_stock,
      backorders: form.type === "variable" ? undefined : form.backorders,
      stock_status: form.type === "variable" ? undefined : form.stock_status,
      weight: form.weight === "" ? null : Number(form.weight),
      length: form.length === "" ? null : Number(form.length),
      width: form.width === "" ? null : Number(form.width),
      height: form.height === "" ? null : Number(form.height),
      labels: form.labels,
      custom_labels: form.custom_labels_text
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      shipping_time: form.shipping_time === "" ? null : Number(form.shipping_time),
      initial_stock_quantity:
        form.initial_stock_quantity === "" ? null : Number(form.initial_stock_quantity),
      ai_review_summary: form.ai_review_summary || null,
      faqs: faqs.length ? faqs : null,
    }
  }, [form])

  const save = useMutation({
    mutationFn: async () => {
      let row: Product
      if (isNew) {
        row = await api<Product>("/api/v1/products", { method: "POST", json: payload })
      } else {
        row = await api<Product>(`/api/v1/products/${productId}`, { method: "PATCH", json: payload })
        if (productId && attrAssigns.length >= 0) {
          await api(`/api/v1/products/${productId}/attributes`, {
            method: "PUT",
            json: { attributes: attrAssigns },
          })
        }
      }
      return row
    },
    onSuccess: async (row) => {
      setMessage(t("saved"))
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] })
      if (isNew && row?.id) window.location.assign(`/dashboard/products/${row.id}`)
      else if (productId) await queryClient.invalidateQueries({ queryKey: ["admin-product", productId] })
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const wfcp = useMutation({
    mutationFn: () =>
      api<Product>(`/api/v1/products/${productId}/wfcp`, {
        method: "PATCH",
        json: {
          purchase_price_minor: Number(form.purchase_price_minor) || 0,
          lock_price: form.lock_price,
          wholesale_rule: buildWholesaleRule(form),
        },
      }),
    onSuccess: (row) => {
      setCalculated(row.calculated)
      if (row.price_minor != null) setForm((f) => ({ ...f, price_minor: row.price_minor }))
      setMessage(t("wfcp_updated"))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const referenceFetch = useMutation({
    mutationFn: () =>
      api<{ purchase_price_minor: number | null; price_minor: number }>(
        `/api/v1/pricing/products/${productId}/reference-fetch`,
        { method: "POST", json: { url: form.reference_url || null } },
      ),
    onSuccess: (r) => {
      setForm((f) => ({
        ...f,
        purchase_price_minor: r.purchase_price_minor ?? f.purchase_price_minor,
        price_minor: r.price_minor ?? f.price_minor,
      }))
      setMessage(t("reference_synced"))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const syncAttrs = useMutation({
    mutationFn: () =>
      api(`/api/v1/products/${productId}/attributes`, {
        method: "PUT",
        json: { attributes: attrAssigns },
      }),
    onSuccess: () => setMessage(t("attrs_synced")),
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const createVariant = useMutation({
    mutationFn: () =>
      api(`/api/v1/products/${productId}/variants`, {
        method: "POST",
        json: { name: variantName, price_minor: Number(variantPrice) || 0 },
      }),
    onSuccess: async () => {
      setVariantName("")
      setVariantPrice(0)
      await refetchVariants()
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const purchaseBlurSave = useMutation({
    mutationFn: async () => {
      if (!productId) return
      try {
        return await api<Product>(`/api/v1/products/${productId}/wfcp`, {
          method: "PATCH",
          json: {
            purchase_price_minor: Number(form.purchase_price_minor) || 0,
            lock_price: form.lock_price,
            wholesale_rule: buildWholesaleRule(form),
          },
        })
      } catch {
        return api<Product>(`/api/v1/products/${productId}`, {
          method: "PATCH",
          json: { purchase_price_minor: Number(form.purchase_price_minor) || 0 },
        })
      }
    },
    onSuccess: (row) => {
      if (!row) return
      setCalculated(row.calculated)
      if (row.price_minor != null) setForm((f) => ({ ...f, price_minor: row.price_minor }))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const trashProduct = useMutation({
    mutationFn: () => api(`/api/v1/products/${productId}`, { method: "DELETE" }),
    onSuccess: () => {
      window.location.assign("/dashboard/products")
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const generateVariants = useMutation({
    mutationFn: (opts?: { dryRun?: boolean }) => {
      const axes = attrAssigns
        .filter((a) => a.is_variation && a.term_ids.length)
        .map((a) => {
          const meta = lookup?.attributes.find((x) => x.id === a.id)
          return {
            attribute_id: a.id,
            attribute_name: meta?.name,
            terms: a.term_ids.map((tid) => {
              const term = meta?.terms?.find((x) => x.id === tid)
              return { id: tid, name: term?.name ?? String(tid) }
            }),
          }
        })
      return api<{ count?: number; preview?: Array<{ name: string }> } | unknown[]>(
        `/api/v1/products/${productId}/variations/generate`,
        {
          method: "POST",
          json: { axes, dry_run: opts?.dryRun ?? false },
        },
      )
    },
    onSuccess: async (data, vars) => {
      if (vars?.dryRun) {
        const payload = data as { count?: number; preview?: Array<{ name: string }> }
        setVariantPreview({
          count: payload.count ?? payload.preview?.length ?? 0,
          preview: payload.preview ?? [],
        })
        return
      }
      setVariantPreview(null)
      setForm((f) => ({ ...f, type: "variable" }))
      await refetchVariants()
      setMessage(t("variants_generated"))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const destroyAllVariants = useMutation({
    mutationFn: () => api(`/api/v1/products/${productId}/variations`, { method: "DELETE" }),
    onSuccess: async () => {
      setBulkVariantIds([])
      await refetchVariants()
      setMessage(t("variants_cleared"))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const bulkVariants = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { ids: bulkVariantIds }
      if (bulkPrice !== "") body.price_minor = Number(bulkPrice) || 0
      if (bulkStock !== "") body.stock = Number(bulkStock)
      if (bulkPurchase !== "") body.purchase_price_minor = Number(bulkPurchase) || 0
      return api(`/api/v1/products/${productId}/variations/bulk`, { method: "POST", json: body })
    },
    onSuccess: async () => {
      await refetchVariants()
      setMessage(t("saved"))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const setDefaultVariant = useMutation({
    mutationFn: (variantId: number) =>
      api(`/api/v1/products/${productId}/variations/default`, {
        method: "POST",
        json: { variant_id: variantId },
      }),
    onSuccess: async () => {
      await refetchVariants()
      setMessage(t("default_variant_set"))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const deleteVariant = useMutation({
    mutationFn: (id: number) => api(`/api/v1/variants/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refetchVariants()
    },
  })

  const updateVariant = useMutation({
    mutationFn: (body: {
      id: number
      price_minor?: number
      sku?: string
      stock?: number | null
      purchase_price_minor?: number | null
      image_url?: string | null
      wholesale_rule?: Record<string, unknown> | null
    }) =>
      api(`/api/v1/variants/${body.id}`, {
        method: "PATCH",
        json: {
          price_minor: body.price_minor,
          sku: body.sku,
          stock: body.stock,
          purchase_price_minor: body.purchase_price_minor,
          image_url: body.image_url,
          wholesale_rule: body.wholesale_rule,
        },
      }),
    onSuccess: async () => {
      await refetchVariants()
      setMessage(t("saved"))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const saveCoffee = useMutation({
    mutationFn: () =>
      api(`/api/v1/products/${productId}/coffee-profile`, {
        method: "PUT",
        json: coffee,
      }),
    onSuccess: () => setMessage(t("coffee_saved")),
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  function ensureAttr(id: number) {
    setAttrAssigns((list) => {
      if (list.some((a) => a.id === id)) return list
      return [
        ...list,
        { id, is_visible: true, is_variation: false, position: list.length, term_ids: [], custom_options: [] },
      ]
    })
  }

  function updateAttr(id: number, patch: Partial<AttrAssign>) {
    setAttrAssigns((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  const assignedIds = new Set(attrAssigns.map((a) => a.id))

  const permalinkBase = lookup?.permalink_base || "/product/"
  const storePermalink = product?.permalink ?? (form.slug ? `${permalinkBase}${form.slug}` : "")
  const tagList = form.tag_names
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const galleryUrls = form.gallery_text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
  const filteredCats = (lookup?.categories ?? []).filter((c) =>
    !catFilter.trim() || c.name.toLowerCase().includes(catFilter.trim().toLowerCase()),
  )

  const sidebar = (
    <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("publish_box")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>{t("type")}</Label>
            <select
              className={selectClass}
              value={form.type}
              disabled={hasVariants}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as FormState["type"] }))}
            >
              <option value="simple">{enumLabel("product_type", "simple")}</option>
              <option value="variable">{enumLabel("product_type", "variable")}</option>
              <option value="downloadable">{enumLabel("product_type", "downloadable")}</option>
              <option value="grouped">{enumLabel("product_type", "grouped")}</option>
              <option value="external">{enumLabel("product_type", "external")}</option>
            </select>
            {hasVariants ? <p className="text-muted-foreground mt-1 text-xs">{t("type_locked_variants")}</p> : null}
          </div>
          <div>
            <Label>{t("status")}</Label>
            <select
              className={selectClass}
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="publish">{t("status_publish")}</option>
              <option value="draft">{t("status_draft")}</option>
              <option value="pending">{t("status_pending")}</option>
              <option value="private">{t("status_private")}</option>
            </select>
          </div>
          <div>
            <Label>{t("catalog_visibility")}</Label>
            <select
              className={selectClass}
              value={form.catalog_visibility}
              onChange={(e) => setForm((f) => ({ ...f, catalog_visibility: e.target.value }))}
            >
              {(["visible", "catalog", "search", "hidden"] as const).map((v) => (
                <option key={v} value={v}>
                  {enumLabel("catalog_visibility", v)}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.is_featured}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_featured: Boolean(v) }))}
            />
            {t("is_featured")}
          </label>
          <Button className="w-full" onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
            {tCommon("save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("categories")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input value={catFilter} onChange={(e) => setCatFilter(e.target.value)} placeholder={t("search_categories")} />
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {filteredCats.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.category_ids.includes(c.id)}
                  onCheckedChange={() => setForm((f) => ({ ...f, category_ids: toggleId(f.category_ids, c.id) }))}
                />
                {c.parent_id ? "— " : ""}
                {c.name}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("brands")}</CardTitle>
        </CardHeader>
        <CardContent className="max-h-40 space-y-2 overflow-y-auto">
          {(lookup?.brands ?? []).map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.brand_ids.includes(b.id)}
                onCheckedChange={() => setForm((f) => ({ ...f, brand_ids: toggleId(f.brand_ids, b.id) }))}
              />
              {b.name}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("tags")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {tagList.map((name) => (
              <button
                key={name}
                type="button"
                className="bg-muted rounded-full px-2 py-0.5 text-xs"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    tag_names: f.tag_names
                      .split(",")
                      .map((s) => s.trim())
                      .filter((x) => x && x !== name)
                      .join(", "),
                  }))
                }
              >
                {name} ×
              </button>
            ))}
          </div>
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault()
                const name = tagInput.trim().replace(/,$/, "")
                if (!name) return
                if (!tagList.includes(name)) {
                  setForm((f) => ({
                    ...f,
                    tag_names: [...tagList, name].join(", "),
                  }))
                }
                setTagInput("")
              }
            }}
            list="product-tag-suggestions"
            placeholder={t("tags_ph")}
          />
          <datalist id="product-tag-suggestions">
            {(lookup?.tags ?? []).map((tg) => (
              <option key={tg.id} value={tg.name} />
            ))}
          </datalist>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("featured_image")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {form.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.image_url} alt="" className="max-h-36 w-full rounded-md object-cover" />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setCoverPickerOpen(true)}>
              {t("pick_from_media")}
            </Button>
            {form.image_url ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setForm((f) => ({ ...f, image_url: "" }))}>
                {t("remove_image")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </aside>
  )


  return (
    <PageShell
      title={isNew ? t("new_product") : t("edit_product")}
      description={route.fullPath}
      actions={
        <>
          {productId ? <PrintProductLabelButton productIds={[Number(productId)]} /> : null}
          {aiEnabled && productId ? (
            <Button variant="outline" asChild>
              <Link href="/dashboard/ai-content/products">
                <Sparkles className="size-4" />
                {t("ai_generate")}
              </Link>
            </Button>
          ) : null}
          {storePermalink ? (
            <Button variant="outline" asChild>
              <a href={storePermalink} target="_blank" rel="noreferrer">
                {t("view_on_store")}
              </a>
            </Button>
          ) : null}
          {!isNew && productId ? (
            <Button
              variant="destructive"
              disabled={trashProduct.isPending}
              onClick={() =>
                confirm({
                  description: t("confirm_trash_product"),
                  onConfirm: () => trashProduct.mutateAsync(),
                })
              }
            >
              <Trash2 className="size-4" />
              {tCommon("delete")}
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link href="/dashboard/products">{t("back_to_list")}</Link>
          </Button>
          <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
            {tCommon("save")}
          </Button>
        </>
      }
    >
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!isNew && isLoading ? (
        <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 border-b pb-2">
            {TABS.filter((id) => (id !== "marketplace" || marketplaceEnabled) && (id !== "coffee" || coffeeEnabled)).map(
              (id) => (
              <Button key={id} size="sm" variant={tab === id ? "default" : "ghost"} onClick={() => setTab(id)}>
                {t(`tab_${id}`)}
              </Button>
            ),
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)] lg:items-start">
            <div className="min-w-0 space-y-4">
          {tab === "content" ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t("tab_content")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>{t("name")}</Label>
                      <Input
                        value={form.name}
                        onChange={(e) => {
                          const name = e.target.value
                          setForm((f) => ({
                            ...f,
                            name,
                            slug:
                              isNew && !slugEditing
                                ? name
                                    .trim()
                                    .toLowerCase()
                                    .replace(/\s+/g, "-")
                                    .replace(/[^\w\u0600-\u06FF-]+/g, "")
                                : f.slug,
                          }))
                        }}
                        className="text-base font-medium"
                      />
                    </div>
                    <div>
                      <Label>{t("english_name")}</Label>
                      <Input
                        value={form.english_name}
                        onChange={(e) => setForm((f) => ({ ...f, english_name: e.target.value }))}
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div className="bg-muted/20 space-y-1.5 rounded-lg border p-2.5">
                    <p className="text-muted-foreground text-xs font-medium">{t("permalink")}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm" dir="ltr">
                      <span className="text-muted-foreground">{permalinkBase}</span>
                      {slugEditing ? (
                        <Input
                          className="h-8 max-w-xs"
                          value={form.slug}
                          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                          onBlur={() => setSlugEditing(false)}
                          autoFocus
                        />
                      ) : (
                        <>
                          <a
                            href={storePermalink || undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary max-w-full truncate font-medium underline-offset-2 hover:underline"
                          >
                            {form.slug || "…"}
                          </a>
                          <Button type="button" size="sm" variant="outline" onClick={() => setSlugEditing(true)}>
                            {t("edit_permalink")}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>{t("short_description")}</Label>
                    <RichTextEditor
                      value={form.short_description}
                      onChange={(html) => setForm((f) => ({ ...f, short_description: html }))}
                    />
                  </div>
                  <div>
                    <Label>{t("description")}</Label>
                    <RichTextEditor
                      value={form.description}
                      onChange={(html) => setForm((f) => ({ ...f, description: html }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>{t("gallery")}</Label>
                      <Button type="button" size="sm" variant="outline" onClick={() => setGalleryPickerOpen(true)}>
                        {t("pick_from_media")}
                      </Button>
                    </div>
                    {galleryUrls.length ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {galleryUrls.map((url, gi) => (
                          <div key={`${url}-${gi}`} className="relative overflow-hidden rounded-md border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="aspect-square w-full object-cover" />
                            <div className="bg-background/90 absolute end-1 top-1 flex flex-col gap-0.5 rounded p-0.5">
                              <button
                                type="button"
                                className="rounded px-1 text-xs"
                                aria-label={t("gallery_move_up")}
                                onClick={() =>
                                  setForm((f) => ({
                                    ...f,
                                    gallery_text: moveGalleryUrl(
                                      f.gallery_text.split("\n").map((s) => s.trim()).filter(Boolean),
                                      gi,
                                      -1,
                                    ).join("\n"),
                                  }))
                                }
                              >
                                <ArrowUp className="size-3" />
                              </button>
                              <button
                                type="button"
                                className="rounded px-1 text-xs"
                                aria-label={t("gallery_move_down")}
                                onClick={() =>
                                  setForm((f) => ({
                                    ...f,
                                    gallery_text: moveGalleryUrl(
                                      f.gallery_text.split("\n").map((s) => s.trim()).filter(Boolean),
                                      gi,
                                      1,
                                    ).join("\n"),
                                  }))
                                }
                              >
                                <ArrowDown className="size-3" />
                              </button>
                              <button
                                type="button"
                                className="rounded px-1 text-xs"
                                onClick={() =>
                                  setForm((f) => ({
                                    ...f,
                                    gallery_text: f.gallery_text
                                      .split("\n")
                                      .map((s) => s.trim())
                                      .filter((u) => u && u !== url)
                                      .join("\n"),
                                  }))
                                }
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-xs">{t("gallery_empty")}</p>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>{t("video_url")}</Label>
                      <Input
                        value={form.video_url}
                        onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))}
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <Label>{t("video_cover_url")}</Label>
                      <Input
                        value={form.video_cover_url}
                        onChange={(e) => setForm((f) => ({ ...f, video_cover_url: e.target.value }))}
                        dir="ltr"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
          ) : null}

          {tab === "seo" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("tab_seo")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <SimpleSeoFields
                  seo={{ focus_keyword: form.seo_keyword, title: form.seo_title, description: form.seo_description }}
                  onChange={(seo) =>
                    setForm((f) => ({
                      ...f,
                      seo_keyword: seo.focus_keyword ?? "",
                      seo_title: seo.title ?? "",
                      seo_description: seo.description ?? "",
                    }))
                  }
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>{t("seo_robots")}</Label>
                    <select
                      className={selectClass}
                      value={form.seo_robots}
                      onChange={(e) => setForm((f) => ({ ...f, seo_robots: e.target.value }))}
                    >
                      <option value="index">{t("seo_robots_index")}</option>
                      <option value="noindex">{t("seo_robots_noindex")}</option>
                    </select>
                  </div>
                  <div>
                    <Label>{t("seo_og_title")}</Label>
                    <Input
                      value={form.seo_og_title}
                      onChange={(e) => setForm((f) => ({ ...f, seo_og_title: e.target.value }))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>{t("seo_og_image")}</Label>
                    <Input
                      dir="ltr"
                      value={form.seo_og_image}
                      onChange={(e) => setForm((f) => ({ ...f, seo_og_image: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {tab === "pricing" ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t("tab_pricing")}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>{t("sku")}</Label>
                    <Input
                      value={form.sku}
                      onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                      dir="ltr"
                    />
                  </div>
                  {form.type === "variable" ? (
                    <p className="text-muted-foreground sm:col-span-2 text-sm">{t("variable_price_hint")}</p>
                  ) : null}
                  <div>
                    <Label>{t("purchase_price")}</Label>
                    <Input
                      type="number"
                      value={form.purchase_price_minor}
                      onChange={(e) => setForm((f) => ({ ...f, purchase_price_minor: Number(e.target.value) }))}
                      onBlur={() => {
                        if (!isNew && productId) purchaseBlurSave.mutate()
                      }}
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.lock_price}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, lock_price: Boolean(v) }))}
                      />
                      {t("lock_price")}
                    </label>
                  </div>
                  <div>
                    <Label>{t("price")}</Label>
                    <Input
                      type="number"
                      value={form.price_minor}
                      onChange={(e) => setForm((f) => ({ ...f, price_minor: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label>{t("sale_price")}</Label>
                    <Input
                      type="number"
                      value={form.sale_price_minor}
                      onChange={(e) => setForm((f) => ({ ...f, sale_price_minor: e.target.value }))}
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-3 rounded-lg border p-3">
                    <Label>{t("wholesale_rule")}</Label>
                    <select
                      className={selectClass}
                      value={form.wholesale_mode}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          wholesale_mode: e.target.value as "simple" | "tiers",
                        }))
                      }
                    >
                      <option value="simple">{t("wholesale_mode_simple")}</option>
                      <option value="tiers">{t("wholesale_mode_tiers")}</option>
                    </select>
                    {form.wholesale_mode === "simple" ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label>{t("wholesale_min_qty")}</Label>
                          <Input
                            type="number"
                            value={form.wholesale_min_qty}
                            onChange={(e) => setForm((f) => ({ ...f, wholesale_min_qty: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label>{t("wholesale_discount_percent")}</Label>
                          <Input
                            type="number"
                            value={form.wholesale_discount_percent}
                            onChange={(e) => setForm((f) => ({ ...f, wholesale_discount_percent: e.target.value }))}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {form.wholesale_tiers.map((tier, idx) => (
                          <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                            <Input
                              type="number"
                              placeholder={t("wholesale_min_qty")}
                              value={tier.min_qty || ""}
                              onChange={(e) =>
                                setForm((f) => {
                                  const tiers = [...f.wholesale_tiers]
                                  tiers[idx] = { ...tiers[idx], min_qty: Number(e.target.value) || 0 }
                                  return { ...f, wholesale_tiers: tiers }
                                })
                              }
                            />
                            <Input
                              type="number"
                              placeholder={t("wholesale_discount_percent")}
                              value={tier.discount_percent || ""}
                              onChange={(e) =>
                                setForm((f) => {
                                  const tiers = [...f.wholesale_tiers]
                                  tiers[idx] = { ...tiers[idx], discount_percent: Number(e.target.value) || 0 }
                                  return { ...f, wholesale_tiers: tiers }
                                })
                              }
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  wholesale_tiers: f.wholesale_tiers.filter((_, i) => i !== idx),
                                }))
                              }
                            >
                              ×
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              wholesale_tiers: [...f.wholesale_tiers, { min_qty: 2, discount_percent: 5 }],
                            }))
                          }
                        >
                          {t("wholesale_add_tier")}
                        </Button>
                      </div>
                    )}
                  </div>
                  {!isNew ? (
                    <div className="sm:col-span-2 grid gap-2">
                      <Label>{t("reference_url")}</Label>
                      <div className="flex gap-2">
                        <Input
                          dir="ltr"
                          value={form.reference_url}
                          placeholder="https://www.digikala.com/product/dkp-…"
                          onChange={(e) => setForm((f) => ({ ...f, reference_url: e.target.value }))}
                        />
                        <Button
                          variant="outline"
                          disabled={!form.reference_url || referenceFetch.isPending}
                          onClick={() => referenceFetch.mutate()}
                        >
                          {t("reference_fetch")}
                        </Button>
                      </div>
                      {product?.reference_source || product?.reference_last_sync ? (
                        <p className="text-muted-foreground text-xs">
                          {product.reference_source ? `${t("reference_source")}: ${product.reference_source}` : null}
                          {product.reference_last_sync
                            ? ` · ${t("reference_last_sync")}: ${product.reference_last_sync}`
                            : null}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {!isNew && product?.platform_prices && Object.keys(product.platform_prices).length ? (
                    <div className="sm:col-span-2">
                      <Label>{t("platform_prices")}</Label>
                      <pre className="bg-muted mt-1 max-h-32 overflow-auto rounded-md p-2 text-xs" dir="ltr">
                        {JSON.stringify(product.platform_prices, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                  {!isNew ? (
                    <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                      <Button variant="secondary" disabled={wfcp.isPending} onClick={() => wfcp.mutate()}>
                        <RefreshCw className="size-4" />
                        {t("recalc_wfcp")}
                      </Button>
                      {calculated ? (
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant="outline">
                            {t("calc_retail")}: <MoneyDisplay amount={calculated.retail} />
                          </Badge>
                          <Badge variant="outline">
                            {t("calc_credit")}: <MoneyDisplay amount={calculated.credit} />
                          </Badge>
                          <Badge variant="outline">
                            {t("calc_wholesale")}: <MoneyDisplay amount={calculated.wholesale} />
                          </Badge>
                          {calculated.installment != null && calculated.installment > 0 ? (
                            <Badge variant="secondary">
                              {t("calc_installment")}: <MoneyDisplay amount={calculated.installment} />
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {form.type !== "variable" ? (
                    <>
                      <div>
                        <Label>{t("stock")}</Label>
                        <Input
                          type="number"
                          value={form.stock}
                          onChange={(e) => setForm((f) => ({ ...f, stock: Number(e.target.value) }))}
                        />
                      </div>
                      <div>
                        <Label>{t("stock_status")}</Label>
                        <select
                          className={selectClass}
                          value={form.stock_status}
                          onChange={(e) => setForm((f) => ({ ...f, stock_status: e.target.value }))}
                        >
                          <option value="instock">{t("stock_instock")}</option>
                          <option value="outofstock">{t("stock_outofstock")}</option>
                          <option value="onbackorder">{t("stock_onbackorder")}</option>
                        </select>
                      </div>
                      <div>
                        <Label>{t("backorders")}</Label>
                        <select
                          className={selectClass}
                          value={form.backorders}
                          onChange={(e) => setForm((f) => ({ ...f, backorders: e.target.value }))}
                        >
                          <option value="no">{t("backorders_no")}</option>
                          <option value="notify">{t("backorders_notify")}</option>
                          <option value="yes">{t("backorders_yes")}</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={form.manage_stock}
                            onCheckedChange={(v) => setForm((f) => ({ ...f, manage_stock: Boolean(v) }))}
                          />
                          {t("manage_stock")}
                        </label>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t("shipping_panel")}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>{t("weight")}</Label>
                    <Input value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
                  </div>
                  <div>
                    <Label>{t("length")}</Label>
                    <Input value={form.length} onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))} />
                  </div>
                  <div>
                    <Label>{t("width")}</Label>
                    <Input value={form.width} onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))} />
                  </div>
                  <div>
                    <Label>{t("height")}</Label>
                    <Input value={form.height} onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))} />
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {tab === "attributes" ? (
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{t("tab_attributes")}</CardTitle>
                  {!isNew ? (
                    <Button size="sm" disabled={syncAttrs.isPending} onClick={() => syncAttrs.mutate()}>
                      {t("sync_attributes")}
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-4">
                  <AttributeGroupsPanel
                    groups={attrGroups}
                    assignedIds={[...assignedIds]}
                    onFilter={setAttrGroupFilter}
                    filter={attrGroupFilter}
                  />
                  {(lookup?.attributes ?? [])
                    .filter((attr) => {
                      if (attrGroupFilter === "all") return true
                      const group = attrGroups.find((g) => g.id === attrGroupFilter)
                      if (!group?.attribute_ids?.length) return true
                      return group.attribute_ids.includes(attr.id)
                    })
                    .map((attr) => {
                    const assigned = assignedIds.has(attr.id)
                    const row = attrAssigns.find((a) => a.id === attr.id)
                    const showSwatches = assigned && row && attr.type && SWATCH_TYPES.has(attr.type)
                    return (
                      <div key={attr.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm font-medium">
                            <Checkbox
                              checked={assigned}
                              onCheckedChange={(v) => {
                                if (v) ensureAttr(attr.id)
                                else setAttrAssigns((list) => list.filter((a) => a.id !== attr.id))
                              }}
                            />
                            {attr.name}
                            {attr.type ? (
                              <Badge variant="outline" className="font-normal">
                                {enumLabel("attribute_type", attr.type)}
                              </Badge>
                            ) : null}
                          </label>
                          {assigned && row ? (
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                onClick={() => setAttrAssigns((list) => reorderAttrAssigns(list, attr.id, -1))}
                              >
                                <ArrowUp className="size-3" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                onClick={() => setAttrAssigns((list) => reorderAttrAssigns(list, attr.id, 1))}
                              >
                                <ArrowDown className="size-3" />
                              </Button>
                              <label className="flex items-center gap-2">
                                <Checkbox
                                  checked={row.is_visible}
                                  onCheckedChange={(v) => updateAttr(attr.id, { is_visible: Boolean(v) })}
                                />
                                {t("is_visible")}
                              </label>
                              <label className="flex items-center gap-2">
                                <Checkbox
                                  checked={row.is_variation}
                                  onCheckedChange={(v) => updateAttr(attr.id, { is_variation: Boolean(v) })}
                                />
                                {t("is_variation")}
                              </label>
                            </div>
                          ) : null}
                        </div>
                        {assigned && row ? (
                          <div className="flex flex-wrap gap-2">
                            {(attr.terms ?? []).map((term) => (
                              <label
                                key={term.id}
                                className="flex items-center gap-1 rounded border px-2 py-1 text-xs"
                                style={
                                  showSwatches && attr.type === "color" && term.color
                                    ? { borderColor: term.color }
                                    : undefined
                                }
                              >
                                <Checkbox
                                  checked={row.term_ids.includes(term.id)}
                                  onCheckedChange={() =>
                                    updateAttr(attr.id, { term_ids: toggleId(row.term_ids, term.id) })
                                  }
                                />
                                {showSwatches && attr.type === "image" && term.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={term.image_url} alt="" className="size-4 rounded object-cover" />
                                ) : null}
                                {!showSwatches || attr.show_swatch_label !== false ? term.name : null}
                              </label>
                            ))}
                            {row.custom_options.map((opt) => (
                              <span key={opt} className="bg-muted flex items-center gap-1 rounded border px-2 py-1 text-xs">
                                {opt}
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateAttr(attr.id, {
                                      custom_options: row.custom_options.filter((x) => x !== opt),
                                    })
                                  }
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {assigned && row ? (
                          <div className="flex gap-2">
                            <Input
                              className="h-8"
                              placeholder={t("custom_attribute_option_ph")}
                              value={customOptionDraft[attr.id] ?? ""}
                              onChange={(e) =>
                                setCustomOptionDraft((d) => ({ ...d, [attr.id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key !== "Enter") return
                                e.preventDefault()
                                const val = (customOptionDraft[attr.id] ?? "").trim()
                                if (!val || row.custom_options.includes(val)) return
                                updateAttr(attr.id, { custom_options: [...row.custom_options, val] })
                                setCustomOptionDraft((d) => ({ ...d, [attr.id]: "" }))
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const val = (customOptionDraft[attr.id] ?? "").trim()
                                if (!val || row.custom_options.includes(val)) return
                                updateAttr(attr.id, { custom_options: [...row.custom_options, val] })
                                setCustomOptionDraft((d) => ({ ...d, [attr.id]: "" }))
                              }}
                            >
                              {t("custom_attribute_option_add")}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                  {isNew ? (
                    <p className="text-muted-foreground text-sm">{t("save_first_attrs")}</p>
                  ) : null}
                </CardContent>
              </Card>

              {!isNew && form.type === "variable" ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("variants_heading")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={generateVariants.isPending}
                        onClick={() => generateVariants.mutate({ dryRun: true })}
                      >
                        {t("variants_preview")}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={generateVariants.isPending}
                        onClick={() => generateVariants.mutate({})}
                      >
                        {t("generate_variants")}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={destroyAllVariants.isPending}
                        onClick={() =>
                          confirm({
                            description: t("variants_delete_all_confirm"),
                            onConfirm: () => destroyAllVariants.mutateAsync(),
                          })
                        }
                      >
                        {t("variants_delete_all")}
                      </Button>
                    </div>
                    {variantPreview ? (
                      <div className="bg-muted/30 rounded-md border p-3 text-sm">
                        <p className="font-medium">
                          {t("variants_preview_count", { count: variantPreview.count })}
                        </p>
                        <ul className="mt-2 max-h-40 list-disc overflow-y-auto ps-5">
                          {variantPreview.preview.map((row) => (
                            <li key={row.name}>{row.name}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="grid gap-2 rounded border p-2 sm:grid-cols-4">
                      <Input
                        type="number"
                        placeholder={t("bulk_price")}
                        value={bulkPrice}
                        onChange={(e) => setBulkPrice(e.target.value)}
                      />
                      <Input
                        type="number"
                        placeholder={t("stock")}
                        value={bulkStock}
                        onChange={(e) => setBulkStock(e.target.value)}
                      />
                      <Input
                        type="number"
                        placeholder={t("purchase_price")}
                        value={bulkPurchase}
                        onChange={(e) => setBulkPurchase(e.target.value)}
                      />
                      <Button
                        disabled={!bulkVariantIds.length || bulkVariants.isPending}
                        onClick={() => bulkVariants.mutate()}
                      >
                        {t("variants_bulk_apply")}
                      </Button>
                    </div>
                    <ul className="space-y-3">
                      {(variants.length ? variants : product?.variants ?? []).map((v) => (
                        <li key={v.id} className="space-y-2 rounded border p-2 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Checkbox
                              checked={bulkVariantIds.includes(v.id)}
                              onCheckedChange={() =>
                                setBulkVariantIds((ids) => toggleId(ids, v.id))
                              }
                            />
                            <span className="font-medium">
                              {v.name}
                              {v.is_default ? <Badge className="ms-2">{t("default")}</Badge> : null}
                            </span>
                            {!v.is_default ? (
                              <Button size="sm" variant="outline" onClick={() => setDefaultVariant.mutate(v.id)}>
                                {t("set_default_variant")}
                              </Button>
                            ) : null}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="ms-auto"
                              onClick={() => confirm({ onConfirm: () => deleteVariant.mutateAsync(v.id) })}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <Input
                              className="h-8"
                              defaultValue={v.sku ?? ""}
                              placeholder={t("sku")}
                              dir="ltr"
                              onBlur={(e) => {
                                const sku = e.target.value
                                if (sku !== (v.sku ?? "")) updateVariant.mutate({ id: v.id, sku })
                              }}
                            />
                            <Input
                              className="h-8"
                              type="number"
                              defaultValue={v.price_minor}
                              placeholder={t("price")}
                              onBlur={(e) => {
                                const price_minor = Number(e.target.value) || 0
                                if (price_minor !== v.price_minor) updateVariant.mutate({ id: v.id, price_minor })
                              }}
                            />
                            <Input
                              className="h-8"
                              type="number"
                              defaultValue={v.stock ?? ""}
                              placeholder={t("stock")}
                              onBlur={(e) => {
                                const stock = e.target.value === "" ? null : Number(e.target.value)
                                if (stock !== (v.stock ?? null)) updateVariant.mutate({ id: v.id, stock })
                              }}
                            />
                            <Input
                              className="h-8"
                              type="number"
                              defaultValue={v.purchase_price_minor ?? ""}
                              placeholder={t("purchase_price")}
                              onBlur={(e) => {
                                const purchase_price_minor = Number(e.target.value) || 0
                                if (purchase_price_minor !== (v.purchase_price_minor ?? 0)) {
                                  updateVariant.mutate({ id: v.id, purchase_price_minor })
                                }
                              }}
                            />
                          </div>
                          <Input
                            className="h-8"
                            dir="ltr"
                            defaultValue={v.image_url ?? ""}
                            placeholder={t("variant_image_url")}
                            onBlur={(e) => {
                              const image_url = e.target.value || null
                              if (image_url !== (v.image_url ?? null)) updateVariant.mutate({ id: v.id, image_url })
                            }}
                          />
                          <Input
                            className="h-8"
                            dir="ltr"
                            defaultValue={
                              v.wholesale_rule ? JSON.stringify(v.wholesale_rule) : ""
                            }
                            placeholder={t("variant_wholesale_ph")}
                            onBlur={(e) => {
                              const raw = e.target.value.trim()
                              if (!raw) {
                                if (v.wholesale_rule) updateVariant.mutate({ id: v.id, wholesale_rule: null })
                                return
                              }
                              try {
                                const wholesale_rule = JSON.parse(raw) as Record<string, unknown>
                                updateVariant.mutate({ id: v.id, wholesale_rule })
                              } catch {
                                setError(t("invalid_json"))
                              }
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Input
                        placeholder={t("variant_name")}
                        value={variantName}
                        onChange={(e) => setVariantName(e.target.value)}
                      />
                      <Input
                        type="number"
                        placeholder={t("price")}
                        value={variantPrice}
                        onChange={(e) => setVariantPrice(Number(e.target.value))}
                      />
                      <Button disabled={!variantName || createVariant.isPending} onClick={() => createVariant.mutate()}>
                        <Plus className="size-4" />
                        {t("add_variant")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          ) : null}

          {tab === "downloads" ? (
            <ProductDownloadsPanel productId={productId} isNew={isNew} />
          ) : null}

          {tab === "coffee" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("tab_coffee")}</CardTitle>
              </CardHeader>
              <CardContent>
                {!coffeeEnabled ? (
                  <p className="text-muted-foreground text-sm">{t("coffee_module_off")}</p>
                ) : isNew ? (
                  <p className="text-muted-foreground text-sm">{t("save_first_coffee")}</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>{t("blend_arabica")}</Label>
                      <Input
                        type="number"
                        value={coffee.blend_arabica ?? 100}
                        onChange={(e) => setCoffee((c) => ({ ...c, blend_arabica: Number(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <Label>{t("blend_robusta")}</Label>
                      <Input
                        type="number"
                        value={coffee.blend_robusta ?? 0}
                        onChange={(e) => setCoffee((c) => ({ ...c, blend_robusta: Number(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <Label>{t("caffeine_mg")}</Label>
                      <Input
                        type="number"
                        value={coffee.caffeine_mg ?? 0}
                        onChange={(e) => setCoffee((c) => ({ ...c, caffeine_mg: Number(e.target.value) }))}
                      />
                    </div>
                    {form.type === "variable" ? (
                      <div className="sm:col-span-2 space-y-2">
                        <Label>{t("coffee_variant_weights")}</Label>
                        <p className="text-muted-foreground text-xs">{t("coffee_variant_weights_hint")}</p>
                        {(coffee.variant_weight_rows ?? []).length === 0 ? (
                          <p className="text-muted-foreground text-sm">{t("coffee_variant_weights_empty")}</p>
                        ) : (
                          <ul className="space-y-2 text-sm">
                            {(coffee.variant_weight_rows ?? []).map((row) => (
                              <li key={row.variation_id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                                <span className="font-medium">{row.name}</span>
                                {row.weight_g != null ? (
                                  <Badge variant="outline">
                                    {t("pack_weight_g")}: {row.weight_g}
                                  </Badge>
                                ) : null}
                                {row.purchase_price_minor != null && row.purchase_price_minor > 0 ? (
                                  <Badge variant="outline">
                                    {t("purchase_price")}: <MoneyDisplay amount={row.purchase_price_minor} />
                                  </Badge>
                                ) : null}
                                {row.price_minor != null ? (
                                  <Badge variant="outline">
                                    {t("price")}: <MoneyDisplay amount={row.price_minor} />
                                  </Badge>
                                ) : null}
                                {row.calculated_retail != null ? (
                                  <Badge variant="outline">
                                    {t("calc_retail")}: <MoneyDisplay amount={row.calculated_retail} />
                                  </Badge>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <div>
                        <Label>{t("pack_weight_g")}</Label>
                        <Input
                          type="number"
                          value={coffee.pack_weight_g ?? 0}
                          onChange={(e) => setCoffee((c) => ({ ...c, pack_weight_g: Number(e.target.value) }))}
                        />
                      </div>
                    )}
                    <div>
                      <Label>{t("bitterness")}</Label>
                      <Input
                        type="number"
                        value={coffee.bitterness ?? 0}
                        onChange={(e) => setCoffee((c) => ({ ...c, bitterness: Number(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <Label>{t("sweetness")}</Label>
                      <Input
                        type="number"
                        value={coffee.sweetness ?? 0}
                        onChange={(e) => setCoffee((c) => ({ ...c, sweetness: Number(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <Label>{t("body")}</Label>
                      <Input
                        type="number"
                        value={coffee.body ?? 0}
                        onChange={(e) => setCoffee((c) => ({ ...c, body: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Button disabled={saveCoffee.isPending} onClick={() => saveCoffee.mutate()}>
                        {t("save_coffee")}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {tab === "marketplace" ? (
            isNew || !productId ? (
              <p className="text-muted-foreground text-sm">{t("save_first_maps")}</p>
            ) : (
              <ProductMarketplaceTab productId={productId} />
            )
          ) : null}
          {tab === "advanced" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>{t("ishop_panel")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {(lookup?.ishop_labels ?? []).map((lab) => (
                      <label key={lab.key} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.labels.includes(lab.key)}
                          onCheckedChange={() =>
                            setForm((f) => ({
                              ...f,
                              labels: f.labels.includes(lab.key)
                                ? f.labels.filter((k) => k !== lab.key)
                                : [...f.labels, lab.key],
                            }))
                          }
                        />
                        {lab.label}
                      </label>
                    ))}
                  </div>
                  <div>
                    <Label>{t("custom_labels")}</Label>
                    <Textarea
                      value={form.custom_labels_text}
                      onChange={(e) => setForm((f) => ({ ...f, custom_labels_text: e.target.value }))}
                      placeholder={t("one_per_line")}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>{t("shipping_time")}</Label>
                      <Input
                        value={form.shipping_time}
                        onChange={(e) => setForm((f) => ({ ...f, shipping_time: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>{t("initial_stock")}</Label>
                      <Input
                        value={form.initial_stock_quantity}
                        onChange={(e) => setForm((f) => ({ ...f, initial_stock_quantity: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>{t("ai_review_summary")}</Label>
                    <Textarea
                      value={form.ai_review_summary}
                      onChange={(e) => setForm((f) => ({ ...f, ai_review_summary: e.target.value }))}
                    />
                  </div>
                  <ProductSearchMultiPicker
                    label={t("related_products")}
                    excludeId={productId ? Number(productId) : null}
                    selectedIds={form.related_ids}
                    onChange={(related_ids) => setForm((f) => ({ ...f, related_ids }))}
                  />
                  <ProductSearchMultiPicker
                    label={t("upsells")}
                    excludeId={productId ? Number(productId) : null}
                    selectedIds={form.upsell_ids}
                    onChange={(upsell_ids) => setForm((f) => ({ ...f, upsell_ids }))}
                  />
                  <ProductSearchMultiPicker
                    label={t("cross_sells")}
                    excludeId={productId ? Number(productId) : null}
                    selectedIds={form.cross_sell_ids}
                    onChange={(cross_sell_ids) => setForm((f) => ({ ...f, cross_sell_ids }))}
                  />
                  <div>
                    <Label>{t("faqs")}</Label>
                    <Textarea
                      value={form.faqs_text}
                      onChange={(e) => setForm((f) => ({ ...f, faqs_text: e.target.value }))}
                      placeholder={t("faqs_ph")}
                    />
                  </div>
                </CardContent>
              </Card>

            </div>
          ) : null}
            </div>
            {sidebar}
          </div>
        </>
      )}
      <MediaPickerDialog
        open={coverPickerOpen}
        onOpenChange={setCoverPickerOpen}
        onPick={(item) => setForm((f) => ({ ...f, image_url: item.url }))}
      />
      <MediaPickerDialog
        open={galleryPickerOpen}
        onOpenChange={setGalleryPickerOpen}
        onPick={(item) =>
          setForm((f) => {
            const lines = f.gallery_text.split("\n").map((s) => s.trim()).filter(Boolean)
            if (lines.includes(item.url)) return f
            return { ...f, gallery_text: [...lines, item.url].join("\n") }
          })
        }
      />
      {confirmDialog}
    </PageShell>
  )
}

function AttributeGroupsPanel({
  groups,
  assignedIds,
  filter,
  onFilter,
}: {
  groups: AttributeGroup[]
  assignedIds: number[]
  filter: number | "all"
  onFilter: (v: number | "all") => void
}) {
  const t = useTranslations("store")
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const createGroup = useMutation({
    mutationFn: () =>
      api("/api/v1/attribute-groups", {
        method: "POST",
        json: { name: name.trim(), attribute_ids: assignedIds },
      }),
    onSuccess: () => {
      setName("")
      void qc.invalidateQueries({ queryKey: ["attribute-groups"] })
    },
  })

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Label>{t("attribute_groups")}</Label>
      <select className={selectClass} value={filter === "all" ? "all" : String(filter)} onChange={(e) => {
        const v = e.target.value
        onFilter(v === "all" ? "all" : Number(v))
      }}>
        <option value="all">{t("attribute_groups_all")}</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("attribute_group_name_ph")} />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!name.trim() || createGroup.isPending}
          onClick={() => createGroup.mutate()}
        >
          {t("attribute_group_create")}
        </Button>
      </div>
    </div>
  )
}

function ProductSearchMultiPicker({
  label,
  selectedIds,
  onChange,
  excludeId,
}: {
  label: string
  selectedIds: number[]
  onChange: (ids: number[]) => void
  excludeId: number | null
}) {
  const t = useTranslations("store")
  const [q, setQ] = useState("")
  const [labels, setLabels] = useState<Record<number, string>>({})

  const { data: searchResult } = useQuery({
    queryKey: ["product-picker-search", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const res = await api<{ data?: ProductListHit[] } | ProductListHit[]>(
        `/api/v1/products?search=${encodeURIComponent(q.trim())}&per_page=20&page=1`,
      )
      if (Array.isArray(res)) return res
      return res.data ?? []
    },
  })
  const hits = (searchResult ?? []).filter((p) => p.id !== excludeId)

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1">
        {selectedIds.map((id) => (
          <button
            key={id}
            type="button"
            className="bg-muted rounded-full px-2 py-0.5 text-xs"
            onClick={() => onChange(selectedIds.filter((x) => x !== id))}
          >
            {labels[id] ?? `#${id}`} ×
          </button>
        ))}
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("product_picker_search_ph")} />
      {q.trim().length >= 2 ? (
        <div className="max-h-36 space-y-1 overflow-y-auto rounded border p-2">
          {hits.length === 0 ? (
            <p className="text-muted-foreground text-xs">{t("product_picker_empty")}</p>
          ) : (
            hits.map((p) => (
              <button
                key={p.id}
                type="button"
                className="hover:bg-muted block w-full rounded px-2 py-1 text-start text-xs"
                onClick={() => {
                  if (selectedIds.includes(p.id)) return
                  setLabels((m) => ({ ...m, [p.id]: p.name }))
                  onChange([...selectedIds, p.id])
                  setQ("")
                }}
              >
                {p.name}
                {p.sku ? <span className="text-muted-foreground"> · {p.sku}</span> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

function ProductDownloadsPanel({ productId, isNew }: { productId: string | null; isNew: boolean }) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ["product-downloads", productId],
    enabled: Boolean(productId) && !isNew,
    queryFn: () => api<{ id: number; name: string; file_name?: string }[]>(`/api/v1/products/${productId}/downloads`),
  })
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("name", file.name)
      const base = process.env.NEXT_PUBLIC_API_URL ?? ""
      const res = await fetch(`${base}/api/v1/products/${productId}/downloads`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: fd,
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["product-downloads", productId] }),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/v1/products/${productId}/downloads/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["product-downloads", productId] }),
  })
  if (isNew || !productId) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-4 text-sm">{t("downloads_empty")}</CardContent>
      </Card>
    )
  }
  const items = Array.isArray(q.data) ? q.data : []
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("tab_downloads")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          type="file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload.mutateAsync(f)
          }}
        />
        {items.length === 0 ? <p className="text-muted-foreground text-sm">{t("downloads_empty")}</p> : null}
        <ul className="space-y-2">
          {items.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
              <span>{d.name || d.file_name || `#${d.id}`}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => confirm({ onConfirm: () => remove.mutateAsync(d.id) })}>
                <Trash2 className="size-4" />
                {tCommon("delete")}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
      {confirmDialog}
    </Card>
  )
}

