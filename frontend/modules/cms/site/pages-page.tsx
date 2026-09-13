import type { ResolvedSiteRoute } from "@/kernel/types"
import { fetchPublicItem } from "@/kernel/public-content"
import { getServerTranslations } from "@/lib/server-translations"
import { SiteContentDetail } from "@/themes/shared/content/SiteContentDetail"
import { SiteEmptyState } from "@/themes/shared/content/SiteEmptyState"

export const revalidate = 60

type CmsPage = {
  slug: string
  title: string
  body?: string | null
}

export default async function Page({ route }: { route: ResolvedSiteRoute }) {
  const t = await getServerTranslations("site")
  const slug = route.params?.slug
  if (!slug) {
    return (
      <SiteEmptyState
        title={t("pages_missing")}
        description={t("empty_default")}
        actionHref="/"
        actionLabel={t("back_home")}
      />
    )
  }

  const page = await fetchPublicItem<CmsPage>(`/api/v1/public/pages/${encodeURIComponent(slug)}`)
  if (!page) {
    return (
      <SiteEmptyState
        title={t("pages_missing")}
        description={t("empty_default")}
        actionHref="/"
        actionLabel={t("back_home")}
      />
    )
  }

  return (
    <SiteContentDetail
      title={page.title}
      body={page.body}
      backHref="/"
      backLabel={t("back_home")}
    />
  )
}
