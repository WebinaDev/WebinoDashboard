"use client"

import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

import { CouponBuilder } from "@/components/coupons/CouponBuilder"
import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"

type RewardType = "fixed_cart" | "percent" | "free_shipping" | "ship_pct"

function parseReward(raw: string | null): RewardType | undefined {
  if (raw === "fixed_cart" || raw === "percent" || raw === "free_shipping" || raw === "ship_pct") return raw
  return undefined
}

export default function CouponBuilderPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("coupon_builder")
  const params = useSearchParams()
  const initialReward = useMemo(() => parseReward(params.get("reward")), [params])
  const defaultWizardOpen = params.get("wizard") === "1" || Boolean(initialReward)

  return (
    <PageShell title={t("title")} description={t("description")} eyebrow={t("eyebrow")}>
      <CouponBuilder initialReward={initialReward} defaultWizardOpen={defaultWizardOpen} />
    </PageShell>
  )
}
