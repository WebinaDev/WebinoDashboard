"use client"

import { AppWindow, Bell, ShoppingCart, Bot, CalendarClock, HeartHandshake, Megaphone, MessageSquareText, Percent, TicketPercent, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"

import { PageShell } from "@/components/PageShell"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { dashboardPath } from "@/kernel/paths"

type HubCard = {
  id: "coupons" | "sale_prices" | "sms_ads" | "sms" | "bot_broadcast" | "bot_campaigns" | "loyalty" | "notifications" | "popups" | "abandoned_carts"
  href: string
  icon: LucideIcon
}

const CARDS: HubCard[] = [
  { id: "coupons", href: dashboardPath("marketing/coupons"), icon: TicketPercent },
  { id: "sale_prices", href: dashboardPath("marketing/sale-prices"), icon: Percent },
  { id: "sms_ads", href: dashboardPath("marketing/sms/ads/new"), icon: Megaphone },
  { id: "sms", href: dashboardPath("marketing/sms"), icon: MessageSquareText },
  { id: "bot_broadcast", href: dashboardPath("marketing/bot-broadcast"), icon: Bot },
  { id: "bot_campaigns", href: dashboardPath("marketing/bot-campaigns"), icon: CalendarClock },
  { id: "popups", href: dashboardPath("marketing/popups"), icon: AppWindow },
  { id: "abandoned_carts", href: dashboardPath("marketing/abandoned-carts"), icon: ShoppingCart },
  { id: "loyalty", href: dashboardPath("settings/shop/loyalty"), icon: HeartHandshake },
  { id: "notifications", href: dashboardPath("settings/site/notifications"), icon: Bell },
]

export default function CommerceMarketingPage() {
  const t = useTranslations("marketing_hub")

  return (
    <PageShell title={t("title")} description={t("subtitle")}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CARDS.map(({ id, href, icon: Icon }) => (
          <Link key={id} href={href} className="group focus-visible:outline-none">
            <Card className="h-full shadow-soft transition-colors group-hover:border-primary/40 group-focus-visible:ring-2 group-focus-visible:ring-ring">
              <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-base">{t(`cards.${id}.title`)}</CardTitle>
                  <CardDescription>{t(`cards.${id}.description`)}</CardDescription>
                  <span className="text-primary text-sm font-medium">{t("open")}</span>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </PageShell>
  )
}
