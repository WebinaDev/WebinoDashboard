"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, RefreshCw, Trash2 } from "lucide-react"
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
import { MoneyDisplay } from "@/components/currency/MoneyDisplay"

type TabId = "content" | "pricing" | "attributes" | "downloads" | "coffee" | "marketplace" | "advanced"

type LookupTerm = { id: number; name: string; slug?: string }
type LookupAttr = {
  id: number
  name: string
  type?: string
  terms?: LookupTerm[]
}
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
  stock?: number | null
  is_default?: boolean
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
}

type Product = {
  id: number
  name: string
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
  stock_status?: string
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
  type: "simple" | "variable" | "downloadable"
  status: string
  catalog_visibility: string
  sku: string
  is_featured: boolean
  category_ids: number[]
  brand_ids: number[]
  tag_names: string
  seo_title: string
  seo_description: string
  seo_keyword: string
  related_ids: number[]
  upsell_ids: number[]
  cross_sell_ids: number[]
  purchase_price_minor: number
  lock_price: boolean
  price_minor: number
  sale_price_minor: string
  wholesale_rule_text: string
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
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
const TABS: TabId[] = ["content", "pricing", "attributes", "downloads", "coffee", "marketplace", "advanced"]

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
  sku: "",
  is_featured: false,
  category_ids: [],
  brand_ids: [],
  tag_names: "",
  seo_title: "",
  seo_description: "",
  seo_keyword: "",
  related_ids: [],
  upsell_ids: [],
  cross_sell_ids: [],
  purchase_price_minor: 0,
  lock_price: false,
  price_minor: 0,
  sale_price_minor: "",
  wholesale_rule_text: "",
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

function productToForm(p: Product): FormState {
  const gallery = Array.isArray(p.gallery) ? p.gallery.map(String) : []
  const faqs = Array.isArray(p.faqs) ? p.faqs : []
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
    type: (p.type as "simple" | "variable" | "downloadable") || "simple",
    status: p.status ?? "draft",
    catalog_visibility: p.catalog_visibility ?? "visible",
    sku: p.sku ?? "",
    is_featured: Boolean(p.is_featured),
    category_ids: p.category_ids ?? p.categories?.map((c) => c.id) ?? [],
    brand_ids: p.brand_ids ?? p.brands?.map((b) => b.id) ?? [],
    tag_names: (p.tags ?? []).map((t) => t.name).join(", "),
    seo_title: String((p.meta as { seo_title?: string } | null)?.seo_title ?? ""),
    seo_description: String((p.meta as { seo_description?: string } | null)?.seo_description ?? ""),
    seo_keyword: String((p.meta as { seo_keyword?: string } | null)?.seo_keyword ?? ""),
    related_ids: Array.isArray(p.related_ids) ? p.related_ids.map(Number) : [],
    upsell_ids: Array.isArray(p.upsell_ids) ? p.upsell_ids.map(Number) : [],
    cross_sell_ids: Array.isArray(p.cross_sell_ids) ? p.cross_sell_ids.map(Number) : [],
    purchase_price_minor: p.purchase_price_minor ?? 0,
    lock_price: Boolean(p.lock_price),
    price_minor: p.price_minor ?? 0,
    sale_price_minor: p.sale_price_minor != null ? String(p.sale_price_minor) : "",
    wholesale_rule_text: p.wholesale_rule ? JSON.stringify(p.wholesale_rule, null, 2) : "",
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

function parseWholesale(text: string): Record<string, unknown> | null {
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

function toggleId(list: number[], id: number) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

export default function ProductEditorPageClient({ route }: { route: ResolvedAdminRoute }) {
  const { confirm, dialog: confirmDialog } = useConfirm()
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

  const { data: lookup } = useQuery({
    queryKey: ["products-lookup"],
    queryFn: () => api<Lookup>("/api/v1/products/lookup"),
  })

  const { data: product, isLoading } = useQuery({
    queryKey: ["admin-product", productId],
    enabled: Boolean(productId),
    queryFn: () => api<Product>(`/api/v1/products/${productId}`),
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
      term_ids: a.pivot?.term_ids ?? a.term_ids ?? [],
    }))
    setAttrAssigns(assigns)
  }, [product])

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
      wholesale_rule: parseWholesale(form.wholesale_rule_text),
      stock: form.type === "variable" ? undefined : Number(form.stock) || 0,
      manage_stock: form.type === "variable" ? undefined : form.manage_stock,
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
          wholesale_rule: parseWholesale(form.wholesale_rule_text),
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

  const generateVariants = useMutation({
    mutationFn: () => {
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
      return api(`/api/v1/products/${productId}/variations/generate`, {
        method: "POST",
        json: { axes },
      })
    },
    onSuccess: async () => {
      setForm((f) => ({ ...f, type: "variable" }))
      await refetchVariants()
      setMessage(t("variants_generated"))
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
    mutationFn: (body: { id: number; price_minor?: number; sku?: string; stock?: number | null }) =>
      api(`/api/v1/variants/${body.id}`, {
        method: "PATCH",
        json: {
          price_minor: body.price_minor,
          sku: body.sku,
          stock: body.stock,
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

  const aiGenerate = useMutation({
    mutationFn: () =>
      api("/api/v1/ai-content/generate", {
        method: "POST",
        json: { type: "product", id: Number(productId), sync: false },
      }),
    onSuccess: () => setMessage(t("ai_generate_queued")),
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  function ensureAttr(id: number) {
    setAttrAssigns((list) => {
      if (list.some((a) => a.id === id)) return list
      return [...list, { id, is_visible: true, is_variation: false, position: list.length, term_ids: [] }]
    })
  }

  function updateAttr(id: number, patch: Partial<AttrAssign>) {
    setAttrAssigns((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  const assignedIds = new Set(attrAssigns.map((a) => a.id))

  const permalinkBase = lookup?.permalink_base || "/product/"
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
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "simple" | "variable" | "downloadable" }))}
            >
              <option value="simple">{t("type_simple")}</option>
              <option value="variable">{t("type_variable")}</option>
              <option value="downloadable">{t("type_downloadable")}</option>
            </select>
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
              <option value="trash">{t("status_trash")}</option>
            </select>
          </div>
          <div>
            <Label>{t("catalog_visibility")}</Label>
            <select
              className={selectClass}
              value={form.catalog_visibility}
              onChange={(e) => setForm((f) => ({ ...f, catalog_visibility: e.target.value }))}
            >
              <option value="visible">visible</option>
              <option value="catalog">catalog</option>
              <option value="search">search</option>
              <option value="hidden">hidden</option>
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
          {form.slug ? (
            <Button variant="outline" asChild>
              <a href={`${permalinkBase}${form.slug}`} target="_blank" rel="noreferrer">
                {t("view_on_store")}
              </a>
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
            {TABS.filter((id) => id !== "marketplace" || marketplaceEnabled).map((id) => (
              <Button key={id} size="sm" variant={tab === id ? "default" : "ghost"} onClick={() => setTab(id)}>
                {t(`tab_${id}`)}
              </Button>
            ))}
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
                            href={form.slug ? `${permalinkBase}${form.slug}` : undefined}
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
                        {galleryUrls.map((url) => (
                          <div key={url} className="relative overflow-hidden rounded-md border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="aspect-square w-full object-cover" />
                            <button
                              type="button"
                              className="bg-background/80 absolute end-1 top-1 rounded px-1 text-xs"
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
                </CardContent>
              </Card>
          ) : null}

          {tab === "pricing" ? (
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
                <div className="sm:col-span-2">
                  <Label>{t("wholesale_rule")}</Label>
                  <Textarea
                    rows={4}
                    value={form.wholesale_rule_text}
                    onChange={(e) => setForm((f) => ({ ...f, wholesale_rule_text: e.target.value }))}
                    placeholder='{"min_qty":10,"discount_percent":5}'
                  />
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
                      </div>
                    ) : null}
                  </div>
                ) : null}
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
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.manage_stock}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, manage_stock: Boolean(v) }))}
                    />
                    {t("manage_stock")}
                  </label>
                </div>
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
                  {(lookup?.attributes ?? []).map((attr) => {
                    const assigned = assignedIds.has(attr.id)
                    const row = attrAssigns.find((a) => a.id === attr.id)
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
                          </label>
                          {assigned && row ? (
                            <div className="flex gap-4 text-sm">
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
                              <label key={term.id} className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                                <Checkbox
                                  checked={row.term_ids.includes(term.id)}
                                  onCheckedChange={() =>
                                    updateAttr(attr.id, { term_ids: toggleId(row.term_ids, term.id) })
                                  }
                                />
                                {term.name}
                              </label>
                            ))}
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
                    <ul className="space-y-2">
                      {(variants.length ? variants : product?.variants ?? []).map((v) => (
                        <li key={v.id} className="grid gap-2 rounded border p-2 text-sm sm:grid-cols-[1fr_120px_100px_40px] sm:items-center">
                          <span className="font-medium">
                            {v.name}
                            {v.is_default ? <Badge className="ms-2">{t("default")}</Badge> : null}
                          </span>
                          <Input
                            className="h-8"
                            defaultValue={v.sku ?? ""}
                            placeholder={t("sku")}
                            dir="ltr"
                            onBlur={(e) => {
                              const sku = e.target.value
                              if (sku !== (v.sku ?? "")) updateVariant.mutate({ id: v.id, sku, price_minor: v.price_minor, stock: v.stock })
                            }}
                          />
                          <Input
                            className="h-8"
                            type="number"
                            defaultValue={v.price_minor}
                            onBlur={(e) => {
                              const price_minor = Number(e.target.value) || 0
                              if (price_minor !== v.price_minor) updateVariant.mutate({ id: v.id, price_minor, sku: v.sku ?? "", stock: v.stock })
                            }}
                          />
                          <Button size="icon" variant="ghost" onClick={() => confirm({ onConfirm: () => deleteVariant.mutateAsync(v.id) })}>
                            <Trash2 className="size-4" />
                          </Button>
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
                    <Button variant="secondary" disabled={generateVariants.isPending} onClick={() => generateVariants.mutate()}>
                      {t("generate_variants")}
                    </Button>
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
                    <div>
                      <Label>{t("pack_weight_g")}</Label>
                      <Input
                        type="number"
                        value={coffee.pack_weight_g ?? 0}
                        onChange={(e) => setCoffee((c) => ({ ...c, pack_weight_g: Number(e.target.value) }))}
                      />
                    </div>
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
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <Label>{t("ai_review_summary")}</Label>
                      {aiEnabled && productId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={aiGenerate.isPending}
                          onClick={() => aiGenerate.mutate()}
                        >
                          {t("ai_generate")}
                        </Button>
                      ) : null}
                    </div>
                    <Textarea
                      value={form.ai_review_summary}
                      onChange={(e) => setForm((f) => ({ ...f, ai_review_summary: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>{t("related_products")}</Label>
                    <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-2">
                      {(lookup?.products ?? [])
                        .filter((p) => !productId || p.id !== Number(productId))
                        .slice(0, 80)
                        .map((p) => (
                          <label key={p.id} className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={form.related_ids.includes(p.id)}
                              onCheckedChange={() =>
                                setForm((f) => ({ ...f, related_ids: toggleId(f.related_ids, p.id) }))
                              }
                            />
                            {p.name}
                          </label>
                        ))}
                    </div>
                  </div>
                  <div>
                    <Label>{t("upsells")}</Label>
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded border p-2">
                      {(lookup?.products ?? [])
                        .filter((p) => !productId || p.id !== Number(productId))
                        .slice(0, 80)
                        .map((p) => (
                          <label key={`u-${p.id}`} className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={form.upsell_ids.includes(p.id)}
                              onCheckedChange={() =>
                                setForm((f) => ({ ...f, upsell_ids: toggleId(f.upsell_ids, p.id) }))
                              }
                            />
                            {p.name}
                          </label>
                        ))}
                    </div>
                  </div>
                  <div>
                    <Label>{t("cross_sells")}</Label>
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded border p-2">
                      {(lookup?.products ?? [])
                        .filter((p) => !productId || p.id !== Number(productId))
                        .slice(0, 80)
                        .map((p) => (
                          <label key={`c-${p.id}`} className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={form.cross_sell_ids.includes(p.id)}
                              onCheckedChange={() =>
                                setForm((f) => ({ ...f, cross_sell_ids: toggleId(f.cross_sell_ids, p.id) }))
                              }
                            />
                            {p.name}
                          </label>
                        ))}
                    </div>
                  </div>
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

