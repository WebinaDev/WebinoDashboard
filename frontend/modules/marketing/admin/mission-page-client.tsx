"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { Target } from "lucide-react"

import { PageShell } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { dashboardPath } from "@/kernel/paths"
import type { ResolvedAdminRoute } from "@/kernel/types"
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

export default function MissionPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("marketing_loyalty_tools")
  const tHub = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } = useDraftSettings<LoyaltyDraft>(
    "shop",
    "loyalty",
  )

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
              <Label>{t("mission.daily_points")}</Label>
              <Input
                type="number"
                min={0}
                value={Number(draft.daily_points ?? 0)}
                onChange={(e) => setDraft({ ...draft, daily_points: Number(e.target.value) })}
              />
              <p className="text-muted-foreground text-xs">{t("mission.daily_hint")}</p>
            </div>
            <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
          </MarketingSection>
        </div>
      )}
    </PageShell>
  )
}
