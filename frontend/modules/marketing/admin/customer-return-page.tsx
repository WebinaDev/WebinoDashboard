import CustomerReturnPageClient from "./customer-return-page-client"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <CustomerReturnPageClient route={route} />
}
