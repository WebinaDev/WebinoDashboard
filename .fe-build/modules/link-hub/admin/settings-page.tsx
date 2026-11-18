import type { ResolvedAdminRoute } from "@/kernel/types"
import SettingsPageClient from "./settings-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <SettingsPageClient route={route} />
}
