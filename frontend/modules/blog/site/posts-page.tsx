import type { ResolvedSiteRoute } from "@/kernel/types"
import { fetchPublicItem, fetchPublicList } from "@/kernel/public-content"
import { ThemeSlot } from "@/builder/theme/ThemeSlot"
import { activeThemeSlug } from "@/builder/public-document"
import { getServerTranslations, resolveServerLocale } from "@/lib/server-translations"
import { ClassicBlogArchive, ClassicBlogSingle } from "@/themes/ecommerce-classic/components/ClassicBlog"
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

type CatalogProduct = {
  slug: string
  name: string
  image_url?: string | null
  cover_image_url?: string | null
}

async function fetchMostViewed(): Promise<CatalogProduct[]> {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    const res = await fetch(`${base}/api/v1/public/catalog?per_page=6`, {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    })
    if (!res.ok) return []
    const json = (await res.json()) as { data?: { items?: CatalogProduct[] } }
    const products = Array.isArray(json.data?.items) ? json.data.items : []
    return products.slice(0, 6)
  } catch {
    return []
  }
}

export default async function Page({ route }: { route: ResolvedSiteRoute }) {
  const t = await getServerTranslations("site")
  const locale = await resolveServerLocale()
  const theme = await activeThemeSlug()
  const useClassic = theme === "ecommerce-classic" || theme === "ecommerce-default"
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
    if (useClassic) {
      const [allPosts, mostViewed] = await Promise.all([
        fetchPublicList<Post>("/api/v1/public/blog"),
        fetchMostViewed(),
      ])
      const related = allPosts.filter((item) => item.slug !== post.slug).slice(0, 3)
      return (
        <ThemeSlot
          kind="single_post"
          tokens={{ title: post.title, excerpt: post.excerpt, body: post.body ?? post.excerpt }}
          runtime={{ siteName: post.title }}
        >
          <ClassicBlogSingle
            post={post}
            related={related}
            mostViewed={mostViewed}
            backHref="/blog"
            backLabel={t("blog_back")}
            locale={locale}
          />
        </ThemeSlot>
      )
    }
    return (
      <ThemeSlot
        kind="single_post"
        tokens={{ title: post.title, excerpt: post.excerpt, body: post.body ?? post.excerpt }}
        runtime={{ siteName: post.title }}
      >
        <SiteContentDetail
          title={post.title}
          subtitle={post.published_at}
          body={post.body ?? post.excerpt}
          imageUrl={post.cover_url}
          backHref="/blog"
          backLabel={t("blog_back")}
        />
      </ThemeSlot>
    )
  }

  const posts = await fetchPublicList<Post>("/api/v1/public/blog")
  if (useClassic) {
    return (
      <ThemeSlot kind="archive">
        <ClassicBlogArchive title={t("blog")} emptyLabel={t("blog_empty")} posts={posts} locale={locale} />
      </ThemeSlot>
    )
  }
  return (
    <ThemeSlot kind="archive">
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
    </ThemeSlot>
  )
}
