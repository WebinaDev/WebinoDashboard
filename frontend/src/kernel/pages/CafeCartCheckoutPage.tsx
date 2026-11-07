import { fetchAboutData } from "@/kernel/cafe-catalogue-data"
import { getServerTranslations } from "@/lib/server-translations"
import { CafeCartCheckoutView } from "@/themes/cafe-starter/views/CafeCartCheckoutView"

export const dynamic = "force-dynamic"

type Props = {
  mode: "cart" | "checkout"
  tableNumber?: string
  branchSlug?: string
}

export default async function CafeCartCheckoutPage({ mode, tableNumber, branchSlug }: Props) {
  const venue = await fetchAboutData()
  if (!venue) {
    const t = await getServerTranslations("cafe_starter")
    return <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">{t("menu_unavailable")}</div>
  }

  return (
    <CafeCartCheckoutView
      venue={venue}
      mode={mode}
      tableNumber={tableNumber ?? null}
      branchSlug={branchSlug ?? null}
      activeThemeSlug={venue.tenant?.active_theme_slug}
    />
  )
}
