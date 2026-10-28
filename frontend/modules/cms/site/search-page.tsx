import type { ResolvedSiteRoute } from "@/kernel/types"
import CataloguePage from "@/kernel/pages/CataloguePage"
import { getSiteTypeSlug } from "@/kernel/cafe-catalogue-data"
import { StorefrontBody, activeThemeSlug } from "@/builder/public-document"
import { classicShopDocument } from "@/builder/templates/classic"
import { ThemeSlot } from "@/builder/theme/ThemeSlot"
import { getServerTranslations } from "@/lib/server-translations"

export const revalidate = 60

/** Store sites search products: the shop catalog widgets read `?q=` (WP `?s=` is mapped onto it). */
async function isStore(): Promise<boolean> {
  const [theme, type] = await Promise.all([activeThemeSlug().catch(() => null), getSiteTypeSlug().catch(() => null)])
  return theme === "ecommerce-classic" || type === "ecommerce"
}

export default async function Page({
  searchParams,
}: {
  route: ResolvedSiteRoute
  searchParams?: Record<string, string | undefined>
}) {
  const t = await getServerTranslations("theme_builder")
  const term = searchParams?.q || searchParams?.s || ""
  if (await isStore()) {
    const built = await StorefrontBody({ slug: "shop", fallback: classicShopDocument() })
    return (
      <ThemeSlot kind="search" context={{ search: true }} tokens={{ title: term || t("search_fallback_title") }}>
        {term ? (
          <h1 className="mx-auto w-full max-w-7xl px-4 pt-8 text-2xl font-bold">{t("search_fallback_query", { term })}</h1>
        ) : null}
        {built ?? <CataloguePage />}
      </ThemeSlot>
    )
  }
  return (
    <ThemeSlot kind="search" context={{ search: true }} tokens={{ title: term || t("search_fallback_title") }}>
      <section className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold">{t("search_fallback_title")}</h1>
        <p className="mt-3 text-sm leading-7 opacity-80">
          {term ? t("search_fallback_query", { term }) : t("search_fallback_empty")}
        </p>
      </section>
    </ThemeSlot>
  )
}
