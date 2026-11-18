import CheckoutPage from "@/views/CheckoutPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <CheckoutPage />
}
