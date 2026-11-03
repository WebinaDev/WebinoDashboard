import type { ResolvedAdminRoute } from "@/kernel/types"

import BotWorkspacePageClient from "./bot-workspace-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <BotWorkspacePageClient route={route} />
}
