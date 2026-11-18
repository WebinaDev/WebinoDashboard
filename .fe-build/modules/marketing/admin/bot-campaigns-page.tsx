import type { ResolvedAdminRoute } from "@/kernel/types"

import BotCampaignsPageClient from "./bot-campaigns-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <BotCampaignsPageClient route={route} />
}
