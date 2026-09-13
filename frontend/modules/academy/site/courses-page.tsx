import type { ResolvedSiteRoute } from "@/kernel/types"
import { fetchPublicItem, fetchPublicList } from "@/kernel/public-content"
import { getServerTranslations } from "@/lib/server-translations"
import { SiteContentDetail } from "@/themes/shared/content/SiteContentDetail"
import { SiteContentGrid } from "@/themes/shared/content/SiteContentGrid"
import { SiteEmptyState } from "@/themes/shared/content/SiteEmptyState"

export const revalidate = 60

type Course = {
  slug: string
  title: string
  description?: string | null
  cover_url?: string | null
  lessons?: { title: string; content?: string | null }[]
}

export default async function Page({ route }: { route: ResolvedSiteRoute }) {
  const t = await getServerTranslations("site")
  const slug = route.params?.slug

  if (slug) {
    const course = await fetchPublicItem<Course>(`/api/v1/public/academy/${encodeURIComponent(slug)}`)
    if (!course) {
      return (
        <SiteEmptyState
          title={t("pages_missing")}
          description={t("academy_empty")}
          actionHref="/academy"
          actionLabel={t("academy_back")}
        />
      )
    }
    return (
      <SiteContentDetail
        title={course.title}
        body={course.description}
        imageUrl={course.cover_url}
        backHref="/academy"
        backLabel={t("academy_back")}
      >
        {course.lessons?.length ? (
          <ul className="mt-8 space-y-3">
            {course.lessons.map((lesson, i) => (
              <li key={`${lesson.title}-${i}`} className="border-border rounded-lg border p-4">
                <h3 className="font-medium">{lesson.title}</h3>
                {lesson.content ? (
                  <p className="text-muted-foreground mt-2 whitespace-pre-wrap text-sm">{lesson.content}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </SiteContentDetail>
    )
  }

  const courses = await fetchPublicList<Course>("/api/v1/public/academy")
  return (
    <SiteContentGrid
      title={t("academy")}
      emptyLabel={t("academy_empty")}
      emptyActionLabel={t("back_home")}
      items={courses.map((c) => ({
        href: `/academy/${c.slug}`,
        title: c.title,
        excerpt: c.description,
        imageUrl: c.cover_url,
      }))}
    />
  )
}
