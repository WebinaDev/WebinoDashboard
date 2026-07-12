import { createPage } from "@/lib/create-page"

const OrdersPage = createPage(() => import("@/pages/OrdersPage"))

export default function Page() {
  return <OrdersPage />
}
