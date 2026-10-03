import type { ResolvedSiteRoute } from "@/kernel/types"
import { ThemeSlot } from "@/builder/theme/ThemeSlot"
import { getServerTranslations } from "@/lib/server-translations"

export const revalidate = 60

export default async function Page({
  searchParams,
}: {
  route: ResolvedSiteRoute
  searchParams?: Record<string, string | undefined>
}) {
  const t = await getServerTranslations("theme_builder")
  const term = searchParams?.q || searchParams?.s || ""
  return (
    <ThemeSlot kind="search" context={{ search: true }} tokens={{ title: term || t("search_fallback_title") }}>
      <section className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold">{t("search_fallback_title")}</h1>
        <p className="mt-3 text-sm leading-7 opacity-80">
          {term ? t("search_fallback_query", { term }) : t("search_fallback_empty")}
        </p>
      </section>
    </ThemeSlot>
  )
}
