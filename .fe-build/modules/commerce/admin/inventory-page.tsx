import CommerceInventoryPage from "@/views/CommerceInventoryPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <CommerceInventoryPage />
}
