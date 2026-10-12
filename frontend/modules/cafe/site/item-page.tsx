import { fetchAboutData, fetchCatalogItem, resolveCafeTable } from "@/kernel/cafe-catalogue-data"
import { ItemDetailView } from "@/themes/cafe-starter/views/ItemDetailView"
import type { ResolvedSiteRoute } from "@/kernel/types"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

type Props = {
  route: ResolvedSiteRoute
  searchParams?: Record<string, string | undefined>
}

export default async function ItemPage({ route, searchParams }: Props) {
  const segments = route.fullPath.split("/").filter(Boolean)
  const slug = segments[segments.length - 1]
  const [item, venue, table] = await Promise.all([
    fetchCatalogItem(slug),
    fetchAboutData(),
    resolveCafeTable(searchParams?.table, searchParams?.table_id),
  ])

  if (!item) notFound()

  return (
    <ItemDetailView
      item={item}
      tableNumber={table?.code ?? null}
      branchSlug={searchParams?.branch ?? table?.branch_slug ?? null}
      activeThemeSlug={venue?.tenant.active_theme_slug}
      ordering={venue?.ordering ?? null}
      showNewBadge={venue?.menu?.show_new_badge !== false}
    />
  )
}
