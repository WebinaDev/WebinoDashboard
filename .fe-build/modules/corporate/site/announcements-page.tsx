import type { ResolvedSiteRoute } from "@/kernel/types"
import { fetchPublicList } from "@/kernel/public-content"
import { getServerTranslations } from "@/lib/server-translations"
import { SiteContentGrid } from "@/themes/shared/content/SiteContentGrid"

export const revalidate = 60

type Announcement = {
  id: number
  title: string
  body?: string | null
  type?: string | null
  starts_at?: string | null
}

export default async function Page(_props: { route: ResolvedSiteRoute }) {
  const t = await getServerTranslations("site")
  const rows = await fetchPublicList<Announcement>("/api/v1/public/announcements")

  return (
    <SiteContentGrid
      title={t("announcements")}
      emptyLabel={t("announcements_empty")}
      emptyActionLabel={t("back_home")}
      columns={1}
      items={rows.map((row) => ({
        href: "#",
        title: row.title,
        excerpt: row.body,
        meta: row.starts_at,
      }))}
    />
  )
}
