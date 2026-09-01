import Link from "next/link"
import { getTranslations } from "next-intl/server"

export async function SiteFooter({ siteName }: { siteName: string }) {
  const t = await getTranslations("cafe_starter")

  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto flex flex-col items-center gap-3 px-4 py-8 text-center text-sm">
        <p className="font-medium">{siteName}</p>
        <div className="text-muted-foreground flex flex-wrap justify-center gap-4">
          <Link href="/catalogue" className="hover:underline">
            {t("nav_menu")}
          </Link>
          <Link href="/about" className="hover:underline">
            {t("nav_about")}
          </Link>
        </div>
        <p className="text-muted-foreground text-xs">{t("footer_powered")}</p>
      </div>
    </footer>
  )
}
