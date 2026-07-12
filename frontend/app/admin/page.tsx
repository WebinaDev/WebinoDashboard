import { createPage } from "@/lib/create-page"

const DashboardHome = createPage(() => import("@/pages/DashboardHome"))

export default function HomePage() {
  return <DashboardHome />
}
