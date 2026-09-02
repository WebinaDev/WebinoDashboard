import DashboardHome from "@/views/DashboardHome"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <DashboardHome />
}
