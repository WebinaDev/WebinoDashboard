import CataloguePage from "@/kernel/pages/CataloguePage"
import type { ResolvedSiteRoute } from "@/kernel/types"

export const revalidate = 60

type Props = {
  route: ResolvedSiteRoute
  searchParams?: Record<string, string | undefined>
}

export default async function Page({ searchParams }: Props) {
  return (
    <CataloguePage
      initialQuery={searchParams?.q}
      menuSlug={searchParams?.menu}
      branchSlug={searchParams?.branch}
      tableNumber={searchParams?.table}
    />
  )
}
