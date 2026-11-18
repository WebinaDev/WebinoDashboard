import type { ResolvedAdminRoute } from "@/kernel/types"
import ShopReportsShellPageClient from "./shop-reports-shell-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ShopReportsShellPageClient route={route} />
}
