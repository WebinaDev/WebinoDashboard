import Link from "next/link"
import { getServerTranslations } from "@/lib/server-translations"

export async function SiteFooter({ siteName }: { siteName: string }) {
  const t = await getServerTranslations("site.footer")

  return (
    <footer className="mt-8 border-t-2 border-slate-800 bg-slate-900 text-slate-100">
      <div className="container mx-auto flex flex-col gap-4 px-4 py-10 text-sm md:flex-row md:items-center md:justify-between">
        <p className="opacity-80">© {new Date().getFullYear()} {siteName}</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/pages/about" className="hover:underline">
            {t("about")}
          </Link>
          <Link href="/shop" className="hover:underline">
            فروشگاه
          </Link>
          <Link href="/consultation" className="hover:underline">
            {t("contact")}
          </Link>
        </div>
      </div>
    </footer>
  )
}
