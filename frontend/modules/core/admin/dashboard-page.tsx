import { getLocale } from "next-intl/server"

import DashboardHome from "@/views/DashboardHome"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { apiServerData } from "@/lib/api-server"
import type { DashboardOverviewResponse } from "@/types/dashboardOverview"

export default async function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  const locale = await getLocale()
  const initialOverview = await apiServerData<DashboardOverviewResponse>(
    `/api/v1/dashboard/overview?locale=${encodeURIComponent(locale)}`,
    { revalidate: false },
  )

  return <DashboardHome initialOverview={initialOverview ?? undefined} />
}
