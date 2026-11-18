"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { PageShell } from "@/components/PageShell"
import type { ResolvedAdminRoute } from "@/kernel/types"

import { BotBroadcastPanel } from "../../bots/components/BotBroadcastPanel"
import { BotProviderSwitcher, type BotProvider } from "../../bots/components/BotProviderSwitcher"

export default function BotBroadcastPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("bots")
  const [provider, setProvider] = useState<BotProvider>("bale")

  return (
    <PageShell
      title={t("broadcast.title")}
      description={t("broadcast.pageDescription")}
      actions={<BotProviderSwitcher provider={provider} onChange={setProvider} />}
    >
      <BotBroadcastPanel provider={provider} />
    </PageShell>
  )
}
