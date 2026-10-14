import type { ResolvedSiteRoute } from "@/kernel/types"
import { StorefrontDocument } from "@/builder/public-document"
import { isDocument } from "@/builder/tree"
import { apiServer } from "@/lib/api-server"
import { getServerTranslations } from "@/lib/server-translations"
import { SiteEmptyState } from "@/themes/shared/content/SiteEmptyState"

export const dynamic = "force-dynamic"

/** Draft preview through an expiring token link created in the builder (noindex, never cached). */
export default async function PreviewPage({ route }: { route: ResolvedSiteRoute }) {
  const t = await getServerTranslations("site")
  const token = route.params?.token ?? ""
  const res = /^\d+\.[a-f0-9]{48}$/.test(token)
    ? await apiServer<{ data?: { title?: string; document?: unknown } }>(`/api/v1/public/builder/preview/${token}`, { revalidate: 0 }).catch(() => null)
    : null
  const document = res?.data?.document
  if (!isDocument(document)) {
    return <SiteEmptyState title={t("preview_expired")} description={t("empty_default")} actionHref="/" actionLabel={t("back_home")} />
  }
  return (
    <>
      <div className="sticky top-0 z-40 bg-amber-100 px-4 py-2 text-center text-xs text-amber-900" role="status">{t("preview_banner")}</div>
      <StorefrontDocument document={document} runtime={{ siteName: res?.data?.title ?? "" }} />
    </>
  )
}
