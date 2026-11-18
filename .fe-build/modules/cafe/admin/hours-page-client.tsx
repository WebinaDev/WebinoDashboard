"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { LocaleDatePicker } from "@/components/LocaleDatePicker"
import { LocaleTimePicker, normalizeClock } from "@/components/LocaleTimePicker"
import { formatDate } from "@/lib/locale/format-date"
import type { ResolvedAdminRoute } from "@/kernel/types"
import type { CafeHoursDay, CafeHoursSettings } from "@/themes/cafe-starter/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { CafeAdminShell, CafeEmptyState, CafeSection } from "./cafe-admin-ui"

const DAY_KEYS = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"] as const

export default function HoursPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.hours")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const [newDate, setNewDate] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["cafe-hours-settings"],
    queryFn: () => api<CafeHoursSettings>("/api/v1/cafe/hours-settings"),
  })

  const [form, setForm] = useState<CafeHoursSettings | null>(null)
  const values: CafeHoursSettings = form ?? data ?? { timezone: "Asia/Tehran", days: [] }

  const days: CafeHoursDay[] = DAY_KEYS.map((key) => {
    const found = values.days.find((row) => row.day === key || row.day === t(`days.${key}`))
    return {
      day: key,
      open: normalizeClock(found?.open) ?? "09:00",
      close: normalizeClock(found?.close) ?? "22:00",
      closed: found?.closed ?? false,
    }
  })

  const save = useMutation({
    mutationFn: () =>
      api<CafeHoursSettings>("/api/v1/cafe/hours-settings", {
        method: "PATCH",
        json: { ...values, days },
      }),
    onSuccess: async () => {
      toast.success(t("saved"))
      await queryClient.invalidateQueries({ queryKey: ["cafe-hours-settings"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  function updateDay(index: number, patch: Partial<CafeHoursDay>) {
    const next = [...days]
    next[index] = { ...next[index], ...patch }
    setForm({ ...values, days: next })
  }

  return (
    <CafeAdminShell
      title={t("title")}
      description={t("description")}
      actions={
        <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
          {tCommon("save")}
        </Button>
      }
    >
      {isLoading ? <p className="text-muted-foreground text-sm">{tCommon("loading")}</p> : null}

      <CafeSection title={t("schedule_heading")} description={t("schedule_hint")}>
        <div className="space-y-2">
          {days.map((day, index) => (
            <div
              key={`${day.day}-${index}`}
              className="grid items-end gap-2 rounded-lg border px-3 py-2.5 sm:grid-cols-[minmax(0,7rem)_1fr_1fr_auto]"
            >
              <p className="text-sm font-medium">{t(`days.${day.day}`)}</p>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{t("open")}</Label>
                <LocaleTimePicker
                  locale={locale}
                  value={day.open ?? null}
                  disabled={Boolean(day.closed)}
                  aria-label={t("open")}
                  onChange={(v) => updateDay(index, { open: v })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{t("close")}</Label>
                <LocaleTimePicker
                  locale={locale}
                  value={day.close ?? null}
                  disabled={Boolean(day.closed)}
                  aria-label={t("close")}
                  onChange={(v) => updateDay(index, { close: v })}
                />
              </div>
              <label className="flex h-9 items-center gap-2 text-sm">
                <Checkbox checked={Boolean(day.closed)} onCheckedChange={(v) => updateDay(index, { closed: Boolean(v) })} />
                {t("closed")}
              </label>
            </div>
          ))}
        </div>
      </CafeSection>

      <CafeSection title={t("closed_dates_heading")} description={t("closed_dates_hint")}>
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
          <CafeEmptyState message={t("no_dates")} />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {(values.closed_dates ?? []).map((d) => (
              <li key={d} className="bg-muted/40 flex items-center gap-1 rounded-md border pe-1 ps-2.5 py-1 text-sm">
                {formatDate(d, { locale: locale === "en" ? "en" : "fa" })}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  title={t("remove_date")}
                  aria-label={t("remove_date")}
                  onClick={() => setForm({ ...values, days, closed_dates: (values.closed_dates ?? []).filter((x) => x !== d) })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CafeSection>
    </CafeAdminShell>
  )
}
