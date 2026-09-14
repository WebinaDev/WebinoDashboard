import RbacPage from "@/views/RbacPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route: _route }: { route: ResolvedAdminRoute }) {
  return <RbacPage />
}
