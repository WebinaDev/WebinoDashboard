"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useId, useState } from "react"
import { toast } from "sonner"

import { FormSettingsSkeleton } from "@/components/TableListSkeleton"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"

import { BotSection } from "../lib/bot-admin-ui"
import type { BotSettings } from "../lib/bot-settings"
import { settingsPath } from "../lib/bot-settings"
import type { LiveBotProvider } from "../lib/platforms"

export function BotReferralPanel({ provider }: { provider: LiveBotProvider }) {
  const t = useTranslations("bots")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const id = useId()
  const [draft, setDraft] = useState<{ provider: LiveBotProvider; values: Partial<{ enabled: boolean; points: number; welcomeBonus: number; webappUrl: string }> } | null>(null)

  const q = useQuery({
    queryKey: ["bots", provider, "settings"],
    queryFn: () => api<BotSettings>(settingsPath(provider)),
  })

  const meta = q.data?.meta ?? {}
  const referral = (meta.referral ?? {}) as Record<string, unknown>
  const club = (meta.club ?? {}) as Record<string, unknown>
  const values = draft?.provider === provider ? draft.values : {}
  const enabled = values.enabled ?? Boolean(referral.enabled ?? meta.addons?.referral)
  const points = values.points ?? Number(referral.points ?? club.referral_points ?? 50)
  const welcomeBonus = values.welcomeBonus ?? Number(referral.welcome_bonus ?? 0)
  const webappUrl = values.webappUrl ?? String(referral.webapp_base_url ?? club.webapp_base_url ?? "")
  const update = (changes: typeof values) => setDraft((previous) => ({
    provider,
    values: { ...(previous?.provider === provider ? previous.values : {}), ...changes },
  }))

  const save = useMutation({
    mutationFn: () =>
      api(settingsPath(provider), {
        method: "PUT",
        json: {
          meta: {
            ...(q.data?.meta ?? {}),
            addons: { ...(q.data?.meta?.addons ?? {}), referral: enabled, loyalty: enabled || Boolean(q.data?.meta?.addons?.loyalty) },
            referral: { enabled, points, welcome_bonus: welcomeBonus, webapp_base_url: webappUrl },
            club: {
              ...((q.data?.meta?.club as Record<string, unknown>) ?? {}),
              referral_points: points,
              webapp_base_url: webappUrl,
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

  if (q.isLoading) return <FormSettingsSkeleton cards={1} fieldsPerCard={4} />

  return (
    <BotSection title={t("referral.title")} description={t("referral.hint")}>
      <div className="grid max-w-xl gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={enabled} onCheckedChange={(v) => update({ enabled: Boolean(v) })} />
          {t("referral.enabled")}
        </label>
        <div className="space-y-1">
          <Label htmlFor={`${id}-points`}>{t("referral.points")}</Label>
          <Input id={`${id}-points`} type="number" min={0} value={points} onChange={(e) => update({ points: Number(e.target.value) || 0 })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-welcome`}>{t("referral.welcomeBonus")}</Label>
          <Input id={`${id}-welcome`} type="number" min={0} value={welcomeBonus} onChange={(e) => update({ welcomeBonus: Number(e.target.value) || 0 })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-url`}>{t("referral.webappUrl")}</Label>
          <Input id={`${id}-url`} dir="ltr" value={webappUrl} onChange={(e) => update({ webappUrl: e.target.value })} placeholder="https://…" />
        </div>
        {q.data?.meta?.bot_username ? (
          <p className="text-muted-foreground text-xs" dir="ltr">
            {t("referral.inviteHint")}:{" "}
            {provider === "bale" ? "https://ble.ir/" : "https://t.me/"}
            {String(q.data.meta.bot_username).replace(/^@/, "")}?start=ref_CHATID
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">{t("referral.needUsername")}</p>
        )}
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {tCommon("save")}
        </Button>
      </div>
    </BotSection>
  )
}
