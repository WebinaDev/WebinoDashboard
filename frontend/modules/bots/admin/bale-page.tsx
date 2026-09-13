import type { ResolvedAdminRoute } from "@/kernel/types"

import { BaleSettingsPageClient } from "./bot-settings-shared"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <BaleSettingsPageClient route={route} />
}
