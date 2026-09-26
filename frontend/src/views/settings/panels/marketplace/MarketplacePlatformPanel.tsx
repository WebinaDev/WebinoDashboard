"use client"

import { useLocale, useTranslations } from "next-intl"

import { marketplaceLabel, marketplaceMeta } from "@/lib/marketplace"
import {
  ConnectionCard,
  FeedUrlsCard,
  JobsTable,
  LogsTable,
  MapsTable,
  OrdersTable,
  PlatformTabsNav,
  RemoteSearchCard,
  SyncActionsCard,
  type PlatformTab,
} from "@/views/settings/panels/marketplace/MarketplaceShared"
import { TorobToolsPanel } from "@/views/settings/panels/marketplace/TorobToolsPanel"

export function platformTabs(platform: string, t: (k: string) => string): PlatformTab[] {
  const meta = marketplaceMeta(platform)
  if (meta?.kind === "feed") {
    return [
      { key: "connection", label: t("tabs.connection") },
      ...(platform === "torob" ? [{ key: "tools", label: t("tabs.torob_tools") }] : []),
      { key: "logs", label: t("tabs.logs") },
    ]
  }
  return [
    { key: "connection", label: t("tabs.connection") },
    { key: "products", label: t("tabs.products") },
    { key: "orders", label: t("tabs.orders") },
    { key: "jobs", label: t("tabs.jobs") },
    { key: "logs", label: t("tabs.logs") },
  ]
}

export function MarketplacePlatformPanel({ platform, tab }: { platform: string; tab?: string }) {
  const t = useTranslations("marketplace_admin")
  const locale = useLocale()
  const meta = marketplaceMeta(platform)
  if (!meta) return null
  const tabs = platformTabs(platform, t)
  const active = tabs.some((x) => x.key === tab) ? (tab as string) : tabs[0].key
  const isFeed = meta.kind === "feed"

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{marketplaceLabel(platform, locale)}</h2>
        <p className="text-muted-foreground text-sm">{t(`descriptions.${platform}`)}</p>
      </div>
      <PlatformTabsNav platform={platform} tabs={tabs} active={active} />
      {active === "connection" ? (
        <div className="space-y-4">
          <ConnectionCard platform={platform} />
          {isFeed ? <FeedUrlsCard platform={platform} /> : <SyncActionsCard platform={platform} supportsOrders />}
        </div>
      ) : null}
      {active === "products" ? (
        <div className="space-y-4">
          <MapsTable platform={platform} />
          <RemoteSearchCard platform={platform} />
        </div>
      ) : null}
      {active === "orders" ? <OrdersTable platform={platform} /> : null}
      {active === "jobs" ? <JobsTable platform={platform} /> : null}
      {active === "logs" ? <LogsTable platform={platform} /> : null}
      {active === "tools" && platform === "torob" ? <TorobToolsPanel /> : null}
    </div>
  )
}
