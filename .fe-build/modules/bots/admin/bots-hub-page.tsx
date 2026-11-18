import type { ResolvedAdminRoute } from "@/kernel/types"

import BotsHubPageClient from "./bots-hub-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <BotsHubPageClient route={route} />
}
