import Link from "next/link"
import { getServerTranslations } from "@/lib/server-translations"

export async function SiteFooter({ siteName }: { siteName: string }) {
  const t = await getServerTranslations("site.footer")

  return (
    <footer className="mt-10 bg-gradient-to-l from-violet-950 to-orange-900 text-orange-50">
      <div className="container mx-auto grid gap-6 px-4 py-12 text-sm md:grid-cols-2">
        <div>
          <p className="text-lg font-extrabold">{siteName}</p>
          <p className="mt-2 opacity-80">قالب دمو فروشگاه وبینو با ظاهر پررنگ و متمایز.</p>
        </div>
        <div className="flex flex-wrap items-end justify-start gap-4 md:justify-end">
          <Link href="/pages/about" className="font-bold underline-offset-4 hover:underline">
            {t("about")}
          </Link>
          <Link href="/shop" className="font-bold underline-offset-4 hover:underline">
            فروشگاه
          </Link>
          <Link href="/consultation" className="font-bold underline-offset-4 hover:underline">
            {t("contact")}
          </Link>
        </div>
      </div>
      <p className="border-t border-white/10 px-4 py-4 text-center text-xs opacity-70">
        © {new Date().getFullYear()} {siteName}
      </p>
    </footer>
  )
}
