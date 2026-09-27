"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"

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

type JobState = {
  status?: string
  locked?: boolean
  params?: Record<string, unknown>
  state?: { processed?: number; updated?: number; skipped?: number; total?: number }
  last_log?: string | null
} | null

type CategoryRow = { id: number; name: string; slug: string }

type Preview = {
  total: number
  locked: number
  eligible: number
  sample: Array<{ id: number; name: string; price_minor: number; lock_price?: boolean }>
}

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

export default function PricingPriceChangerPageClient({ route }: { route: ResolvedAdminRoute }) {
  const enumLabel = useEnumLabel()
  const t = useTranslations("store")
  const tCommon = useTranslations("common")

  const [changeType, setChangeType] = useState<"fixed" | "percent">("percent")
  const [value, setValue] = useState(0)
  const [applyToSale, setApplyToSale] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const { data: categories = [] } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => api<CategoryRow[]>("/api/v1/categories"),
  })

  const categorySlugs = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c.slug]))
    return selectedCategoryIds.map((id) => byId.get(id)).filter(Boolean) as string[]
  }, [categories, selectedCategoryIds])

  const previewParams = useMemo(() => {
    const p = new URLSearchParams()
    categorySlugs.forEach((slug) => p.append("category_slugs[]", slug))
    return p.toString()
  }, [categorySlugs])

  const { data: preview } = useQuery({
    queryKey: ["bulk-price-change-preview", categorySlugs],
    queryFn: () => api<Preview>(`/api/v1/pricing/bulk-price-change/preview?${previewParams}`),
  })

  const { data: job, refetch } = useQuery({
    queryKey: ["bulk-price-change-state"],
    queryFn: () => api<JobState>("/api/v1/pricing/bulk-price-change/state"),
    refetchInterval: 5000,
  })

  const start = useMutation({
    mutationFn: () =>
      api("/api/v1/pricing/bulk-price-change/start", {
        method: "POST",
        json: {
          change_type: changeType,
          value: Number(value),
          apply_to_sale: applyToSale,
          category_slugs: categorySlugs,
        },
      }),
    onSuccess: async () => {
      setMessage(t("price_change_started"))
      setError(null)
      await refetch()
    },
    onError: (e: Error) => setError(getApiErrorMessage(e)),
  })

  const running = job?.status === "running" || job?.locked

  function toggleCategory(id: number) {
    setSelectedCategoryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6" dir="auto">
      <div>
        <h1 className="text-2xl font-bold">{t("price_changer_title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("price_changer_form")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
            <Label>{t("change_value")}</Label>
            <Input type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} />
          </div>
          <div>
            <Label>{t("price_change_categories")}</Label>
            <p className="text-muted-foreground mb-2 text-xs">{t("price_change_categories_hint")}</p>
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
              {categories.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("empty_categories")}</p>
              ) : (
                categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedCategoryIds.includes(c.id)}
                      onCheckedChange={() => toggleCategory(c.id)}
                    />
                    {c.name}
                  </label>
                ))
              )}
            </div>
          </div>
          {preview ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p>{t("price_change_preview_count", { total: preview.total, eligible: preview.eligible, locked: preview.locked })}</p>
              {preview.sample.length > 0 ? (
                <ul className="text-muted-foreground mt-2 space-y-1">
                  {preview.sample.map((p) => (
                    <li key={p.id}>
                      {p.name} · <MoneyDisplay amount={p.price_minor} />
                      {p.lock_price ? ` (${t("lock_price")})` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-2 text-xs">{t("price_change_preview_empty")}</p>
              )}
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={applyToSale} onCheckedChange={(v) => setApplyToSale(Boolean(v))} />
            {t("apply_to_sale")}
          </label>
          <Button onClick={() => start.mutate()} disabled={start.isPending || Boolean(running)}>
            {t("start_price_change")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{t("price_changer_state")}</CardTitle>
          {job?.status ? <Badge variant={statusBadgeVariant(job.status)}>{enumLabel("job_status", job.status)}</Badge> : <Badge variant="outline">{t("idle")}</Badge>}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
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
              </p>
              {job.last_log ? <p className="text-muted-foreground whitespace-pre-wrap">{job.last_log}</p> : null}
              <Button size="sm" variant="outline" onClick={() => void refetch()}>
                {tCommon("try_again")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
