import CataloguePage from "@/kernel/pages/CataloguePage"
import { preferBuilderPage } from "@/kernel/prefer-builder-page"
import type { ResolvedSiteRoute } from "@/kernel/types"

export const dynamic = "force-dynamic"

type Props = {
  route: ResolvedSiteRoute
  searchParams?: Record<string, string | undefined>
}

export default async function Page({ searchParams }: Props) {
  const catalogue = (
    <CataloguePage
      initialQuery={searchParams?.q}
      menuSlug={searchParams?.menu}
      branchSlug={searchParams?.branch}
      tableNumber={searchParams?.table}
      tableId={searchParams?.table_id}
    />
  )
  // Designed builder menu boards win; interactive ordering stays on /catalogue.
  return preferBuilderPage("menu", catalogue)
}
