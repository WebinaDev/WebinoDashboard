import type { ResolvedAdminRoute } from "@/kernel/types"

import { TelegramSettingsPageClient } from "./bot-settings-shared"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <TelegramSettingsPageClient route={route} />
}
