import type { ResolvedAdminRoute } from "@/kernel/types"

import WalletSettingsPageClient from "./wallet-settings-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <WalletSettingsPageClient route={route} />
}
