"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { statusBadgeVariant, useEnumLabel } from "@/lib/enum-labels"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type Named = { id: number; name: string; slug?: string }

type JobState = {
  id?: number
  status?: string
  stage?: string
  cursor_product_id?: number
  locked?: boolean
  params?: Record<string, unknown>
  state?: {
    processed?: number
    updated?: number
    skipped?: number
    failed?: number
    total?: number
    dry_run?: boolean
    dry_run_sample?: Array<{ id: number; name: string; before?: Record<string, number>; after?: Record<string, number> }>
    failures?: Array<{ id: number; reason?: string }>
  }
  last_log?: string | null
  created_at?: string
  updated_at?: string
} | null

type Preview = {
  total: number
  locked: number
  eligible: number
  sample: Array<{
    id: number
    name: string
    sku?: string | null
    price_minor: number
    sale_price_minor?: number
    stock?: number | null
    stock_status?: string | null
    lock_price?: boolean
  }>
}

type Filters = {
  category_ids: number[]
  brand_ids: number[]
  tag_ids: number[]
  status: string
  type: string
  stock_status: string
  stock_min: string
  stock_max: string
  is_featured: string
  on_sale: string
  has_variants: string
  include_locked: boolean
  sku: string
  search: string
  catalog_visibility: string
  created_from: string
  created_to: string
  updated_from: string
  updated_to: string
  price_min: string
  price_max: string
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
const emptyFilters = (): Filters => ({
  category_ids: [],
  brand_ids: [],
  tag_ids: [],
  status: "publish",
  type: "",
  stock_status: "",
  stock_min: "",
  stock_max: "",
  is_featured: "",
  on_sale: "",
  has_variants: "",
  include_locked: false,
  sku: "",
  search: "",
  catalog_visibility: "",
  created_from: "",
  created_to: "",
  updated_from: "",
  updated_to: "",
  price_min: "",
  price_max: "",
})

function filtersPayload(f: Filters): Record<string, unknown> {
  const out: Record<string, unknown> = {
    category_ids: f.category_ids,
    brand_ids: f.brand_ids,
    tag_ids: f.tag_ids,
    status: f.status || "publish",
    include_locked: f.include_locked,
  }
  if (f.type) out.type = f.type
  if (f.stock_status) out.stock_status = f.stock_status
  if (f.stock_min !== "") out.stock_min = Number(f.stock_min)
  if (f.stock_max !== "") out.stock_max = Number(f.stock_max)
  if (f.is_featured === "1" || f.is_featured === "0") out.is_featured = f.is_featured === "1"
  if (f.on_sale === "1" || f.on_sale === "0") out.on_sale = f.on_sale === "1"
  if (f.has_variants === "1" || f.has_variants === "0") out.has_variants = f.has_variants === "1"
  if (f.sku.trim()) out.sku = f.sku.trim()
  if (f.search.trim()) out.search = f.search.trim()
  if (f.catalog_visibility) out.catalog_visibility = f.catalog_visibility
  if (f.created_from) out.created_from = f.created_from
  if (f.created_to) out.created_to = f.created_to
  if (f.updated_from) out.updated_from = f.updated_from
  if (f.updated_to) out.updated_to = f.updated_to
  if (f.price_min !== "") out.price_min = Number(f.price_min)
  if (f.price_max !== "") out.price_max = Number(f.price_max)
  return out
}

function appendFilterParams(p: URLSearchParams, f: Filters) {
  const payload = filtersPayload(f)
  Object.entries(payload).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => p.append(`${key}[]`, String(v)))
    } else if (typeof value === "boolean") {
      p.set(key, value ? "1" : "0")
    } else if (value != null && value !== "") {
      p.set(key, String(value))
    }
  })
}

function toggleId(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

export default function PricingPriceChangerPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const enumLabel = useEnumLabel()
  const t = useTranslations("store")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()

  const [changeType, setChangeType] = useState<"fixed" | "percent">("percent")
  const [direction, setDirection] = useState<"increase" | "decrease">("increase")
  const [value, setValue] = useState(0)
  const [fieldPrice, setFieldPrice] = useState(true)
  const [fieldSale, setFieldSale] = useState(false)
  const [applyVariants, setApplyVariants] = useState(false)
  const [dryRun, setDryRun] = useState(false)
  const [rounding, setRounding] = useState(false)
  const [roundStep, setRoundStep] = useState(1000)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily")
  const [hour, setHour] = useState(3)
  const [weekday, setWeekday] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => api<Named[]>("/api/v1/categories"),
  })
  const { data: brands = [] } = useQuery({
    queryKey: ["admin-brands"],
    queryFn: () => api<Named[]>("/api/v1/brands"),
  })
  const { data: tags = [] } = useQuery({
    queryKey: ["admin-product-tags"],
    queryFn: () => api<Named[]>("/api/v1/product-tags"),
  })

  const previewParams = useMemo(() => {
    const p = new URLSearchParams()
    appendFilterParams(p, filters)
    return p.toString()
  }, [filters])

  const { data: preview } = useQuery({
    queryKey: ["bulk-price-change-preview", previewParams],
    queryFn: () => api<Preview>(`/api/v1/pricing/bulk-price-change/preview?${previewParams}`),
  })

  const { data: job, refetch: refetchJob } = useQuery({
    queryKey: ["bulk-price-change-state"],
    queryFn: () => api<JobState>("/api/v1/pricing/bulk-price-change/state"),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === "pending" || s === "running" ? 2500 : 8000
    },
  })

  const { data: jobs = [], refetch: refetchJobs } = useQuery({
    queryKey: ["bulk-price-change-jobs"],
    queryFn: () => api<JobState[]>("/api/v1/pricing/bulk-price-change/jobs"),
    refetchInterval: 5000,
  })

  const fields = useMemo(() => {
    const out: string[] = []
    if (fieldPrice) out.push("price_minor")
    if (fieldSale) out.push("sale_price_minor")
    return out.length ? out : ["price_minor"]
  }, [fieldPrice, fieldSale])

  const startBody = useMemo(
    () => ({
      change_type: changeType,
      direction,
      value: Number(value),
      fields,
      apply_to_sale: fieldSale,
      apply_to_variants: applyVariants,
      dry_run: dryRun,
      rounding,
      round_step: roundStep,
      filters: filtersPayload(filters),
    }),
    [changeType, direction, value, fields, fieldSale, applyVariants, dryRun, rounding, roundStep, filters],
  )

  const start = useMutation({
    mutationFn: () => api<JobState>("/api/v1/pricing/bulk-price-change/start", { method: "POST", json: startBody }),
    onSuccess: async () => {
      setMessage(dryRun ? t("price_change_dry_run_started") : t("price_change_started"))
      setError(null)
      await Promise.all([refetchJob(), refetchJobs(), queryClient.invalidateQueries({ queryKey: ["bulk-price-change-preview"] })])
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const control = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "pause" | "resume" | "cancel" }) =>
      api<JobState>(`/api/v1/pricing/bulk-price-change/jobs/${id}/${action}`, { method: "POST" }),
    onSuccess: async () => {
      setError(null)
      await Promise.all([refetchJob(), refetchJobs()])
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const scheduleQ = useQuery({
    queryKey: ["bulk-price-schedule"],
    queryFn: () =>
      api<{
        enabled?: boolean
        frequency?: "daily" | "weekly"
        hour?: number
        weekday?: number
        change_type?: "fixed" | "percent"
        direction?: "increase" | "decrease"
        value?: number
        fields?: string[]
        apply_to_sale?: boolean
        apply_to_variants?: boolean
        rounding?: boolean
        round_step?: number
        filters?: Record<string, unknown>
      }>("/api/v1/pricing/bulk-price-change/schedule"),
  })

  useEffect(() => {
    const row = scheduleQ.data
    if (!row) return
    setScheduleEnabled(Boolean(row.enabled))
    if (row.frequency === "weekly" || row.frequency === "daily") setFrequency(row.frequency)
    if (row.hour != null) setHour(row.hour)
    if (row.weekday != null) setWeekday(row.weekday)
    if (row.change_type === "fixed" || row.change_type === "percent") setChangeType(row.change_type)
    if (row.direction === "increase" || row.direction === "decrease") setDirection(row.direction)
    if (row.value != null) setValue(Number(row.value))
    if (Array.isArray(row.fields)) {
      setFieldPrice(row.fields.includes("price_minor"))
      setFieldSale(row.fields.includes("sale_price_minor"))
    } else if (row.apply_to_sale != null) {
      setFieldSale(Boolean(row.apply_to_sale))
    }
    if (row.apply_to_variants != null) setApplyVariants(Boolean(row.apply_to_variants))
    if (row.rounding != null) setRounding(Boolean(row.rounding))
    if (row.round_step != null) setRoundStep(Number(row.round_step))
  }, [scheduleQ.data])

  const saveSchedule = useMutation({
    mutationFn: () =>
      api("/api/v1/pricing/bulk-price-change/schedule", {
        method: "PUT",
        json: {
          enabled: scheduleEnabled,
          ...startBody,
          dry_run: false,
          frequency,
          hour,
          weekday,
        },
      }),
    onSuccess: () => {
      setMessage(t("schedule_saved"))
      setError(null)
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const running = job?.status === "running" || job?.status === "pending" || Boolean(job?.locked)
  const progressPct =
    job?.state?.total && job.state.total > 0
      ? Math.min(100, Math.round(((job.state.processed ?? 0) / job.state.total) * 100))
      : 0

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6" dir="auto">
      <div>
        <h1 className="text-2xl font-bold">{t("price_changer_title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("price_changer_subtitle")}</p>
      </div>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("price_changer_form")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>{t("change_type")}</Label>
              <select
                className={selectClass}
                value={changeType}
                onChange={(e) => setChangeType(e.target.value as "fixed" | "percent")}
              >
                <option value="percent">{t("change_percent")}</option>
                <option value="fixed">{t("change_fixed")}</option>
              </select>
            </div>
            <div>
              <Label>{t("change_direction")}</Label>
              <select
                className={selectClass}
                value={direction}
                onChange={(e) => setDirection(e.target.value as "increase" | "decrease")}
              >
                <option value="increase">{t("change_increase")}</option>
                <option value="decrease">{t("change_decrease")}</option>
              </select>
            </div>
            <div>
              <Label>{t("change_value")}</Label>
              <Input type="number" min={0} value={value} onChange={(e) => setValue(Number(e.target.value))} />
            </div>
          </div>

          <div>
            <Label>{t("price_fields")}</Label>
            <p className="text-muted-foreground mb-2 text-xs">{t("price_fields_hint")}</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={fieldPrice} onCheckedChange={(v) => setFieldPrice(Boolean(v))} />
                {t("field_regular_price")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={fieldSale} onCheckedChange={(v) => setFieldSale(Boolean(v))} />
                {t("field_sale_price")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={applyVariants} onCheckedChange={(v) => setApplyVariants(Boolean(v))} />
                {t("apply_to_variants")}
              </label>
            </div>
          </div>

          <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="md:col-span-2 lg:col-span-3">
              <Label>{t("price_change_filters")}</Label>
              <p className="text-muted-foreground text-xs">{t("price_change_filters_hint")}</p>
            </div>
            <div>
              <Label>{t("search")}</Label>
              <Input value={filters.search} onChange={(e) => setFilter("search", e.target.value)} placeholder={t("search")} />
            </div>
            <div>
              <Label>{t("sku")}</Label>
              <Input value={filters.sku} onChange={(e) => setFilter("sku", e.target.value)} dir="ltr" />
            </div>
            <div>
              <Label>{t("status")}</Label>
              <select className={selectClass} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
                <option value="publish">{enumLabel("product_status", "publish")}</option>
                <option value="draft">{enumLabel("product_status", "draft")}</option>
                <option value="private">{enumLabel("product_status", "private")}</option>
                <option value="all">{t("filter_status_all")}</option>
              </select>
            </div>
            <div>
              <Label>{t("product_type")}</Label>
              <select className={selectClass} value={filters.type} onChange={(e) => setFilter("type", e.target.value)}>
                <option value="">{tCommon("all")}</option>
                <option value="simple">{enumLabel("product_type", "simple")}</option>
                <option value="variable">{enumLabel("product_type", "variable")}</option>
              </select>
            </div>
            <div>
              <Label>{t("stock_status")}</Label>
              <select
                className={selectClass}
                value={filters.stock_status}
                onChange={(e) => setFilter("stock_status", e.target.value)}
              >
                <option value="">{tCommon("all")}</option>
                <option value="instock">{enumLabel("stock_status", "instock")}</option>
                <option value="outofstock">{enumLabel("stock_status", "outofstock")}</option>
                <option value="onbackorder">{enumLabel("stock_status", "onbackorder")}</option>
              </select>
            </div>
            <div>
              <Label>{t("stock_range")}</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder={t("stock_min")}
                  value={filters.stock_min}
                  onChange={(e) => setFilter("stock_min", e.target.value)}
                />
                <Input
                  type="number"
                  placeholder={t("stock_max")}
                  value={filters.stock_max}
                  onChange={(e) => setFilter("stock_max", e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>{t("featured")}</Label>
              <select className={selectClass} value={filters.is_featured} onChange={(e) => setFilter("is_featured", e.target.value)}>
                <option value="">{tCommon("all")}</option>
                <option value="1">{t("filter_yes")}</option>
                <option value="0">{t("filter_no")}</option>
              </select>
            </div>
            <div>
              <Label>{t("on_sale")}</Label>
              <select className={selectClass} value={filters.on_sale} onChange={(e) => setFilter("on_sale", e.target.value)}>
                <option value="">{tCommon("all")}</option>
                <option value="1">{t("filter_yes")}</option>
                <option value="0">{t("filter_no")}</option>
              </select>
            </div>
            <div>
              <Label>{t("has_variants")}</Label>
              <select
                className={selectClass}
                value={filters.has_variants}
                onChange={(e) => setFilter("has_variants", e.target.value)}
              >
                <option value="">{tCommon("all")}</option>
                <option value="1">{t("filter_yes")}</option>
                <option value="0">{t("filter_no")}</option>
              </select>
            </div>
            <div>
              <Label>{t("catalog_visibility")}</Label>
              <select
                className={selectClass}
                value={filters.catalog_visibility}
                onChange={(e) => setFilter("catalog_visibility", e.target.value)}
              >
                <option value="">{tCommon("all")}</option>
                <option value="visible">{enumLabel("catalog_visibility", "visible")}</option>
                <option value="catalog">{enumLabel("catalog_visibility", "catalog")}</option>
                <option value="search">{enumLabel("catalog_visibility", "search")}</option>
                <option value="hidden">{enumLabel("catalog_visibility", "hidden")}</option>
              </select>
            </div>
            <div>
              <Label>{t("created_range")}</Label>
              <div className="flex gap-2">
                <Input type="date" value={filters.created_from} onChange={(e) => setFilter("created_from", e.target.value)} />
                <Input type="date" value={filters.created_to} onChange={(e) => setFilter("created_to", e.target.value)} />
              </div>
            </div>
            <div>
              <Label>{t("updated_range")}</Label>
              <div className="flex gap-2">
                <Input type="date" value={filters.updated_from} onChange={(e) => setFilter("updated_from", e.target.value)} />
                <Input type="date" value={filters.updated_to} onChange={(e) => setFilter("updated_to", e.target.value)} />
              </div>
            </div>
            <div>
              <Label>{t("price_range")}</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder={t("price_min")}
                  value={filters.price_min}
                  onChange={(e) => setFilter("price_min", e.target.value)}
                />
                <Input
                  type="number"
                  placeholder={t("price_max")}
                  value={filters.price_max}
                  onChange={(e) => setFilter("price_max", e.target.value)}
                />
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <Label>{t("price_change_categories")}</Label>
              <div className="mt-1 max-h-36 space-y-2 overflow-y-auto rounded-md border p-2">
                {categories.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("empty_categories")}</p>
                ) : (
                  categories.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={filters.category_ids.includes(c.id)}
                        onCheckedChange={() => setFilter("category_ids", toggleId(filters.category_ids, c.id))}
                      />
                      {c.name}
                    </label>
                  ))
                )}
              </div>
            </div>
            <div>
              <Label>{t("brands")}</Label>
              <div className="mt-1 max-h-36 space-y-2 overflow-y-auto rounded-md border p-2">
                {brands.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("empty_brands")}</p>
                ) : (
                  brands.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={filters.brand_ids.includes(b.id)}
                        onCheckedChange={() => setFilter("brand_ids", toggleId(filters.brand_ids, b.id))}
                      />
                      {b.name}
                    </label>
                  ))
                )}
              </div>
            </div>
            <div>
              <Label>{t("tags")}</Label>
              <div className="mt-1 max-h-36 space-y-2 overflow-y-auto rounded-md border p-2">
                {tags.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("empty_tags")}</p>
                ) : (
                  tags.map((tag) => (
                    <label key={tag.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={filters.tag_ids.includes(tag.id)}
                        onCheckedChange={() => setFilter("tag_ids", toggleId(filters.tag_ids, tag.id))}
                      />
                      {tag.name}
                    </label>
                  ))
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-2 lg:col-span-3">
              <Checkbox
                checked={filters.include_locked}
                onCheckedChange={(v) => setFilter("include_locked", Boolean(v))}
              />
              {t("include_locked")}
            </label>
          </div>

          {preview ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p>
                {t("price_change_preview_count", {
                  total: preview.total,
                  eligible: preview.eligible,
                  locked: preview.locked,
                })}
              </p>
              {preview.sample.length > 0 ? (
                <ul className="text-muted-foreground mt-2 space-y-1">
                  {preview.sample.map((p) => (
                    <li key={p.id}>
                      {p.name}
                      {p.sku ? ` · ${p.sku}` : ""} · <MoneyDisplay amount={p.price_minor} />
                      {p.lock_price ? ` (${t("lock_price")})` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-2 text-xs">{t("price_change_preview_empty")}</p>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={rounding} onCheckedChange={(v) => setRounding(Boolean(v))} />
              {t("rounding")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={dryRun} onCheckedChange={(v) => setDryRun(Boolean(v))} />
              {t("dry_run")}
            </label>
          </div>
          {rounding ? (
            <div className="max-w-xs">
              <Label>{t("round_step")}</Label>
              <Input type="number" min={1} value={roundStep} onChange={(e) => setRoundStep(Number(e.target.value))} />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => start.mutate()} disabled={start.isPending || Boolean(running) || (!fieldPrice && !fieldSale)}>
              {dryRun ? t("start_dry_run") : t("start_price_change")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setFilters(emptyFilters())}>
              {t("reset_filters")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{t("price_changer_state")}</CardTitle>
          {job?.status ? (
            <Badge variant={statusBadgeVariant(job.status)}>{enumLabel("job_status", job.status)}</Badge>
          ) : (
            <Badge variant="outline">{t("idle")}</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!job ? (
            <p className="text-muted-foreground">{t("no_job")}</p>
          ) : (
            <>
              <p>
                {t("job_progress", {
                  processed: job.state?.processed ?? 0,
                  total: job.state?.total ?? 0,
                  updated: job.state?.updated ?? 0,
                  skipped: job.state?.skipped ?? 0,
                })}
                {job.state?.failed ? ` · ${t("job_failed_count", { count: job.state.failed })}` : ""}
              </p>
              <p className="text-muted-foreground">
                {t("job_stage", { stage: job.stage ?? "—" })}
                {job.cursor_product_id ? ` · ${t("job_cursor", { id: job.cursor_product_id })}` : ""}
                {job.state?.dry_run ? ` · ${t("dry_run")}` : ""}
              </p>
              <div className="bg-muted h-2 w-full overflow-hidden rounded">
                <div className="bg-primary h-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              {job.last_log ? <p className="text-muted-foreground whitespace-pre-wrap">{job.last_log}</p> : null}
              {job.state?.dry_run_sample && job.state.dry_run_sample.length > 0 ? (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded border p-2 text-xs">
                  {job.state.dry_run_sample.map((row) => (
                    <li key={row.id}>
                      #{row.id} {row.name}: <MoneyDisplay amount={row.before?.price_minor ?? 0} /> →{" "}
                      <MoneyDisplay amount={row.after?.price_minor ?? 0} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {job.state?.failures && job.state.failures.length > 0 ? (
                <ul className="text-destructive max-h-32 space-y-1 overflow-y-auto text-xs">
                  {job.state.failures.map((f) => (
                    <li key={f.id}>
                      #{f.id}: {f.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {job.id && (job.status === "pending" || job.status === "running") ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={control.isPending}
                      onClick={() => control.mutate({ id: job.id!, action: "pause" })}
                    >
                      {t("pause_job")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={control.isPending}
                      onClick={() => control.mutate({ id: job.id!, action: "cancel" })}
                    >
                      {t("cancel_job")}
                    </Button>
                  </>
                ) : null}
                {job.id && job.status === "paused" ? (
                  <>
                    <Button
                      size="sm"
                      disabled={control.isPending}
                      onClick={() => control.mutate({ id: job.id!, action: "resume" })}
                    >
                      {t("resume_job")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={control.isPending}
                      onClick={() => control.mutate({ id: job.id!, action: "cancel" })}
                    >
                      {t("cancel_job")}
                    </Button>
                  </>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => void refetchJob()}>
                  {tCommon("try_again")}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("price_changer_jobs")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {jobs.length === 0 ? (
            <p className="text-muted-foreground">{t("no_job")}</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {jobs.map((j) => (
                <li key={j?.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div>
                    <span className="font-medium">#{j?.id}</span>{" "}
                    <Badge variant={statusBadgeVariant(j?.status)}>{enumLabel("job_status", j?.status)}</Badge>{" "}
                    <span className="text-muted-foreground">
                      {t("job_stage", { stage: j?.stage ?? "—" })} · {j?.state?.processed ?? 0}/{j?.state?.total ?? 0}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {j?.id && (j.status === "pending" || j.status === "running") ? (
                      <Button size="sm" variant="ghost" onClick={() => control.mutate({ id: j.id!, action: "pause" })}>
                        {t("pause_job")}
                      </Button>
                    ) : null}
                    {j?.id && j.status === "paused" ? (
                      <Button size="sm" variant="ghost" onClick={() => control.mutate({ id: j.id!, action: "resume" })}>
                        {t("resume_job")}
                      </Button>
                    ) : null}
                    {j?.id && (j.status === "pending" || j.status === "running" || j.status === "paused") ? (
                      <Button size="sm" variant="ghost" onClick={() => control.mutate({ id: j.id!, action: "cancel" })}>
                        {t("cancel_job")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("schedule_title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <Checkbox checked={scheduleEnabled} onCheckedChange={(v) => setScheduleEnabled(Boolean(v))} />
            {t("schedule_enabled")}
          </label>
          <p className="text-muted-foreground text-xs md:col-span-2">{t("schedule_uses_form")}</p>
          <div>
            <Label>{t("schedule_frequency")}</Label>
            <select
              className={selectClass}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value === "weekly" ? "weekly" : "daily")}
            >
              <option value="daily">{t("schedule_daily")}</option>
              <option value="weekly">{t("schedule_weekly")}</option>
            </select>
          </div>
          <div>
            <Label>{t("schedule_hour")}</Label>
            <Input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} />
          </div>
          {frequency === "weekly" ? (
            <div>
              <Label>{t("schedule_weekday")}</Label>
              <Input type="number" min={0} max={6} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} />
            </div>
          ) : null}
          <div className="md:col-span-2">
            <Button type="button" variant="secondary" disabled={saveSchedule.isPending} onClick={() => saveSchedule.mutate()}>
              {tCommon("save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
