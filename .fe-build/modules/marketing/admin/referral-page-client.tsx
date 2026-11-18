"use client"

import { Users } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"

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
  welcome_points?: number
  referral_points?: number
  point_price_minor?: number
  max_points_per_product?: number
  daily_points?: number
}

export default function ReferralPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("marketing_loyalty_tools")
  const tHub = useTranslations("settings_hub")
  const { loading, draft, setDraft, persist, pending, saved, error } = useDraftSettings<LoyaltyDraft>(
    "shop",
    "loyalty",
  )

  return (
    <PageShell
      title={t("referral.title")}
      description={t("referral.subtitle")}
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
        <MarketingSection
          title={t("referral.heading")}
          description={t("referral.hint")}
          icon={Users}
        >
          <div className="flex max-w-lg items-center justify-between gap-3">
            <Label>{t("referral.club_enabled")}</Label>
            <Switch
              checked={Boolean(draft.enabled)}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>
          <div className="grid max-w-sm gap-2">
            <Label>{t("referral.points")}</Label>
            <Input
              type="number"
              min={0}
              value={Number(draft.referral_points ?? 0)}
              onChange={(e) => setDraft({ ...draft, referral_points: Number(e.target.value) })}
            />
            <p className="text-muted-foreground text-xs">{t("zero_hint")}</p>
          </div>
          <div className="grid max-w-sm gap-2">
            <Label>{t("referral.welcome_points")}</Label>
            <Input
              type="number"
              min={0}
              value={Number(draft.welcome_points ?? 0)}
              onChange={(e) => setDraft({ ...draft, welcome_points: Number(e.target.value) })}
            />
          </div>
          <SettingsSaveBar onSave={() => void persist()} pending={pending} saved={saved} error={error} />
        </MarketingSection>
      )}
    </PageShell>
  )
}
