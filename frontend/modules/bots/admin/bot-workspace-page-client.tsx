"use client"

import { useTranslations } from "next-intl"

import type { ResolvedAdminRoute } from "@/kernel/types"

import { BotAdminsPanel } from "../components/BotAdminsPanel"
import { BotBroadcastPanel } from "../components/BotBroadcastPanel"
import { BotCampaignsPanel } from "../components/BotCampaignsPanel"
import { BotConnectionPanel } from "../components/BotConnectionPanel"
import { BotCouponsPanel } from "../components/BotCouponsPanel"
import { BotDiagnosticsPanel } from "../components/BotDiagnosticsPanel"
import { BotFeaturesPanel } from "../components/BotFeaturesPanel"
import { BotLogsPanel } from "../components/BotLogsPanel"
import { BotNotificationsPanel } from "../components/BotNotificationsPanel"
import { BotOverviewPanel } from "../components/BotOverviewPanel"
import { BotPageBuilderPanel } from "../components/BotPageBuilderPanel"
import { BotReferralPanel } from "../components/BotReferralPanel"
import { BotReportsPanel } from "../components/BotReportsPanel"
import { BotScaffoldPanel } from "../components/BotScaffoldPanel"
import { BotTextsPanel } from "../components/BotTextsPanel"
import { BotTokensPanel } from "../components/BotTokensPanel"
import { BotWorkspaceShell } from "../components/BotWorkspaceShell"
import { isLiveBotProvider } from "../lib/platforms"
import { parseBotRoutePath, type BotSectionId } from "../lib/sections"

export default function BotWorkspacePageClient({ route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("bots")
  const parsed = parseBotRoutePath(route.path) ?? { platform: "bale", section: "overview" as BotSectionId }
  const { platform, section } = parsed
  const live = isLiveBotProvider(platform)
  const title = `${t(`platforms.${platform}`)} — ${t(`sections.${section}`)}`

  let body = null
  if (!live) {
    body = <BotScaffoldPanel platform={platform} />
  } else {
    switch (section) {
      case "overview":
        body = <BotOverviewPanel provider={platform} />
        break
      case "connection":
        body = <BotConnectionPanel provider={platform} />
        break
      case "tokens":
        body = <BotTokensPanel provider={platform} />
        break
      case "admins":
        body = <BotAdminsPanel provider={platform} />
        break
      case "features":
        body = <BotFeaturesPanel provider={platform} />
        break
      case "texts":
        body = <BotTextsPanel provider={platform} />
        break
      case "diagnostics":
        body = <BotDiagnosticsPanel provider={platform} />
        break
      case "broadcast":
        body = <BotBroadcastPanel provider={platform} />
        break
      case "campaigns":
        body = <BotCampaignsPanel provider={platform} />
        break
      case "notifications":
        body = <BotNotificationsPanel provider={platform} />
        break
      case "referral":
        body = <BotReferralPanel provider={platform} />
        break
      case "page-builder":
        body = <BotPageBuilderPanel provider={platform} />
        break
      case "reports":
        body = <BotReportsPanel provider={platform} />
        break
      case "logs":
        body = <BotLogsPanel provider={platform} />
        break
      case "coupons":
        body = <BotCouponsPanel provider={platform} />
        break
      default:
        body = <BotOverviewPanel provider={platform} />
    }
  }

  return (
    <BotWorkspaceShell platform={platform} section={live ? section : "overview"} title={title} description={t("description")}>
      {body}
    </BotWorkspaceShell>
  )
}
