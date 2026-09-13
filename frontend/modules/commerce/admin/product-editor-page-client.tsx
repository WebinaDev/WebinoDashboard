"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, RefreshCw, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useDashboardNav } from "@/hooks/useDashboardNav"
import { isSubmoduleEnabled } from "@/kernel/route-resolver"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type TabId = "content" | "pricing" | "attributes" | "coffee" | "seo" | "advanced"

type LookupTerm = { id: number; name: string; slug?: string }
type LookupAttr = {
  id: number
  name: string
  type?: string
  terms?: LookupTerm[]
}
type Lookup = {
  ishop_labels: Array<{ key: string; label: string }>
  categories: Array<{ id: number; name: string; parent_id?: number | null }>
  brands: Array<{ id: number; name: string }>
  tags: Array<{ id: number; name: string }>
  attributes: LookupAttr[]
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

type MarketplaceMap = {
  platform: string
  remote_product_id?: string | null
  remote_variant_id?: string | null
  remote_url?: string | null
  sync_enabled?: boolean
  last_sync_at?: string | null
  last_error?: string | null
  can_create?: boolean
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
  type: "simple" | "variable"
  status: string
  catalog_visibility: string
  category_ids: number[]
  brand_ids: number[]
  tag_names: string
  purchase_price_minor: number
  lock_price: boolean
  price_minor: number
  sale_price_minor: string
  wholesale_rule_text: string
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
const TABS: TabId[] = ["content", "pricing", "attributes", "coffee", "seo", "advanced"]

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
  category_ids: [],
  brand_ids: [],
  tag_names: "",
  purchase_price_minor: 0,
  lock_price: false,
  price_minor: 0,
  sale_price_minor: "",
  wholesale_rule_text: "",
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
    type: (p.type as "simple" | "variable") || "simple",
    status: p.status ?? "draft",
    catalog_visibility: p.catalog_visibility ?? "visible",
    category_ids: p.category_ids ?? p.categories?.map((c) => c.id) ?? [],
    brand_ids: p.brand_ids ?? p.brands?.map((b) => b.id) ?? [],
    tag_names: (p.tags ?? []).map((t) => t.name).join(", "),
    purchase_price_minor: p.purchase_price_minor ?? 0,
    lock_price: Boolean(p.lock_price),
    price_minor: p.price_minor ?? 0,
    sale_price_minor: p.sale_price_minor != null ? String(p.sale_price_minor) : "",
    wholesale_rule_text: p.wholesale_rule ? JSON.stringify(p.wholesale_rule, null, 2) : "",
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
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const { activations } = useDashboardNav()
  const coffeeEnabled = isSubmoduleEnabled(activations, "coffee-profile", "profile")

  const rawId = route.params?.productId
  const isNew = !rawId || rawId === "new"
  const productId = isNew ? null : rawId

  const [tab, setTab] = useState<TabId>("content")
  const [form, setForm] = useState<FormState>(emptyForm)
  const [attrAssigns, setAttrAssigns] = useState<AttrAssign[]>([])
  const [coffee, setCoffee] = useState<CoffeeProfile>({})
  const [maps, setMaps] = useState<MarketplaceMap[]>([])
  const [variantName, setVariantName] = useState("")
  const [variantPrice, setVariantPrice] = useState(0)
  const [calculated, setCalculated] = useState<Product["calculated"]>()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    if (!productId || tab !== "advanced") return
    api<MarketplaceMap[]>(`/api/v1/marketplace/products/${productId}/maps`)
      .then(setMaps)
      .catch(() => setMaps([]))
  }, [productId, tab])

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
      category_ids: form.category_ids,
      brand_ids: form.brand_ids,
      tag_names: form.tag_names
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      purchase_price_minor: Number(form.purchase_price_minor) || 0,
      lock_price: form.lock_price,
      price_minor: Number(form.price_minor) || 0,
      sale_price_minor: form.sale_price_minor === "" ? null : Number(form.sale_price_minor),
      wholesale_rule: parseWholesale(form.wholesale_rule_text),
      stock: Number(form.stock) || 0,
      manage_stock: form.manage_stock,
      stock_status: form.stock_status,
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
      if (isNew) {
        return api<Product>("/api/v1/products", { method: "POST", json: payload })
      }
      return api<Product>(`/api/v1/products/${productId}`, { method: "PATCH", json: payload })
    },
    onSuccess: async (row) => {
      setMessage(t("saved"))
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["admin-products"] })
      if (isNew && row?.id) window.location.assign(`/admin/products/${row.id}`)
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

  const saveCoffee = useMutation({
    mutationFn: () =>
      api(`/api/v1/products/${productId}/coffee-profile`, {
        method: "PUT",
        json: coffee,
      }),
    onSuccess: () => setMessage(t("coffee_saved")),
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const saveMaps = useMutation({
    mutationFn: () =>
      api<MarketplaceMap[]>(`/api/v1/marketplace/products/${productId}/maps`, {
        method: "POST",
        json: { maps },
      }),
    onSuccess: (rows) => {
      setMaps(rows)
      setMessage(t("maps_saved"))
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const syncNow = useMutation({
    mutationFn: () => api(`/api/v1/marketplace/products/${productId}/sync-now`, { method: "POST" }),
    onSuccess: () => setMessage(t("sync_done")),
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const createRemote = useMutation({
    mutationFn: (platform: string) =>
      api(`/api/v1/marketplace/products/${productId}/create-remote`, {
        method: "POST",
        json: { platform },
      }),
    onSuccess: async () => {
      const rows = await api<MarketplaceMap[]>(`/api/v1/marketplace/products/${productId}/maps`)
      setMaps(rows)
      setMessage(t("remote_created"))
    },
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

  return (
    <div className="space-y-6 p-6" dir="auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{isNew ? t("new_product") : t("edit_product")}</h1>
          <p className="text-muted-foreground text-sm">{route.fullPath}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/products">{t("back_to_list")}</Link>
          </Button>
          <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
            {tCommon("save")}
          </Button>
        </div>
      </div>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!isNew && isLoading ? (
        <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 border-b pb-2">
            {TABS.map((id) => (
              <Button
                key={id}
                size="sm"
                variant={tab === id ? "default" : "ghost"}
                onClick={() => setTab(id)}
              >
                {t(`tab_${id}`)}
              </Button>
            ))}
          </div>

          {tab === "content" ? (
            <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
              <Card>
                <CardHeader>
                  <CardTitle>{t("tab_content")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>{t("name")}</Label>
                      <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div>
                      <Label>{t("english_name")}</Label>
                      <Input
                        value={form.english_name}
                        onChange={(e) => setForm((f) => ({ ...f, english_name: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>{t("slug")}</Label>
                    <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
                  </div>
                  <div>
                    <Label>{t("short_description")}</Label>
                    <Textarea
                      value={form.short_description}
                      onChange={(e) => setForm((f) => ({ ...f, short_description: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>{t("description")}</Label>
                    <Textarea
                      rows={6}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>{t("image_url")}</Label>
                    <Input
                      value={form.image_url}
                      onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>{t("gallery_urls")}</Label>
                    <Textarea
                      value={form.gallery_text}
                      onChange={(e) => setForm((f) => ({ ...f, gallery_text: e.target.value }))}
                      placeholder={t("one_per_line")}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>{t("video_url")}</Label>
                      <Input
                        value={form.video_url}
                        onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>{t("video_cover_url")}</Label>
                      <Input
                        value={form.video_cover_url}
                        onChange={(e) => setForm((f) => ({ ...f, video_cover_url: e.target.value }))}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
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
                        onChange={(e) =>
                          setForm((f) => ({ ...f, type: e.target.value as "simple" | "variable" }))
                        }
                      >
                        <option value="simple">{t("type_simple")}</option>
                        <option value="variable">{t("type_variable")}</option>
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
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("categories")}</CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-48 space-y-2 overflow-y-auto">
                    {(lookup?.categories ?? []).map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.category_ids.includes(c.id)}
                          onCheckedChange={() =>
                            setForm((f) => ({ ...f, category_ids: toggleId(f.category_ids, c.id) }))
                          }
                        />
                        {c.name}
                      </label>
                    ))}
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
                          onCheckedChange={() =>
                            setForm((f) => ({ ...f, brand_ids: toggleId(f.brand_ids, b.id) }))
                          }
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
                  <CardContent>
                    <Input
                      value={form.tag_names}
                      onChange={(e) => setForm((f) => ({ ...f, tag_names: e.target.value }))}
                      placeholder={t("tags_ph")}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}

          {tab === "pricing" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("tab_pricing")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
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
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                    <Button variant="secondary" disabled={wfcp.isPending} onClick={() => wfcp.mutate()}>
                      <RefreshCw className="size-4" />
                      {t("recalc_wfcp")}
                    </Button>
                    {calculated ? (
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline">
                          {t("calc_retail")}: {calculated.retail?.toLocaleString()}
                        </Badge>
                        <Badge variant="outline">
                          {t("calc_credit")}: {calculated.credit?.toLocaleString()}
                        </Badge>
                        <Badge variant="outline">
                          {t("calc_wholesale")}: {calculated.wholesale?.toLocaleString()}
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
                        <li key={v.id} className="flex items-center justify-between rounded border p-2 text-sm">
                          <span>
                            {v.name} · {v.price_minor.toLocaleString()}
                            {v.is_default ? <Badge className="ms-2">{t("default")}</Badge> : null}
                          </span>
                          <Button size="icon" variant="ghost" onClick={() => deleteVariant.mutate(v.id)}>
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

          {tab === "seo" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("tab_seo")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">{t("coming_soon")}</p>
              </CardContent>
            </Card>
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

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle>{t("marketplace_panel")}</CardTitle>
                  {!isNew ? (
                    <Button size="sm" variant="outline" disabled={syncNow.isPending} onClick={() => syncNow.mutate()}>
                      {t("sync_now")}
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  {isNew ? (
                    <p className="text-muted-foreground text-sm">{t("save_first_maps")}</p>
                  ) : (
                    <>
                      {maps.map((m, idx) => (
                        <div key={m.platform} className="space-y-2 rounded-lg border p-3">
                          <div className="flex items-center justify-between">
                            <p className="font-medium capitalize">{m.platform}</p>
                            <label className="flex items-center gap-2 text-xs">
                              <Checkbox
                                checked={Boolean(m.sync_enabled)}
                                onCheckedChange={(v) =>
                                  setMaps((list) =>
                                    list.map((row, i) =>
                                      i === idx ? { ...row, sync_enabled: Boolean(v) } : row,
                                    ),
                                  )
                                }
                              />
                              {t("sync_enabled")}
                            </label>
                          </div>
                          <Input
                            placeholder="remote_product_id"
                            value={m.remote_product_id ?? ""}
                            onChange={(e) =>
                              setMaps((list) =>
                                list.map((row, i) =>
                                  i === idx ? { ...row, remote_product_id: e.target.value } : row,
                                ),
                              )
                            }
                          />
                          <Input
                            placeholder="remote_url"
                            value={m.remote_url ?? ""}
                            onChange={(e) =>
                              setMaps((list) =>
                                list.map((row, i) =>
                                  i === idx ? { ...row, remote_url: e.target.value } : row,
                                ),
                              )
                            }
                          />
                          {m.can_create ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={createRemote.isPending}
                              onClick={() => createRemote.mutate(m.platform)}
                            >
                              {t("create_remote")}
                            </Button>
                          ) : null}
                          {m.last_error ? <p className="text-destructive text-xs">{m.last_error}</p> : null}
                        </div>
                      ))}
                      <Button disabled={saveMaps.isPending} onClick={() => saveMaps.mutate()}>
                        {t("save_maps")}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
