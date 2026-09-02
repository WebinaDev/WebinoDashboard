import OrdersPage from "@/views/OrdersPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <OrdersPage />
}
