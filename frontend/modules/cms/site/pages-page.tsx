import type { ResolvedSiteRoute } from "@/kernel/types"
import { fetchPublicItem } from "@/kernel/public-content"
import { getServerTranslations } from "@/lib/server-translations"
import { StorefrontDocument } from "@/builder/public-document"
import { AbSwitch } from "@/builder/render/ab-switch"
import { ThemeSlot } from "@/builder/theme/ThemeSlot"
import { isDocument } from "@/builder/tree"
import { SiteContentDetail } from "@/themes/shared/content/SiteContentDetail"
import { SiteEmptyState } from "@/themes/shared/content/SiteEmptyState"

export const revalidate = 60

type CmsPage = {
  slug: string
  title: string
  body?: string | null
  builder_published?: unknown
  lang?: string | null
  ab?: { id: number; split: number; variant?: { document?: unknown } } | null
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

  if (isDocument(page.builder_published) && page.builder_published.sections.length) {
    const original = <StorefrontDocument document={page.builder_published} runtime={{ siteName: page.title, lang: page.lang }} />
    const variant = page.ab?.variant?.document
    if (page.ab && isDocument(variant)) {
      return <AbSwitch testId={page.ab.id} split={page.ab.split} a={original} b={<StorefrontDocument document={variant} runtime={{ siteName: page.title, lang: page.lang }} />} />
    }
    return original
  }

  return (
    <ThemeSlot
      kind="single_page"
      tokens={{ title: page.title, body: page.body, excerpt: page.title }}
      runtime={{ siteName: page.title }}
    >
      <SiteContentDetail
        title={page.title}
        body={page.body}
        backHref="/"
        backLabel={t("back_home")}
      />
    </ThemeSlot>
  )
}
