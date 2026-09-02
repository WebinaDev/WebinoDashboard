import CommerceCmsPage from "@/views/CommerceCmsPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <CommerceCmsPage />
}
