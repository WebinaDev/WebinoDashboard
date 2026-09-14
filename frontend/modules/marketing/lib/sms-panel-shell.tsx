"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

import { PageShell } from "@/components/PageShell"
import { cn } from "@/lib/utils"

const LINKS = [
  ["", "home"],
  ["send", "send"],
  ["reports", "reports"],
  ["inbox", "inbox"],
  ["phonebook", "phonebook"],
  ["patterns", "patterns"],
  ["secretaries", "secretaries"],
  ["wallet", "wallet"],
  ["lines", "lines"],
  ["topup", "topup"],
] as const

export function SmsPanelShell({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  const t = useTranslations("sms")
  const pathname = usePathname()

  return (
    <PageShell title={title} description={description ?? t("description")}>
      <nav className="mb-4 flex flex-wrap gap-1.5">
        {LINKS.map(([slug, key]) => {
          const href = slug ? `/admin/marketing/sms/${slug}` : "/admin/marketing/sms"
          const active = pathname === href || (slug !== "" && pathname?.startsWith(href))
          return (
            <Link
              key={slug || "home"}
              href={href}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`nav.${key}`)}
            </Link>
          )
        })}
      </nav>
      {children}
    </PageShell>
  )
}
