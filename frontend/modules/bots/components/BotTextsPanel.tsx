"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { BotSection, textareaClass } from "../lib/bot-admin-ui"
import { TEMPLATE_KEYS, type BotSettings } from "../lib/bot-settings"
import { settingsPath } from "../lib/bot-settings"
import type { LiveBotProvider } from "../lib/platforms"

type FaqItem = { q: string; a: string; keywords?: string }

const faqToText = (items: unknown) =>
  (Array.isArray(items) ? (items as FaqItem[]) : [])
    .map((i) => [i.q, i.a, i.keywords ?? ""].join(" | ").replace(/ \| $/, ""))
    .join("\n")

const textToFaq = (text: string): FaqItem[] =>
  text
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter((p) => p[0] && p[1])
    .map((p) => ({ q: p[0], a: p[1], keywords: p[2] ?? "" }))

export function BotTextsPanel({ provider }: { provider: LiveBotProvider }) {
  const t = useTranslations("bots")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const [templates, setTemplates] = useState<Record<string, string>>({})
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [faq, setFaq] = useState("")
  const [dailyPoints, setDailyPoints] = useState(0)

  const q = useQuery({
    queryKey: ["bots", provider, "settings"],
    queryFn: () => api<BotSettings>(settingsPath(provider)),
  })

  useEffect(() => {
    if (!q.data) return
    const m = q.data.meta ?? {}
    setTemplates({ ...(m.templates ?? {}) })
    setTexts({ ...((m.texts as Record<string, string>) ?? {}) })
    setFaq(faqToText(m.faq))
    setDailyPoints(Number(((m.club ?? {}) as Record<string, unknown>).daily_points ?? 0))
  }, [q.data])

  const save = useMutation({
    mutationFn: () =>
      api(settingsPath(provider), {
        method: "PUT",
        json: {
          meta: {
            ...(q.data?.meta ?? {}),
            templates,
            texts,
            faq: textToFaq(faq),
            club: {
              ...((q.data?.meta?.club as Record<string, unknown>) ?? {}),
              daily_points: dailyPoints,
            },
          },
        },
      }),
    onSuccess: async () => {
      toast.success(tCommon("saved"))
      await qc.invalidateQueries({ queryKey: ["bots", provider, "settings"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (q.isLoading) return <FormSettingsSkeleton cards={2} fieldsPerCard={4} />

  const textFields = ["error_text", "contact_button", "store_button", "auth_success", "support_contact"] as const

  return (
    <div className="space-y-4">
      <BotSection title={t("texts.templatesTitle")} description={t("engine.templatesHint")}>
        <div className="space-y-3">
          {TEMPLATE_KEYS.map((k) => (
            <div key={k} className="space-y-1">
              <Label className="text-xs">{t(`engine.tpl.${k}`)}</Label>
              <textarea
                className={textareaClass}
                value={templates[k] ?? ""}
                onChange={(e) => setTemplates((prev) => ({ ...prev, [k]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </BotSection>

      <BotSection title={t("texts.extraTitle")} description={t("texts.extraHint")}>
        <div className="space-y-3">
          {textFields.map((k) => (
            <div key={k} className="space-y-1">
              <Label className="text-xs">{t(`texts.fields.${k}`)}</Label>
              <textarea
                className={textareaClass}
                value={texts[k] ?? ""}
                onChange={(e) => setTexts((prev) => ({ ...prev, [k]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </BotSection>

      {q.data?.meta?.addons?.faq ? (
        <BotSection title={t("engine.faq")} description={t("engine.faqPh")}>
          <textarea className={textareaClass} value={faq} onChange={(e) => setFaq(e.target.value)} placeholder={t("engine.faqPh")} />
        </BotSection>
      ) : null}

      {q.data?.meta?.addons?.loyalty ? (
        <BotSection title={t("engine.dailyPoints")}>
          <InputNumber value={dailyPoints} onChange={setDailyPoints} />
        </BotSection>
      ) : null}

      <Button disabled={save.isPending} onClick={() => save.mutate()}>
        {tCommon("save")}
      </Button>
    </div>
  )
}

function InputNumber({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      min={0}
      className="border-input bg-background h-9 w-32 rounded-md border px-3 text-sm"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  )
}
