"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"

import { BotCampaignsPanel } from "../../bots/components/BotCampaignsPanel"
import { BotProviderSwitcher, type BotProvider } from "../../bots/components/BotProviderSwitcher"

export default function BotCampaignsPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("bots")
  const [provider, setProvider] = useState<BotProvider>("bale")

  return (
    <PageShell
      title={t("campaigns.title")}
      description={t("campaigns.pageDescription")}
      actions={<BotProviderSwitcher provider={provider} onChange={setProvider} />}
    >
      <BotCampaignsPanel provider={provider} />
    </PageShell>
  )
}
