import type { ResolvedAdminRoute } from "@/kernel/types"

import SettingsIntegrationsPageClient from "./settings-integrations-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <SettingsIntegrationsPageClient route={route} />
}
