import Link from "next/link"
import type { SiteChromeProps } from "@/themes/shared/types"

export async function SiteFooter({ siteName }: SiteChromeProps) {
  return (
    <footer className="mt-12 border-t border-zinc-200 bg-white">
      <div className="container mx-auto flex flex-col gap-2 px-4 py-8 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} {siteName}</p>
        <div className="flex gap-4">
          <Link href="/shop" className="hover:text-zinc-900">
            فروشگاه
          </Link>
          <Link href="/pages/about" className="hover:text-zinc-900">
            درباره
          </Link>
        </div>
      </div>
    </footer>
  )
}
