import DashboardHome from "@/views/DashboardHome"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { apiServerData } from "@/lib/api-server"
import { readRequestLocale } from "@/lib/request-locale"
import type { DashboardOverviewResponse } from "@/types/dashboardOverview"

export default async function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  const locale = await readRequestLocale()
  let initialOverview: DashboardOverviewResponse | null = null
  try {
    initialOverview = await apiServerData<DashboardOverviewResponse>(
      `/api/v1/dashboard/overview?locale=${encodeURIComponent(locale)}`,
      { revalidate: false },
    )
  } catch {
    // License/bootstrap or overview failures must render the recoverable home,
    // not the route error boundary.
    initialOverview = null
  }

  return <DashboardHome initialOverview={initialOverview ?? undefined} />
}
