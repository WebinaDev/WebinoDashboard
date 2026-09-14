import CustomersPage from "@/views/CustomersPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <CustomersPage />
}
