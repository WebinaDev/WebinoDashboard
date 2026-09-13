"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

const LINKS = [
  ["", "home"],
  ["send", "send"],
  ["reports", "reports"],
  ["targeted", "targeted"],
  ["inbox", "inbox"],
  ["drafts", "drafts"],
  ["phonebook", "phonebook"],
  ["scheduled", "scheduled"],
  ["patterns", "patterns"],
  ["secretaries", "secretaries"],
  ["wallet", "wallet"],
  ["lines", "lines"],
  ["newsletter", "newsletter"],
  ["topup", "topup"],
] as const

export function SmsNav() {
  const t = useTranslations("sms_admin")
  const pathname = usePathname()
  return (
    <nav className="mb-4 flex flex-wrap gap-2 text-sm">
      {LINKS.map(([slug, key]) => {
        const href = slug ? `/admin/marketing/sms/${slug}` : "/admin/marketing/sms"
        const active = pathname === href || (slug && pathname?.startsWith(href + "/"))
        return (
          <Link
            key={slug || "home"}
            href={href}
            className={`rounded-md border px-2.5 py-1 ${active ? "border-foreground bg-muted" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {t(`nav.${key}`)}
          </Link>
        )
      })}
    </nav>
  )
}
