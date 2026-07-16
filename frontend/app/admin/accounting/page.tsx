import { createPage } from "@/lib/create-page"

const AccountingPage = createPage(() => import("@/pages/AccountingPage"))

export default function Page() {
  return <AccountingPage />
}
