"use client"

import {
  Bell,
  Bot,
  CalendarClock,
  HeartHandshake,
  Megaphone,
  MessageSquareText,
  Percent,
  RefreshCw,
  Ticket,
  TicketPercent,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"

import { PageShell } from "@/components/PageShell"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { dashboardPath } from "@/kernel/paths"

type HubCard = {
  id:
    | "customer_return"
    | "coupon_builder"
    | "coupons"
    | "sale_prices"
    | "sms_ads"
    | "sms"
    | "bot_broadcast"
    | "bot_campaigns"
    | "loyalty"
    | "notifications"
  href: string
  icon: LucideIcon
  group: "offers" | "return" | "messaging" | "loyalty"
}

const CARDS: HubCard[] = [
  { id: "customer_return", href: dashboardPath("marketing/customer-return"), icon: RefreshCw, group: "return" },
  { id: "coupon_builder", href: dashboardPath("marketing/coupon-builder"), icon: Ticket, group: "offers" },
  { id: "coupons", href: dashboardPath("marketing/coupons"), icon: TicketPercent, group: "offers" },
  { id: "sale_prices", href: dashboardPath("marketing/sale-prices"), icon: Percent, group: "offers" },
  { id: "sms_ads", href: dashboardPath("marketing/sms/ads/new"), icon: Megaphone, group: "messaging" },
  { id: "sms", href: dashboardPath("marketing/sms"), icon: MessageSquareText, group: "messaging" },
  { id: "bot_broadcast", href: dashboardPath("marketing/bot-broadcast"), icon: Bot, group: "messaging" },
  { id: "bot_campaigns", href: dashboardPath("marketing/bot-campaigns"), icon: CalendarClock, group: "messaging" },
  { id: "loyalty", href: dashboardPath("settings/shop/loyalty"), icon: HeartHandshake, group: "loyalty" },
  { id: "notifications", href: dashboardPath("settings/site/notifications"), icon: Bell, group: "loyalty" },
]

const GROUPS: Array<HubCard["group"]> = ["return", "offers", "messaging", "loyalty"]

export default function CommerceMarketingPage() {
  const t = useTranslations("marketing_hub")

  return (
    <PageShell title={t("title")} description={t("subtitle")} eyebrow={t("eyebrow")}>
      <div className="space-y-8">
        {GROUPS.map((group) => {
          const cards = CARDS.filter((c) => c.group === group)
          if (cards.length === 0) return null
          return (
            <section key={group} className="space-y-3">
              <div>
                <h2 className="text-base font-semibold">{t(`groups.${group}`)}</h2>
                <p className="text-muted-foreground text-sm">{t(`groupHints.${group}`)}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map(({ id, href, icon: Icon }) => (
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
            </section>
          )
        })}
      </div>
    </PageShell>
  )
}
