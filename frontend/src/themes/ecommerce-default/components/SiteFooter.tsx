import Link from "next/link"
import { getServerTranslations } from "@/lib/server-translations"

export async function SiteFooter({ siteName }: { siteName: string }) {
  const t = await getServerTranslations("site.footer")

  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto flex flex-col gap-4 px-4 py-8 text-sm md:flex-row md:items-center md:justify-between">
        <p className="text-muted-foreground">© {new Date().getFullYear()} {siteName}</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/pages/about" className="hover:underline">
            {t("about")}
          </Link>
          <Link href="/consultation" className="hover:underline">
            {t("contact")}
          </Link>
        </div>
      </div>
    </footer>
  )
}
