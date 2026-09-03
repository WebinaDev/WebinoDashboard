import { fetchCatalogItem } from "@/kernel/cafe-catalogue-data"
import { ItemDetailView } from "@/themes/cafe-starter/views/ItemDetailView"
import type { ResolvedSiteRoute } from "@/kernel/types"
import { notFound } from "next/navigation"

export const revalidate = 60

type Props = {
  route: ResolvedSiteRoute
  searchParams?: Record<string, string | undefined>
}

export default async function ItemPage({ route, searchParams }: Props) {
  const segments = route.fullPath.split("/").filter(Boolean)
  const slug = segments[segments.length - 1]
  const item = await fetchCatalogItem(slug)

  if (!item) notFound()

  return (
    <ItemDetailView
      item={item}
      tableNumber={searchParams?.table ?? null}
      branchSlug={searchParams?.branch ?? null}
    />
  )
}
