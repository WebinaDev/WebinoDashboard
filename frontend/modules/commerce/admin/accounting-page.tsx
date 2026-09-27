import AccountingPage from "@/views/AccountingPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page(_props: { route: ResolvedAdminRoute }) {
  return <AccountingPage />
}
