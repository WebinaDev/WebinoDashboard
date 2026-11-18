import { PortfolioAdminPage } from "@/views/admin/PortfolioAdminPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <PortfolioAdminPage />
}
