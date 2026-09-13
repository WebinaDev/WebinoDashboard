import type { ResolvedAdminRoute } from "@/kernel/types"

import C2cSettingsPageClient from "./c2c-settings-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <C2cSettingsPageClient route={route} />
}
