import type { ResolvedAdminRoute } from "@/kernel/types"

import BotBroadcastPageClient from "./bot-broadcast-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <BotBroadcastPageClient route={route} />
}
