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
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

type C2cSettings = {
  enabled?: boolean
  title?: string
  instructions?: string
  iban?: string
  deadline_hours?: number
  cards?: unknown
}

export default function C2cSettingsPageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("c2c_admin")
  const tCommon = useTranslations("common")
  const queryClient = useQueryClient()

  const [enabled, setEnabled] = useState(true)
  const [title, setTitle] = useState("")
  const [instructions, setInstructions] = useState("")
  const [iban, setIban] = useState("")
  const [deadlineHours, setDeadlineHours] = useState(24)
  const [cardsJson, setCardsJson] = useState("[]")
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
    setDeadlineHours(data.deadline_hours ?? 24)
    setCardsJson(JSON.stringify(data.cards ?? [], null, 2))
  }, [data])

  const save = useMutation({
    mutationFn: async () => {
      let cards: unknown = []
      try {
        cards = JSON.parse(cardsJson || "[]")
      } catch {
        throw new Error(t("cards_json_invalid"))
      }
      return api("/api/v1/c2c/settings", {
        method: "PUT",
        json: {
          payload: {
            enabled,
            title,
            instructions,
            iban,
            deadline_hours: deadlineHours,
            cards,
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
    <div className="space-y-6 p-6" dir="auto">
      <div>
        <h1 className="text-2xl font-bold">{t("settings_title")}</h1>
        <p className="text-muted-foreground text-sm">{route.fullPath}</p>
      </div>

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
              <div>
                <Label>{t("cards_json")}</Label>
                <Textarea
                  className="mt-1 font-mono text-sm"
                  rows={8}
                  value={cardsJson}
                  onChange={(e) => setCardsJson(e.target.value)}
                  dir="ltr"
                />
              </div>
              <Button disabled={save.isPending} onClick={() => save.mutate()}>
                {tCommon("save")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
