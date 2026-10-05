"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type CardRow = { number: string; name: string; bank: string }

type C2cSettings = {
  enabled?: boolean
  title?: string
  instructions?: string
  iban?: string
  deadline_hours?: number
  cards?: CardRow[]
}

function parseCards(raw: unknown): CardRow[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      const r = row as Record<string, unknown>
      return {
        number: String(r.number ?? ""),
        name: String(r.name ?? ""),
        bank: String(r.bank ?? ""),
      }
    })
    .filter((c) => c.number || c.name || c.bank)
}

export default function C2cSettingsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("c2c_admin")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()

  const [enabled, setEnabled] = useState(true)
  const [title, setTitle] = useState("")
  const [instructions, setInstructions] = useState("")
  const [iban, setIban] = useState("")
  const [deadlineHours, setDeadlineHours] = useState(2)
  const [cards, setCards] = useState<CardRow[]>([{ number: "", name: "", bank: "" }])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["c2c-settings"],
    queryFn: () => api<C2cSettings>("/api/v1/c2c/settings"),
  })

  useEffect(() => {
    if (!data) return
    setEnabled(Boolean(data.enabled))
    setTitle(data.title || "")
    setInstructions(data.instructions || "")
    setIban(data.iban || "")
    setDeadlineHours(data.deadline_hours ?? 2)
    const parsed = parseCards(data.cards)
    setCards(parsed.length ? parsed : [{ number: "", name: "", bank: "" }])
  }, [data])

  const save = useMutation({
    mutationFn: async () => {
      const payloadCards = cards.filter((c) => c.number.trim() || c.name.trim() || c.bank.trim())
      return api("/api/v1/c2c/settings", {
        method: "PUT",
        json: {
          payload: {
            enabled,
            title,
            instructions,
            iban,
            deadline_hours: deadlineHours,
            cards: payloadCards,
          },
        },
      })
    },
    onSuccess: async () => {
      setSaved(true)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ["c2c-settings"] })
    },
    onError: (e: Error) => {
      setSaved(false)
      setError(getApiErrorMessage(e))
    },
  })

  return (
    <PageShell title={t("settings_title")}>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {saved ? <p className="text-sm text-green-700 dark:text-green-400">{t("saved")}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("settings_heading")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
                {t("enabled")}
              </label>
              <div>
                <Label>{t("title_field")}</Label>
                <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label>{t("instructions")}</Label>
                <Textarea className="mt-1" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
              </div>
              <div>
                <Label>{t("iban")}</Label>
                <Input className="mt-1" value={iban} onChange={(e) => setIban(e.target.value)} dir="ltr" />
              </div>
              <div>
                <Label>{t("deadline_hours")}</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={deadlineHours}
                  onChange={(e) => setDeadlineHours(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>{t("cards_list")}</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCards((prev) => [...prev, { number: "", name: "", bank: "" }])}
                  >
                    {t("add_card")}
                  </Button>
                </div>
                {cards.map((card, idx) => (
                  <div key={idx} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <Input
                      dir="ltr"
                      placeholder={t("card_number")}
                      value={card.number}
                      onChange={(e) =>
                        setCards((prev) => prev.map((c, i) => (i === idx ? { ...c, number: e.target.value } : c)))
                      }
                    />
                    <Input placeholder={t("card_holder")} value={card.name} onChange={(e) => setCards((prev) => prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c)))} />
                    <Input placeholder={t("card_bank")} value={card.bank} onChange={(e) => setCards((prev) => prev.map((c, i) => (i === idx ? { ...c, bank: e.target.value } : c)))} />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={cards.length <= 1}
                      onClick={() => setCards((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
              <Button disabled={save.isPending} onClick={() => save.mutate()}>
                {tCommon("save")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </PageShell>
  )
}
