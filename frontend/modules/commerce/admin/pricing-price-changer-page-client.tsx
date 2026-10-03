"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
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

export default function PricingPriceChangerPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const enumLabel = useEnumLabel()
  const t = useTranslations("store")
  const tCommon = useTranslations("common")

  const [changeType, setChangeType] = useState<"fixed" | "percent">("percent")
  const [value, setValue] = useState(0)
  const [applyToSale, setApplyToSale] = useState(false)
  const [rounding, setRounding] = useState(false)
  const [roundStep, setRoundStep] = useState(1000)
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily")
  const [hour, setHour] = useState(3)
  const [weekday, setWeekday] = useState(0)
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
          rounding,
          round_step: roundStep,
        },
      }),
    onSuccess: async () => {
      setMessage(t("price_change_started"))
      setError(null)
      await refetch()
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
        value?: number
        apply_to_sale?: boolean
        rounding?: boolean
        round_step?: number
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
    if (row.value != null) setValue(Number(row.value))
    if (row.apply_to_sale != null) setApplyToSale(Boolean(row.apply_to_sale))
    if (row.rounding != null) setRounding(Boolean(row.rounding))
    if (row.round_step != null) setRoundStep(Number(row.round_step))
  }, [scheduleQ.data])

  const saveSchedule = useMutation({
    mutationFn: () =>
      api("/api/v1/pricing/bulk-price-change/schedule", {
        method: "PUT",
        json: {
          enabled: scheduleEnabled,
          change_type: changeType,
          value: Number(value),
          apply_to_sale: applyToSale,
          category_slugs: categorySlugs,
          rounding,
          round_step: roundStep,
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

  const running = job?.status === "running" || job?.locked

  function toggleCategory(id: number) {
    setSelectedCategoryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div className="space-y-6" dir="auto">
      <div>
        <h1 className="text-2xl font-bold">{t("price_changer_title")}</h1>
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
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={rounding} onCheckedChange={(v) => setRounding(Boolean(v))} />
            {t("rounding")}
          </label>
          {rounding ? (
            <div>
              <Label>{t("round_step")}</Label>
              <Input type="number" min={1} value={roundStep} onChange={(e) => setRoundStep(Number(e.target.value))} />
            </div>
          ) : null}
          <Button onClick={() => start.mutate()} disabled={start.isPending || Boolean(running)}>
            {t("start_price_change")}
          </Button>
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
          <div>
            <Label>{t("schedule_frequency")}</Label>
            <select className={selectClass} value={frequency} onChange={(e) => setFrequency(e.target.value === "weekly" ? "weekly" : "daily")}>
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
