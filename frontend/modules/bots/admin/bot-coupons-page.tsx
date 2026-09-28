"use client"

import { useTranslations } from "next-intl"

import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"

import { BotCouponsPanel } from "../components/BotCouponsPanel"
import { BotSectionTabs, providerFromRoute } from "../components/BotSectionTabs"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("bots")
  const provider = providerFromRoute(route)

  return (
    <PageShell title={`${t(`settings.${provider}`)} — ${t("coupons.title")}`} description={t("description")}>
      <BotSectionTabs provider={provider} active="coupons" />
      <BotCouponsPanel provider={provider} />
    </PageShell>
  )
}
