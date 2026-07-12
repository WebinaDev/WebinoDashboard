import { createPage } from "@/lib/create-page"

const CommerceInventoryPage = createPage(
  () => import("@/pages/CommerceInventoryPage"),
)

export default function Page() {
  return <CommerceInventoryPage />
}
