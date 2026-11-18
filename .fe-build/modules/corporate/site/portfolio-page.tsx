import type { ResolvedSiteRoute } from "@/kernel/types"
import { fetchPublicItem, fetchPublicList } from "@/kernel/public-content"
import { getServerTranslations } from "@/lib/server-translations"
import { SiteContentDetail } from "@/themes/shared/content/SiteContentDetail"
import { SiteContentGrid } from "@/themes/shared/content/SiteContentGrid"
import { SiteEmptyState } from "@/themes/shared/content/SiteEmptyState"

export const revalidate = 60

type PortfolioItem = {
  slug: string
  title: string
  description?: string | null
  images?: string[] | null
  category?: string | null
  client?: string | null
}

export default async function Page({ route }: { route: ResolvedSiteRoute }) {
  const t = await getServerTranslations("site")
  const slug = route.params?.slug

  if (slug) {
    const item = await fetchPublicItem<PortfolioItem>(
      `/api/v1/public/portfolio/${encodeURIComponent(slug)}`,
    )
    if (!item) {
      return (
        <SiteEmptyState
          title={t("pages_missing")}
          description={t("portfolio_empty")}
          actionHref="/portfolio"
          actionLabel={t("portfolio_back")}
        />
      )
    }
    const meta = [item.client, item.category].filter(Boolean).join(" · ")
    return (
      <SiteContentDetail
        title={item.title}
        subtitle={meta || null}
        body={item.description}
        imageUrl={item.images?.[0] ?? null}
        backHref="/portfolio"
        backLabel={t("portfolio_back")}
      />
    )
  }

  const items = await fetchPublicList<PortfolioItem>("/api/v1/public/portfolio")
  return (
    <SiteContentGrid
      title={t("portfolio")}
      emptyLabel={t("portfolio_empty")}
      emptyActionLabel={t("back_home")}
      items={items.map((item) => ({
        href: `/portfolio/${item.slug}`,
        title: item.title,
        excerpt: item.description,
        imageUrl: item.images?.[0] ?? null,
        meta: item.client,
      }))}
    />
  )
}
