"use client"

import {
  BookUser,
  ClipboardList,
  CreditCard,
  FileText,
  Home,
  Inbox,
  LineChart,
  Megaphone,
  MessageSquarePlus,
  Phone,
  Send,
  Settings2,
  Timer,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { PageShell } from "@/components/PageShell"
import { cn } from "@/lib/utils"

type SmsNavItem = {
  slug: string
  key: string
  icon: LucideIcon
}

const PRIMARY: SmsNavItem[] = [
  { slug: "", key: "home", icon: Home },
  { slug: "ads/new", key: "ads", icon: Megaphone },
  { slug: "send", key: "send", icon: Send },
  { slug: "reports", key: "reports", icon: LineChart },
  { slug: "inbox", key: "inbox", icon: Inbox },
  { slug: "phonebook", key: "phonebook", icon: BookUser },
  { slug: "patterns", key: "patterns", icon: FileText },
]

const SECONDARY: SmsNavItem[] = [
  { slug: "secretaries", key: "secretaries", icon: Settings2 },
  { slug: "wallet", key: "wallet", icon: Wallet },
  { slug: "lines", key: "lines", icon: Phone },
  { slug: "topup", key: "topup", icon: CreditCard },
  { slug: "targeted", key: "targeted", icon: MessageSquarePlus },
  { slug: "scheduled", key: "scheduled", icon: Timer },
  { slug: "drafts", key: "drafts", icon: ClipboardList },
  { slug: "newsletter", key: "newsletter", icon: FileText },
]

function NavPills({
  items,
  pathname,
  t,
}: {
  items: SmsNavItem[]
  pathname: string | null
  t: (key: string) => string
}) {
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label={t("title")}>
      {items.map(({ slug, key, icon: Icon }) => {
        const href = slug ? `/dashboard/marketing/sms/${slug}` : "/dashboard/marketing/sms"
        const active =
          pathname === href ||
          (slug !== "" && slug !== "ads/new" && pathname?.startsWith(href)) ||
          (slug === "ads/new" && pathname?.includes("/marketing/sms/ads"))
        return (
          <Link
            key={slug || "home"}
            href={href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/80 bg-card text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <Icon className="size-3.5 shrink-0 opacity-80" />
            {t(`nav.${key}`)}
          </Link>
        )
      })}
    </nav>
  )
}

export function SmsPanelShell({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const t = useTranslations("sms")
  const pathname = usePathname()

  return (
    <PageShell title={title} description={description ?? t("description")} actions={actions}>
      <div className="mb-5 space-y-2.5 rounded-xl border border-border/70 bg-card/60 p-3 shadow-soft">
        <p className="text-muted-foreground px-0.5 text-[11px] font-medium tracking-wide uppercase">{t("navPrimary")}</p>
        <NavPills items={PRIMARY} pathname={pathname} t={t} />
        <div className="border-border/60 space-y-2 border-t pt-2.5">
          <p className="text-muted-foreground px-0.5 text-[11px] font-medium tracking-wide uppercase">{t("navSecondary")}</p>
          <NavPills items={SECONDARY} pathname={pathname} t={t} />
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </PageShell>
  )
}
