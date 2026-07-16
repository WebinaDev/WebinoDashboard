import DashboardHome from "@/pages/DashboardHome"
import { apiServerData } from "@/lib/api-server"

type Summary = {
  orders_open: number
  orders_paid: number
  products: number
  revenue_minor: number
}

export default async function HomePage() {
  const initialSummary = await apiServerData<Summary>("/api/v1/analytics/summary")

  return <DashboardHome initialSummary={initialSummary} />
}
