"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useId, useState } from "react"
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
  const id = useId()
  const [draft, setDraft] = useState<{ provider: LiveBotProvider; templates?: Record<string, string>; texts?: Record<string, string>; faq?: string; dailyPoints?: number } | null>(null)

  const q = useQuery({
    queryKey: ["bots", provider, "settings"],
    queryFn: () => api<BotSettings>(settingsPath(provider)),
  })

  const meta = q.data?.meta ?? {}
  const current = draft?.provider === provider ? draft : null
  const templates = { ...(meta.templates ?? {}), ...(current?.templates ?? {}) }
  const texts = { ...((meta.texts as Record<string, string>) ?? {}), ...(current?.texts ?? {}) }
  const faq = current?.faq ?? faqToText(meta.faq)
  const dailyPoints = current?.dailyPoints ?? Number(((meta.club ?? {}) as Record<string, unknown>).daily_points ?? 0)
  const update = (changes: Omit<NonNullable<typeof draft>, "provider">) => setDraft((previous) => ({
    ...(previous?.provider === provider ? previous : {}), provider, ...changes,
  }))

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
      setDraft((previous) => previous?.provider === provider ? null : previous)
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
              <Label htmlFor={`${id}-template-${k}`} className="text-xs">{t(`engine.tpl.${k}`)}</Label>
              <textarea
                id={`${id}-template-${k}`}
                className={textareaClass}
                value={templates[k] ?? ""}
                onChange={(e) => update({ templates: { ...current?.templates, [k]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      </BotSection>

      <BotSection title={t("texts.extraTitle")} description={t("texts.extraHint")}>
        <div className="space-y-3">
          {textFields.map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`${id}-text-${k}`} className="text-xs">{t(`texts.fields.${k}`)}</Label>
              <textarea
                id={`${id}-text-${k}`}
                className={textareaClass}
                value={texts[k] ?? ""}
                onChange={(e) => update({ texts: { ...current?.texts, [k]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      </BotSection>

      {q.data?.meta?.addons?.faq ? (
        <BotSection title={t("engine.faq")} description={t("engine.faqPh")}>
          <textarea aria-label={t("engine.faq")} className={textareaClass} value={faq} onChange={(e) => update({ faq: e.target.value })} placeholder={t("engine.faqPh")} />
        </BotSection>
      ) : null}

      {q.data?.meta?.addons?.loyalty ? (
        <BotSection title={t("engine.dailyPoints")}>
          <InputNumber label={t("engine.dailyPoints")} value={dailyPoints} onChange={(value) => update({ dailyPoints: value })} />
        </BotSection>
      ) : null}

      <Button disabled={save.isPending} onClick={() => save.mutate()}>
        {tCommon("save")}
      </Button>
    </div>
  )
}

function InputNumber({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      aria-label={label}
      min={0}
      className="border-input bg-background h-9 w-32 rounded-md border px-3 text-sm"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  )
}
