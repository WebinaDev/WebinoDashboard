"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { PageShell } from "@/components/PageShell"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import { formatDisplayDate } from "@/lib/format-date"

type ProductRow = {
  id: number
  name: string
  sku?: string | null
  image_url?: string | null
  currency?: string | null
  price_minor?: number | null
  sale_price_minor?: number | null
  sale_ends_at?: string | null
  is_on_sale?: boolean
}

type ListPayload = {
  data: ProductRow[]
  meta?: { total?: number; current_page?: number; last_page?: number; per_page?: number }
}

type Named = { id: number; name: string }

type PreviewSample = {
  id: number
  name: string
  image?: string
  type?: string
  regular_price: string
  sale_price: string
  variations?: number
}

type PreviewPayload = {
  action: "preview"
  count: number
  percent: number
  samples: PreviewSample[]
}

const DURATION_PRESETS = ["1", "3", "7", "30"] as const

type DurationMode = (typeof DURATION_PRESETS)[number] | "custom"

const selectClass = "border-input bg-background h-9 rounded-md border px-3 text-sm"

function asList<T>(raw: T[] | { data?: T[] } | undefined): T[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return Array.isArray(raw.data) ? raw.data : []
}

export default function SalePricesPage(_props: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sale_prices")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [brandId, setBrandId] = useState("")
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [applyOpen, setApplyOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [scopeMode, setScopeMode] = useState<"selected" | "filters">("selected")
  const [percent, setPercent] = useState("10")
  const [duration, setDuration] = useState<DurationMode>("7")
  const [endDate, setEndDate] = useState("")
  const [preview, setPreview] = useState<PreviewPayload | null>(null)

  const categoriesQ = useQuery({
    queryKey: ["sale-prices", "categories"],
    queryFn: () => api<Named[] | { data?: Named[] }>("/api/v1/categories"),
    retry: false,
  })
  const brandsQ = useQuery({
    queryKey: ["sale-prices", "brands"],
    queryFn: () => api<Named[] | { data?: Named[] }>("/api/v1/brands"),
    retry: false,
  })
  const categories = asList(categoriesQ.data)
  const brands = asList(brandsQ.data)

  const q = useQuery({
    queryKey: ["sale-prices", "list", page, appliedSearch, categoryId, brandId],
    queryFn: async () => {
      const p = new URLSearchParams({
        page: String(page),
        per_page: "20",
        paginate: "1",
        status: "publish",
      })
      if (appliedSearch.trim()) p.set("search", appliedSearch.trim())
      if (categoryId) p.set("category_id", categoryId)
      if (brandId) p.set("brand_id", brandId)
      return api<ListPayload | ProductRow[]>(`/api/v1/products?${p.toString()}`)
    },
  })

  const items: ProductRow[] = useMemo(() => {
    const raw = q.data
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    if (Array.isArray((raw as ListPayload).data)) return (raw as ListPayload).data
    return []
  }, [q.data])

  const total =
    !Array.isArray(q.data) && q.data && "meta" in q.data
      ? Number(q.data.meta?.total ?? items.length)
      : items.length

  useEffect(() => {
    setSelectedIds((prev) => {
      if (!prev.length) return prev
      const ids = new Set(items.map((r) => r.id))
      const next = prev.filter((id) => ids.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [items])

  useEffect(() => {
    setPreview(null)
  }, [percent, duration, endDate, scopeMode, applyOpen])

  const allPageSelected = items.length > 0 && items.every((r) => selectedIds.includes(r.id))

  function toggleAllPage(checked: boolean) {
    if (checked) {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...items.map((r) => r.id)])))
    } else {
      const drop = new Set(items.map((r) => r.id))
      setSelectedIds((prev) => prev.filter((id) => !drop.has(id)))
    }
  }

  function buildBody(action: "apply" | "remove" | "preview") {
    const body: Record<string, unknown> = { action }
    if (action !== "remove") {
      body.percent = Number(percent)
      if (duration === "custom") {
        body.until = endDate
      } else {
        body.days = Number(duration)
      }
    }
    if (scopeMode === "selected") {
      body.product_ids = selectedIds
    } else {
      body.filters = {
        status: "publish",
        ...(appliedSearch.trim() ? { search: appliedSearch.trim() } : {}),
        ...(categoryId ? { category: categoryId } : {}),
        ...(brandId ? { brand: brandId } : {}),
      }
    }
    return body
  }

  const applyMut = useMutation({
    mutationFn: () =>
      api<{ ok: number; skipped: number }>("/api/v1/shop/products/bulk-sale", {
        method: "POST",
        json: buildBody("apply"),
      }),
    onSuccess: (res) => {
      toast.success(t("apply_done", { ok: res.ok }))
      setApplyOpen(false)
      void qc.invalidateQueries({ queryKey: ["sale-prices"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const previewMut = useMutation({
    mutationFn: () =>
      api<PreviewPayload>("/api/v1/shop/products/bulk-sale", {
        method: "POST",
        json: buildBody("preview"),
      }),
    onSuccess: (res) => setPreview(res),
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const removeMut = useMutation({
    mutationFn: () =>
      api<{ ok: number }>("/api/v1/shop/products/bulk-sale", {
        method: "POST",
        json: buildBody("remove"),
      }),
    onSuccess: (res) => {
      toast.success(t("remove_done", { ok: res.ok }))
      setRemoveOpen(false)
      void qc.invalidateQueries({ queryKey: ["sale-prices"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  const selectionLabel =
    selectedIds.length === 0
      ? t("select_hint")
      : t("selected_count", { count: selectedIds.length })

  const percentValid = Number(percent) > 0 && Number(percent) < 100
  const durationValid = duration !== "custom" || endDate !== ""

  function openApply(mode: "selected" | "filters") {
    if (mode === "selected" && selectedIds.length === 0) {
      toast.error(t("need_selection"))
      return
    }
    setScopeMode(mode)
    setApplyOpen(true)
  }

  function openRemove(mode: "selected" | "filters") {
    if (mode === "selected" && selectedIds.length === 0) {
      toast.error(t("need_selection"))
      return
    }
    setScopeMode(mode)
    setRemoveOpen(true)
  }

  return (
    <PageShell title={t("title")}>
      <div className="bg-sky-500/10 text-sky-950 dark:text-sky-100 mb-4 rounded-xl px-4 py-3 text-sm leading-relaxed">
        {t("banner")}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search")}
        />
        <select
          className={selectClass}
          value={categoryId}
          aria-label={t("category")}
          onChange={(e) => {
            setCategoryId(e.target.value)
            setPage(1)
          }}
        >
          <option value="">
            {t("category")}: {t("all")}
          </option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
        {brands.length > 0 ? (
          <select
            className={selectClass}
            value={brandId}
            aria-label={t("brand")}
            onChange={(e) => {
              setBrandId(e.target.value)
              setPage(1)
            }}
          >
            <option value="">
              {t("brand")}: {t("all")}
            </option>
            {brands.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setAppliedSearch(search)
            setPage(1)
          }}
        >
          {t("filter")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => openApply("filters")}>
          {t("apply_filtered")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => openRemove("filters")}>
          {t("remove_filtered")}
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={allPageSelected}
            onCheckedChange={(v) => toggleAllPage(!!v)}
            aria-label={t("select_all_page")}
          />
          <span className="text-muted-foreground">{selectionLabel}</span>
        </div>
        <p className="text-muted-foreground text-xs">{total}</p>
      </div>

      <Card className="mb-20">
        <CardContent className="p-0">
          {q.isLoading ? (
            <p className="text-muted-foreground p-6 text-sm">{tCommon("loading")}</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground p-6 text-sm">{t("empty")}</p>
          ) : (
            <ul className="divide-border divide-y">
              {items.map((row) => {
                const checked = selectedIds.includes(row.id)
                const regular = Number(row.price_minor) || 0
                const sale = Number(row.sale_price_minor) || 0
                const expired = sale > 0 && row.is_on_sale === false
                return (
                  <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                    <Checkbox checked={checked} onCheckedChange={(v) => {
                      setSelectedIds((prev) =>
                        v ? [...prev, row.id] : prev.filter((x) => x !== row.id),
                      )
                    }} />
                    {row.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.image_url} alt="" className="size-12 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="bg-muted size-12 shrink-0 rounded-md" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.name}</p>
                      {row.sku ? <p className="text-muted-foreground text-xs">{row.sku}</p> : null}
                    </div>
                    <div className="shrink-0 space-y-0.5 text-end text-sm">
                      <p className="flex items-center justify-end gap-1">
                        {t("regular")}: <MoneyDisplay amount={regular} currency={row.currency} />
                      </p>
                      <p className="text-muted-foreground flex items-center justify-end gap-1">
                        {t("sale")}:{" "}
                        {sale ? (
                          <MoneyDisplay
                            amount={sale}
                            currency={row.currency}
                            className={expired ? "line-through" : undefined}
                          />
                        ) : (
                          "—"
                        )}
                      </p>
                      {sale > 0 && row.sale_ends_at ? (
                        <p className={expired ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>
                          {expired
                            ? t("sale_expired")
                            : t("sale_until", { date: formatDisplayDate(row.sale_ends_at, locale) })}
                        </p>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-40 border-t p-3 backdrop-blur md:static md:mt-4 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <div className="mx-auto flex max-w-3xl flex-wrap justify-end gap-2 md:max-w-none">
          <Button type="button" variant="outline" onClick={() => openRemove("selected")}>
            {t("remove")}
          </Button>
          <Button type="button" onClick={() => openApply("selected")}>
            {t("apply")}
          </Button>
        </div>
      </div>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("apply")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="sale-percent">{t("percent")}</Label>
              <Input
                id="sale-percent"
                type="number"
                min={1}
                max={99}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("duration")}</Label>
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={duration === d ? "default" : "outline"}
                    onClick={() => setDuration(d)}
                  >
                    {t("preset_days", { count: Number(d) })}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant={duration === "custom" ? "default" : "outline"}
                  onClick={() => setDuration("custom")}
                >
                  {t("custom_end")}
                </Button>
              </div>
            </div>
            {duration === "custom" ? (
              <div className="space-y-1">
                <Label htmlFor="sale-end-date">{t("end_date")}</Label>
                <LocaleDatePicker locale={locale} value={endDate} onChange={(value) => setEndDate(value ?? "")} aria-label={t("end_date")} />
              </div>
            ) : null}
            {preview ? (
              <div className="border-border space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">{t("preview_title")}</p>
                <p className="text-muted-foreground text-xs">{t("preview_count", { count: preview.count })}</p>
                {preview.samples.length === 0 ? (
                  <p className="text-muted-foreground text-xs">{t("preview_empty")}</p>
                ) : (
                  <ul className="divide-border divide-y">
                    {preview.samples.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                        {s.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.image} alt="" className="size-8 shrink-0 rounded object-cover" />
                        ) : (
                          <div className="bg-muted size-8 shrink-0 rounded" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{s.name}</p>
                          {s.variations ? (
                            <p className="text-muted-foreground text-xs">
                              {t("preview_variations", { count: s.variations })}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-end text-xs">
                          <MoneyDisplay amount={s.regular_price} className="text-muted-foreground line-through" />
                          <div>
                            <MoneyDisplay amount={s.sale_price} className="font-medium" />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setApplyOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={previewMut.isPending || !percentValid}
              onClick={() => previewMut.mutate()}
            >
              {t("preview")}
            </Button>
            <Button
              type="button"
              disabled={applyMut.isPending || !percentValid || !durationValid}
              onClick={() => void applyMut.mutateAsync()}
            >
              {t("apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("remove_confirm_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("remove_confirm_body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                removeMut.mutate()
              }}
            >
              {t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
