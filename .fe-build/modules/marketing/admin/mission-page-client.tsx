"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Target, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { dashboardPath } from "@/kernel/paths"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { api } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-helpers"
import {
  SettingsSaveBar,
  useDraftSettings,
} from "@/views/settings/use-tenant-settings"

import { MarketingSection } from "../lib/marketing-admin-ui"

type LoyaltyDraft = {
  enabled?: boolean
  point_price_minor?: number
  max_points_per_product?: number
  welcome_points?: number
  daily_points?: number
  referral_points?: number
}

type Mission = {
  id?: number
  type: string
  title: string
  description?: string | null
  points: number
  config?: {
    target_count?: number
    target_amount_minor?: number
    cooldown_hours?: number
    url?: string
    code?: string
  }
  is_active?: boolean
}

const MISSION_TYPES = [
  "daily_checkin",
  "welcome",
  "referral",
  "first_order",
  "order_count",
  "order_amount",
  "review",
  "birthday",
  "custom",
] as const

const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"

const blankMission = (): Mission => ({
  type: "custom",
  title: "",
  description: "",
  points: 10,
  config: { cooldown_hours: 0 },
  is_active: true,
})

export default function MissionPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("marketing_loyalty_tools")
  const tHub = useTranslations("settings_hub")
  const tCommon = useTranslations("common")
  const qc = useQueryClient()
  const { loading, draft, setDraft, persist, pending, saved, error } = useDraftSettings<LoyaltyDraft>(
    "shop",
    "loyalty",
  )
  const [missions, setMissions] = useState<Mission[]>([])

  const missionsQ = useQuery({
    queryKey: ["loyalty-missions"],
    queryFn: async () => {
      const res = await api<Mission[]>("/api/v1/loyalty/missions")
      return Array.isArray(res) ? res : []
    },
  })

  useEffect(() => {
    if (missionsQ.data) setMissions(missionsQ.data)
  }, [missionsQ.data])

  const saveMissions = useMutation({
    mutationFn: () =>
      api<Mission[]>("/api/v1/loyalty/missions", {
        method: "PUT",
        json: { missions },
      }),
    onSuccess: async (res) => {
      setMissions(Array.isArray(res) ? res : [])
      toast.success(t("mission.missions_saved"))
      await qc.invalidateQueries({ queryKey: ["loyalty-missions"] })
    },
    onError: (e: Error) => toast.error(getApiErrorMessage(e)),
  })

  function patch(i: number, next: Partial<Mission>) {
    setMissions((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...next } : m)))
  }

  function patchConfig(i: number, next: NonNullable<Mission["config"]>) {
    setMissions((prev) =>
      prev.map((m, idx) => (idx === i ? { ...m, config: { ...(m.config ?? {}), ...next } } : m)),
    )
  }

  return (
    <PageShell
      title={t("mission.title")}
      description={t("mission.subtitle")}
      eyebrow={t("eyebrow")}
      actions={
        <Button variant="outline" asChild>
          <Link href={dashboardPath("marketing/customer-return")}>{t("back_hub")}</Link>
        </Button>
      }
    >
      {loading || !draft ? (
        <p className="text-muted-foreground text-sm">{tHub("loading")}</p>
      ) : (
        <div className="space-y-6">
          <MarketingSection
            title={t("mission.points_heading")}
            description={t("mission.points_hint")}
            icon={Target}
          >
            <div className="flex max-w-lg items-center justify-between gap-3">
              <Label>{t("mission.enabled")}</Label>
              <Switch
                checked={Boolean(draft.enabled)}
                onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
              />
            </div>
            <div className="grid max-w-sm gap-2">
              <Label>{t("mission.point_price")}</Label>
              <Input
                type="number"
                min={1}
                value={Number(draft.point_price_minor ?? 1000)}
                onChange={(e) => setDraft({ ...draft, point_price_minor: Number(e.target.value) })}
              />
            </div>
            <div className="grid max-w-sm gap-2">
              <Label>{t("mission.max_points")}</Label>
              <Input
                type="number"
                min={0}
                value={Number(draft.max_points_per_product ?? 150)}
                onChange={(e) =>
                  setDraft({ ...draft, max_points_per_product: Number(e.target.value) })
                }
              />
            </div>
            <div className="grid max-w-sm gap-2">
              <Label>{t("mission.welcome_points")}</Label>
              <Input
                type="number"
                min={0}
                value={Number(draft.welcome_points ?? 0)}
                onChange={(e) => setDraft({ ...draft, welcome_points: Number(e.target.value) })}
              />
              <p className="text-muted-foreground text-xs">{t("zero_hint")}</p>
            </div>
            <div className="grid max-w-sm gap-2">
              <Label>{t("mission.referral_points")}</Label>
              <Input
                type="number"
                min={0}
                value={Number(draft.referral_points ?? 0)}
                onChange={(e) => setDraft({ ...draft, referral_points: Number(e.target.value) })}
              />
            </div>
            <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
          </MarketingSection>

          <MarketingSection
            title={t("mission.engine_heading")}
            description={t("mission.engine_hint")}
            icon={Target}
          >
            {missionsQ.isLoading ? (
              <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
            ) : (
              <div className="space-y-4">
                {missions.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("mission.empty")}</p>
                ) : null}
                {missions.map((m, i) => (
                  <div key={m.id ?? `new-${i}`} className="space-y-3 rounded-lg border p-3">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="grid gap-2">
                        <Label>{t("mission.type")}</Label>
                        <select
                          className={selectClass}
                          value={m.type}
                          onChange={(e) => patch(i, { type: e.target.value })}
                        >
                          {MISSION_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {t(`mission.types.${type}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-2 sm:col-span-1 lg:col-span-2">
                        <Label>{t("mission.mission_title")}</Label>
                        <Input value={m.title} onChange={(e) => patch(i, { title: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label>{t("mission.points")}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={m.points}
                          onChange={(e) => patch(i, { points: Number(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>{t("mission.description")}</Label>
                      <Textarea
                        rows={2}
                        value={m.description ?? ""}
                        onChange={(e) => patch(i, { description: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {m.type === "order_count" ? (
                        <div className="grid gap-2">
                          <Label>{t("mission.target_count")}</Label>
                          <Input
                            type="number"
                            min={1}
                            value={m.config?.target_count ?? 2}
                            onChange={(e) =>
                              patchConfig(i, { target_count: Math.max(1, Number(e.target.value) || 1) })
                            }
                          />
                        </div>
                      ) : null}
                      {m.type === "order_amount" ? (
                        <div className="grid gap-2">
                          <Label>{t("mission.target_amount")}</Label>
                          <Input
                            type="number"
                            min={1}
                            value={m.config?.target_amount_minor ?? 100000}
                            onChange={(e) =>
                              patchConfig(i, {
                                target_amount_minor: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                          />
                        </div>
                      ) : null}
                      {m.type === "daily_checkin" || m.type === "custom" ? (
                        <div className="grid gap-2">
                          <Label>{t("mission.cooldown_hours")}</Label>
                          <Input
                            type="number"
                            min={0}
                            value={m.config?.cooldown_hours ?? (m.type === "daily_checkin" ? 24 : 0)}
                            onChange={(e) =>
                              patchConfig(i, { cooldown_hours: Math.max(0, Number(e.target.value) || 0) })
                            }
                          />
                        </div>
                      ) : null}
                      {m.type === "custom" ? (
                        <div className="grid gap-2">
                          <Label>{t("mission.code")}</Label>
                          <Input
                            dir="ltr"
                            value={m.config?.code ?? ""}
                            onChange={(e) => patchConfig(i, { code: e.target.value })}
                            placeholder={t("mission.code_ph")}
                          />
                        </div>
                      ) : null}
                      {m.type === "review" || m.type === "custom" ? (
                        <div className="grid gap-2">
                          <Label>{t("mission.url")}</Label>
                          <Input
                            dir="ltr"
                            value={m.config?.url ?? ""}
                            onChange={(e) => patchConfig(i, { url: e.target.value })}
                          />
                        </div>
                      ) : null}
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={m.is_active !== false}
                          onCheckedChange={(v) => patch(i, { is_active: v })}
                        />
                        {t("mission.active")}
                      </label>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setMissions((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-3.5" />
                      {t("mission.remove")}
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setMissions((prev) => [...prev, blankMission()])}>
                    <Plus className="size-4" />
                    {t("mission.add")}
                  </Button>
                  <Button
                    disabled={saveMissions.isPending || missions.some((m) => !m.title.trim())}
                    onClick={() => saveMissions.mutate()}
                  >
                    {t("mission.save_missions")}
                  </Button>
                </div>
              </div>
            )}
          </MarketingSection>
        </div>
      )}
    </PageShell>
  )
}
