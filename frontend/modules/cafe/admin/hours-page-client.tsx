"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ResolvedAdminRoute } from "@/kernel/types"
import type { CafeHoursDay, CafeHoursSettings } from "@/themes/cafe-starter/types"
import { api } from "@/lib/api"

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

export default function HoursPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("cafe_admin.hours")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["cafe-hours-settings"],
    queryFn: () => api<CafeHoursSettings>("/api/v1/cafe/hours-settings"),
  })

  const [form, setForm] = useState<CafeHoursSettings | null>(null)
  const values: CafeHoursSettings = form ?? data ?? { timezone: "Asia/Tehran", days: [] }

  const days: CafeHoursDay[] =
    values.days.length > 0
      ? values.days
      : DAY_KEYS.map((day) => ({ day: t(`days.${day}`), open: "09:00", close: "22:00", closed: false }))

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
              <p className="font-medium sm:col-span-1">{day.day}</p>
              <Input value={day.open ?? ""} onChange={(e) => updateDay(index, { open: e.target.value })} placeholder={t("open")} />
              <Input value={day.close ?? ""} onChange={(e) => updateDay(index, { close: e.target.value })} placeholder={t("close")} />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={Boolean(day.closed)} onCheckedChange={(v) => updateDay(index, { closed: Boolean(v) })} />
                {t("closed")}
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>{tCommon("save")}</Button>
    </div>
  )
}
