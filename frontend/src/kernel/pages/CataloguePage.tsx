import { notFound } from "next/navigation"

import { fetchCatalogueData } from "@/kernel/cafe-catalogue-data"
import { CatalogueView } from "@/themes/cafe-starter/views/CatalogueView"

export const revalidate = 60

type Props = {
  initialQuery?: string
}

export default async function CataloguePage({ initialQuery }: Props = {}) {
  const { catalog, venue } = await fetchCatalogueData(initialQuery)

  if (!catalog) {
    notFound()
  }

  return <CatalogueView catalog={catalog} venue={venue} initialQuery={initialQuery} />
}
