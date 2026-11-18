import type { ResolvedSiteRoute } from "@/kernel/types"
import { fetchPublicItem } from "@/kernel/public-content"
import { getServerTranslations } from "@/lib/server-translations"
import { SiteEmptyState } from "@/themes/shared/content/SiteEmptyState"

export const revalidate = 60

type ResumeProfile = {
  full_name?: string | null
  headline?: string | null
  summary?: string | null
  photo_url?: string | null
  email?: string | null
  phone?: string | null
  location?: string | null
  experience?: Array<Record<string, string>> | string[] | null
  education?: Array<Record<string, string>> | string[] | null
  skills?: string[] | null
  projects?: Array<Record<string, string>> | string[] | null
  social_links?: Array<{ label?: string; url?: string }> | null
}

function itemLabel(item: string | Record<string, string>): string {
  if (typeof item === "string") return item
  return String(item.title ?? item.name ?? item.label ?? item.detail ?? "")
}

function itemDetail(item: string | Record<string, string>): string | null {
  if (typeof item === "string") return null
  return item.detail ? String(item.detail) : null
}

export default async function Page(_props: { route: ResolvedSiteRoute }) {
  const t = await getServerTranslations("site")
  const profile = await fetchPublicItem<ResumeProfile>("/api/v1/public/resume")

  if (!profile) {
    return (
      <SiteEmptyState
        title={t("resume")}
        description={t("resume_empty")}
        actionHref="/"
        actionLabel={t("back_home")}
      />
    )
  }

  const skills = Array.isArray(profile.skills) ? profile.skills : []
  const experience = Array.isArray(profile.experience) ? profile.experience : []
  const education = Array.isArray(profile.education) ? profile.education : []
  const projects = Array.isArray(profile.projects) ? profile.projects : []
  const social = Array.isArray(profile.social_links) ? profile.social_links : []

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {profile.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.photo_url}
            alt={profile.full_name || t("resume")}
            className="bg-muted size-28 rounded-full object-cover"
          />
        ) : null}
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{profile.full_name || t("resume")}</h1>
          {profile.headline ? <p className="text-muted-foreground text-lg">{profile.headline}</p> : null}
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {profile.location ? <span>{profile.location}</span> : null}
            {profile.email ? (
              <a className="underline" href={`mailto:${profile.email}`}>
                {profile.email}
              </a>
            ) : null}
            {profile.phone ? <span>{profile.phone}</span> : null}
          </div>
        </div>
      </header>

      {profile.summary ? (
        <section className="mt-10 space-y-2">
          <h2 className="text-xl font-medium">{t("resume_summary")}</h2>
          <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{profile.summary}</p>
        </section>
      ) : null}

      {skills.length > 0 ? (
        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-medium">{t("resume_skills")}</h2>
          <ul className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <li key={skill} className="bg-muted rounded-md px-3 py-1 text-sm">
                {skill}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {experience.length > 0 ? (
        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-medium">{t("resume_experience")}</h2>
          <ul className="space-y-4">
            {experience.map((item, i) => (
              <li key={`${itemLabel(item)}-${i}`} className="border-s-2 ps-4">
                <p className="font-medium">{itemLabel(item)}</p>
                {itemDetail(item) ? <p className="text-muted-foreground text-sm">{itemDetail(item)}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {education.length > 0 ? (
        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-medium">{t("resume_education")}</h2>
          <ul className="space-y-4">
            {education.map((item, i) => (
              <li key={`${itemLabel(item)}-${i}`} className="border-s-2 ps-4">
                <p className="font-medium">{itemLabel(item)}</p>
                {itemDetail(item) ? <p className="text-muted-foreground text-sm">{itemDetail(item)}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {projects.length > 0 ? (
        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-medium">{t("resume_projects")}</h2>
          <ul className="space-y-4">
            {projects.map((item, i) => (
              <li key={`${itemLabel(item)}-${i}`} className="border-s-2 ps-4">
                <p className="font-medium">{itemLabel(item)}</p>
                {itemDetail(item) ? <p className="text-muted-foreground text-sm">{itemDetail(item)}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {social.length > 0 ? (
        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-medium">{t("resume_links")}</h2>
          <ul className="flex flex-wrap gap-3 text-sm">
            {social.map((link, i) => (
              <li key={`${link.url ?? link.label}-${i}`}>
                {link.url ? (
                  <a href={link.url} className="text-primary underline" target="_blank" rel="noreferrer">
                    {link.label || link.url}
                  </a>
                ) : (
                  <span>{link.label}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
