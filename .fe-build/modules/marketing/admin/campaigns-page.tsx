import CommerceMarketingPage from "@/views/CommerceMarketingPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <CommerceMarketingPage />
}
