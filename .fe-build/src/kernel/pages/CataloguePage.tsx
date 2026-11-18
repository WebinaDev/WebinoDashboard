import { fetchCatalogueData, resolveCafeTable } from "@/kernel/cafe-catalogue-data"
import { getServerTranslations } from "@/lib/server-translations"
import { CatalogueView } from "@/themes/cafe-starter/views/CatalogueView"

export const dynamic = "force-dynamic"

type Props = {
  initialQuery?: string
  menuSlug?: string
  branchSlug?: string
  tableNumber?: string
  tableId?: string
}

export default async function CataloguePage({
  initialQuery,
  menuSlug,
  branchSlug,
  tableNumber,
  tableId,
}: Props = {}) {
  const table = await resolveCafeTable(tableNumber, tableId)
  const branch = branchSlug || table?.branch_slug || undefined
  const { catalog, venue } = await fetchCatalogueData(initialQuery, menuSlug, branch)

  if (!catalog) {
    const t = await getServerTranslations("cafe_starter")
    return <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">{t("menu_unavailable")}</div>
  }

  return (
    <CatalogueView
      catalog={catalog}
      venue={venue}
      initialQuery={initialQuery}
      tableNumber={table?.code ?? null}
      branchSlug={branch}
      menuSlug={menuSlug}
      activeThemeSlug={venue?.tenant.active_theme_slug}
    />
  )
}
