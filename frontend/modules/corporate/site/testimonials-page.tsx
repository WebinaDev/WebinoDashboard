import type { ResolvedSiteRoute } from "@/kernel/types"
import { fetchPublicList } from "@/kernel/public-content"
import { getServerTranslations } from "@/lib/server-translations"
import { SiteContentGrid } from "@/themes/shared/content/SiteContentGrid"

export const revalidate = 60

type Testimonial = {
  id: number
  author: string
  role?: string | null
  company?: string | null
  quote: string
  avatar_url?: string | null
}

export default async function Page(_props: { route: ResolvedSiteRoute }) {
  const t = await getServerTranslations("site")
  const rows = await fetchPublicList<Testimonial>("/api/v1/public/testimonials")

  return (
    <SiteContentGrid
      title={t("testimonials")}
      emptyLabel={t("testimonials_empty")}
      emptyActionLabel={t("back_home")}
      columns={2}
      items={rows.map((row) => ({
        href: "#",
        title: row.author,
        excerpt: row.quote,
        imageUrl: row.avatar_url,
        meta: [row.role, row.company].filter(Boolean).join(" · ") || null,
      }))}
    />
  )
}
