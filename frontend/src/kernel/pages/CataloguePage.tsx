import { fetchCatalogueData } from "@/kernel/cafe-catalogue-data"
import { getServerTranslations } from "@/lib/server-translations"
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
    const t = await getServerTranslations("cafe_starter")
    return <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">{t("menu_unavailable")}</div>
  }

  return (
    <CatalogueView
      catalog={catalog}
      venue={venue}
      initialQuery={initialQuery}
      tableNumber={tableNumber}
      branchSlug={branchSlug}
      menuSlug={menuSlug}
      activeThemeSlug={venue?.tenant.active_theme_slug}
    />
  )
}
