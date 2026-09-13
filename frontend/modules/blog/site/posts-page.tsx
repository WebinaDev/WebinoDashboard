import type { ResolvedSiteRoute } from "@/kernel/types"
import { fetchPublicItem, fetchPublicList } from "@/kernel/public-content"
import { getServerTranslations } from "@/lib/server-translations"
import { SiteContentDetail } from "@/themes/shared/content/SiteContentDetail"
import { SiteContentGrid } from "@/themes/shared/content/SiteContentGrid"
import { SiteEmptyState } from "@/themes/shared/content/SiteEmptyState"

export const revalidate = 60

type Post = {
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
    const post = await fetchPublicItem<Post>(`/api/v1/public/blog/${encodeURIComponent(slug)}`)
    if (!post) {
      return (
        <SiteEmptyState
          title={t("pages_missing")}
          description={t("blog_empty")}
          actionHref="/blog"
          actionLabel={t("blog_back")}
        />
      )
    }
    return (
      <SiteContentDetail
        title={post.title}
        subtitle={post.published_at}
        body={post.body ?? post.excerpt}
        imageUrl={post.cover_url}
        backHref="/blog"
        backLabel={t("blog_back")}
      />
    )
  }

  const posts = await fetchPublicList<Post>("/api/v1/public/blog")
  return (
    <SiteContentGrid
      title={t("blog")}
      emptyLabel={t("blog_empty")}
      emptyActionLabel={t("back_home")}
      items={posts.map((p) => ({
        href: `/blog/${p.slug}`,
        title: p.title,
        excerpt: p.excerpt,
        imageUrl: p.cover_url,
        meta: p.published_at,
      }))}
    />
  )
}
