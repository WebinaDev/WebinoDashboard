import StoreSettingsPage from "@/views/StoreSettingsPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <StoreSettingsPage />
}
