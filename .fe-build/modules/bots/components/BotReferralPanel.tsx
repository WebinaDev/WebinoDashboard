"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
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
  const [enabled, setEnabled] = useState(false)
  const [points, setPoints] = useState(50)
  const [welcomeBonus, setWelcomeBonus] = useState(0)
  const [webappUrl, setWebappUrl] = useState("")

  const q = useQuery({
    queryKey: ["bots", provider, "settings"],
    queryFn: () => api<BotSettings>(settingsPath(provider)),
  })

  useEffect(() => {
    if (!q.data) return
    const m = q.data.meta ?? {}
    const r = (m.referral ?? {}) as Record<string, unknown>
    const club = (m.club ?? {}) as Record<string, unknown>
    setEnabled(Boolean(r.enabled ?? m.addons?.referral))
    setPoints(Number(r.points ?? club.referral_points ?? 50))
    setWelcomeBonus(Number(r.welcome_bonus ?? 0))
    setWebappUrl(String(r.webapp_base_url ?? club.webapp_base_url ?? ""))
  }, [q.data])

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
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  if (q.isLoading) return <FormSettingsSkeleton cards={1} fieldsPerCard={4} />

  return (
    <BotSection title={t("referral.title")} description={t("referral.hint")}>
      <div className="grid max-w-xl gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(Boolean(v))} />
          {t("referral.enabled")}
        </label>
        <div className="space-y-1">
          <Label>{t("referral.points")}</Label>
          <Input type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value) || 0)} />
        </div>
        <div className="space-y-1">
          <Label>{t("referral.welcomeBonus")}</Label>
          <Input type="number" min={0} value={welcomeBonus} onChange={(e) => setWelcomeBonus(Number(e.target.value) || 0)} />
        </div>
        <div className="space-y-1">
          <Label>{t("referral.webappUrl")}</Label>
          <Input dir="ltr" value={webappUrl} onChange={(e) => setWebappUrl(e.target.value)} placeholder="https://…" />
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
