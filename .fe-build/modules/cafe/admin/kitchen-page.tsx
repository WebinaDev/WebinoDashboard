import type { ResolvedAdminRoute } from "@/kernel/types"
import KitchenPageClient from "./kitchen-page-client"
export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <KitchenPageClient route={route} />
}
