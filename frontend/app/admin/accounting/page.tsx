import { createPage } from "@/lib/create-page"

const AccountingPlaceholderPage = createPage(
  () => import("@/pages/AccountingPlaceholderPage"),
)

export default function Page() {
  return <AccountingPlaceholderPage />
}
