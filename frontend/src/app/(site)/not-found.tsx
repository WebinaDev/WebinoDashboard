import Link from "next/link"

import { PublishedDocument, activeThemeSlug } from "@/builder/public-document"
import { ThemeSlot } from "@/builder/theme/ThemeSlot"
import { ishopNotFoundDocument } from "@/builder/templates/ishop"
import { getServerTranslations } from "@/lib/server-translations"

export default async function SiteNotFound() {
  const theme = await activeThemeSlug()
  if (theme === "ecommerce-ishop") {
    return (
      <ThemeSlot kind="not_found" context={{ notFound: true }}>
        <PublishedDocument document={ishopNotFoundDocument()} />
      </ThemeSlot>
    )
  }
  return (
    <ThemeSlot kind="not_found" context={{ notFound: true }}>
      {await fallbackNotFound()}
    </ThemeSlot>
  )
}

async function fallbackNotFound() {
  const t = await getServerTranslations("common")
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t("not_found_title")}</h1>
      <p className="text-muted-foreground">{t("page_not_found")}</p>
      <Link href="/" className="text-primary underline-offset-4 hover:underline">
        {t("back_to_home")}
      </Link>
    </div>
  )
}
