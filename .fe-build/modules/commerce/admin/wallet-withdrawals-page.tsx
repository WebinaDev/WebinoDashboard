import type { ResolvedAdminRoute } from "@/kernel/types"

import WalletWithdrawalsPageClient from "./wallet-withdrawals-page-client"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <WalletWithdrawalsPageClient route={route} />
}
