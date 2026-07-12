import { createPage } from "@/lib/create-page"

const CartPage = createPage(() => import("@/pages/CartPage"))

export default function Page() {
  return <CartPage />
}
