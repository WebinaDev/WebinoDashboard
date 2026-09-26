import SettingsHubPage from "@/views/settings/SettingsHubPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <SettingsHubPage />
}
