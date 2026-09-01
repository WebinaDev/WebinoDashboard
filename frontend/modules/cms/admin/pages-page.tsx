import ModuleSkeletonPage from "@/kernel/pages/ModuleSkeletonPage"
import type { ResolvedAdminRoute } from "@/kernel/types"

export default function Page({ route }: { route: ResolvedAdminRoute }) {
  return <ModuleSkeletonPage route={route} area="admin" />
}
