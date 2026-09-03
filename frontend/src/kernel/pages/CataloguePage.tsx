import { fetchCatalogueData } from "@/kernel/cafe-catalogue-data"
import { CatalogueView } from "@/themes/cafe-starter/views/CatalogueView"

export const revalidate = 60

type Props = {
  initialQuery?: string
  menuSlug?: string
  branchSlug?: string
  tableNumber?: string
}

export default async function CataloguePage({
  initialQuery,
  menuSlug,
  branchSlug,
  tableNumber,
}: Props = {}) {
  const { catalog, venue } = await fetchCatalogueData(initialQuery, menuSlug, branchSlug)

  if (!catalog) {
    return (
      <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">
        Menu is not available yet.
      </div>
    )
  }

  return (
    <CatalogueView
      catalog={catalog}
      venue={venue}
      initialQuery={initialQuery}
      tableNumber={tableNumber}
      branchSlug={branchSlug}
    />
  )
}
