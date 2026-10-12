"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { LocaleTimePicker, normalizeClock } from "@/components/LocaleTimePicker"
import { formatDate } from "@/lib/locale/format-date"
import type { ResolvedAdminRoute } from "@/kernel/types"
import type { CafeHoursDay, CafeHoursSettings } from "@/themes/cafe-starter/types"
import { api } from "@/lib/api"

const DAY_KEYS = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"] as const

export default function HoursPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.hours")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const [newDate, setNewDate] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["cafe-hours-settings"],
    queryFn: () => api<CafeHoursSettings>("/api/v1/cafe/hours-settings"),
  })

  const [form, setForm] = useState<CafeHoursSettings | null>(null)
  const values: CafeHoursSettings = form ?? data ?? { timezone: "Asia/Tehran", days: [] }

  const days: CafeHoursDay[] = DAY_KEYS.map((key) => {
    const found = values.days.find((row) => row.day === key || row.day === t(`days.${key}`))
    return { day: key, open: normalizeClock(found?.open) ?? "09:00", close: normalizeClock(found?.close) ?? "22:00", closed: found?.closed ?? false }
  })

  const save = useMutation({
    mutationFn: () =>
      api<CafeHoursSettings>("/api/v1/cafe/hours-settings", {
        method: "PATCH",
        json: { ...values, days },
      }),
    onSuccess: async () => {
      setMessage(t("saved"))
      await queryClient.invalidateQueries({ queryKey: ["cafe-hours-settings"] })
    },
  })

  function updateDay(index: number, patch: Partial<CafeHoursDay>) {
    const next = [...days]
    next[index] = { ...next[index], ...patch }
    setForm({ ...values, days: next })
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>
      {isLoading ? <p>{tCommon("loading")}</p> : null}
      {message ? <p className="text-sm text-green-600">{message}</p> : null}

      <Card>
        <CardHeader><CardTitle>{t("schedule_heading")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {days.map((day, index) => (
            <div key={`${day.day}-${index}`} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4">
              <p className="font-medium sm:col-span-1">{t(`days.${day.day}`)}</p>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{t("open")}</Label>
                <LocaleTimePicker locale={locale} value={day.open ?? null} disabled={Boolean(day.closed)} aria-label={t("open")} onChange={(v) => updateDay(index, { open: v })} />
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{t("close")}</Label>
                <LocaleTimePicker locale={locale} value={day.close ?? null} disabled={Boolean(day.closed)} aria-label={t("close")} onChange={(v) => updateDay(index, { close: v })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={Boolean(day.closed)} onCheckedChange={(v) => updateDay(index, { closed: Boolean(v) })} />
                {t("closed")}
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("closed_dates_heading")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Label>{t("closed_dates_hint")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <LocaleDatePicker locale={locale} value={newDate} onChange={setNewDate} aria-label={t("closed_dates_heading")} />
            <Button
              type="button"
              variant="outline"
              disabled={!newDate}
              onClick={() => {
                if (!newDate) return
                const list = Array.from(new Set([...(values.closed_dates ?? []), newDate])).sort()
                setForm({ ...values, days, closed_dates: list })
                setNewDate(null)
              }}
            >
              {t("add_date")}
            </Button>
          </div>
          {(values.closed_dates ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("no_dates")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {(values.closed_dates ?? []).map((d) => (
                <li key={d} className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                  {formatDate(d, { locale: locale === "en" ? "en" : "fa" })}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={t("remove_date")}
                    onClick={() => setForm({ ...values, days, closed_dates: (values.closed_dates ?? []).filter((x) => x !== d) })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>{tCommon("save")}</Button>
    </div>
  )
}
