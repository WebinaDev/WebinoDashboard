import type { Metadata } from "next"
import { apiServer } from "@/lib/api-server"
import { renderSitePage } from "@/kernel/render-pages"

export const revalidate = 60

type SeoMeta = {
  title?: string
  description?: string
  robots?: string
  canonical?: string
  alternates?: { lang: string; url: string }[]
  og?: { title?: string; description?: string; image?: string; url?: string; site_name?: string }
}

/** Home page metadata comes from the CMS "home" page SEO (localized for resume themes); falls back to the layout. */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const res = await apiServer<{ data?: { meta?: SeoMeta } }>(
      "/api/v1/public/seo/meta?type=page&slug=home&path=/",
      { revalidate: 60, tags: ["seo"] },
    )
    const meta = res?.data?.meta
    if (!meta?.title) return {}
    const languages = Object.fromEntries((meta.alternates ?? []).map((a) => [a.lang, a.url]))
    return {
      title: meta.title,
      description: meta.description || undefined,
      robots: meta.robots || undefined,
      alternates: { canonical: meta.canonical || undefined, languages: Object.keys(languages).length ? languages : undefined },
      openGraph: meta.og
        ? { title: meta.og.title, description: meta.og.description, images: meta.og.image ? [meta.og.image] : undefined, url: meta.og.url, siteName: meta.og.site_name }
        : undefined,
    }
  } catch {
    return {}
  }
}

export default function SiteHomeRoutePage() {
  return renderSitePage([])
}
