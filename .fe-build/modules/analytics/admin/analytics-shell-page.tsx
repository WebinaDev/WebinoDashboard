import type { ResolvedAdminRoute } from "@/kernel/types"
import AnalyticsShellPageClient from "./analytics-shell-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <AnalyticsShellPageClient route={route} />
}
