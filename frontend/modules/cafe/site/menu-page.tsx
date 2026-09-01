import CataloguePage from "@/kernel/pages/CataloguePage"
import type { ResolvedSiteRoute } from "@/kernel/types"

export const revalidate = 60

export default function Page(_props: { route: ResolvedSiteRoute }) {
  return <CataloguePage />
}
