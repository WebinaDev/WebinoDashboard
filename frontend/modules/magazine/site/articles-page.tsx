import type { ResolvedSiteRoute } from "@/kernel/types"
import { fetchPublicItem, fetchPublicList } from "@/kernel/public-content"
import { getServerTranslations } from "@/lib/server-translations"
import { SiteContentDetail } from "@/themes/shared/content/SiteContentDetail"
import { SiteContentGrid } from "@/themes/shared/content/SiteContentGrid"
import { SiteEmptyState } from "@/themes/shared/content/SiteEmptyState"

export const revalidate = 60

type Article = {
  slug: string
  title: string
  excerpt?: string | null
  body?: string | null
  cover_url?: string | null
  published_at?: string | null
}

export default async function Page({ route }: { route: ResolvedSiteRoute }) {
  const t = await getServerTranslations("site")
  const slug = route.params?.slug

  if (slug) {
    const article = await fetchPublicItem<Article>(`/api/v1/public/magazine/${encodeURIComponent(slug)}`)
    if (!article) {
      return (
        <SiteEmptyState
          title={t("pages_missing")}
          description={t("magazine_empty")}
          actionHref="/magazine"
          actionLabel={t("magazine_back")}
        />
      )
    }
    return (
      <SiteContentDetail
        title={article.title}
        subtitle={article.published_at}
        body={article.body ?? article.excerpt}
        imageUrl={article.cover_url}
        backHref="/magazine"
        backLabel={t("magazine_back")}
      />
    )
  }

  const articles = await fetchPublicList<Article>("/api/v1/public/magazine")
  return (
    <SiteContentGrid
      title={t("magazine")}
      emptyLabel={t("magazine_empty")}
      emptyActionLabel={t("back_home")}
      items={articles.map((a) => ({
        href: `/magazine/${a.slug}`,
        title: a.title,
        excerpt: a.excerpt,
        imageUrl: a.cover_url,
        meta: a.published_at,
      }))}
    />
  )
}
