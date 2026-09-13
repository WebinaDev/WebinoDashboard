"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import { PageShell } from "@/components/PageShell"
import { Card, CardContent } from "@/components/ui/card"
import type { ResolvedAdminRoute } from "@/kernel/types"

import { BotBroadcastPanel } from "../../bots/components/BotBroadcastPanel"
import { BotProviderSwitcher, type BotProvider } from "../../bots/components/BotProviderSwitcher"

export default function BotBroadcastPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("bots")
  const [provider, setProvider] = useState<BotProvider>("bale")

  return (
    <PageShell title={t("broadcast.title")} description={t("description")}>
      <Card className="mb-4 shadow-soft">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <BotProviderSwitcher provider={provider} onChange={setProvider} />
        </CardContent>
      </Card>
      <BotBroadcastPanel provider={provider} />
    </PageShell>
  )
}
