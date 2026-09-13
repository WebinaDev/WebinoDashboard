import type { ResolvedSiteRoute } from "@/kernel/types"
import { fetchPublicList } from "@/kernel/public-content"
import { getServerTranslations } from "@/lib/server-translations"
import { SiteContentGrid } from "@/themes/shared/content/SiteContentGrid"

export const revalidate = 60

type Member = {
  id: number
  name: string
  role?: string | null
  bio?: string | null
  photo_url?: string | null
}

export default async function Page(_props: { route: ResolvedSiteRoute }) {
  const t = await getServerTranslations("site")
  const members = await fetchPublicList<Member>("/api/v1/public/team")

  return (
    <SiteContentGrid
      title={t("team")}
      emptyLabel={t("team_empty")}
      emptyActionLabel={t("back_home")}
      columns={3}
      items={members.map((m) => ({
        href: "#",
        title: m.name,
        excerpt: [m.role, m.bio].filter(Boolean).join(" — "),
        imageUrl: m.photo_url,
      }))}
    />
  )
}
