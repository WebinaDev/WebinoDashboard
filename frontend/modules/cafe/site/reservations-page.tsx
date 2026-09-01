import ModuleSkeletonPage from "@/kernel/pages/ModuleSkeletonPage"
import type { ResolvedSiteRoute } from "@/kernel/types"

export default function Page({ route }: { route: ResolvedSiteRoute }) {
  return <ModuleSkeletonPage route={route} area="site" />
}
