"use client"

import {
  Gift,
  MessageSquareText,
  Percent,
  Ticket,
  TicketPercent,
  Truck,
  Users,
  Target,
  PanelTop,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"

import { PageShell } from "@/components/PageShell"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { dashboardPath } from "@/kernel/paths"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { cn } from "@/lib/utils"

type ToolId =
  | "sms"
  | "mission"
  | "gift"
  | "free_shipping"
  | "referral"
  | "discount_codes"
  | "strikethrough"
  | "popup"
  | "coupon"

type ToolGroup = "messaging" | "loyalty" | "offers" | "storefront"

type ToolCard = {
  id: ToolId
  href: string
  icon: LucideIcon
  status: "ready" | "linked" | "scaffold"
  group: ToolGroup
}

const TOOLS: ToolCard[] = [
  { id: "sms", href: dashboardPath("marketing/sms"), icon: MessageSquareText, status: "ready", group: "messaging" },
  {
    id: "mission",
    href: dashboardPath("marketing/mission"),
    icon: Target,
    status: "ready",
    group: "loyalty",
  },
  {
    id: "gift",
    href: dashboardPath("marketing/gift"),
    icon: Gift,
    status: "ready",
    group: "loyalty",
  },
  {
    id: "referral",
    href: dashboardPath("marketing/referral"),
    icon: Users,
    status: "ready",
    group: "loyalty",
  },
  {
    id: "free_shipping",
    href: `${dashboardPath("marketing/coupon-builder")}?reward=free_shipping&wizard=1`,
    icon: Truck,
    status: "ready",
    group: "offers",
  },
  {
    id: "discount_codes",
    href: dashboardPath("marketing/coupons"),
    icon: TicketPercent,
    status: "ready",
    group: "offers",
  },
  {
    id: "coupon",
    href: dashboardPath("marketing/coupon-builder"),
    icon: Ticket,
    status: "ready",
    group: "offers",
  },
  {
    id: "strikethrough",
    href: dashboardPath("marketing/sale-prices"),
    icon: Percent,
    status: "ready",
    group: "offers",
  },
  {
    id: "popup",
    href: dashboardPath("marketing/popup"),
    icon: PanelTop,
    status: "ready",
    group: "storefront",
  },
]

const GROUPS: ToolGroup[] = ["messaging", "loyalty", "offers", "storefront"]

export default function CustomerReturnPageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("customer_return")

  return (
    <PageShell title={t("title")} description={t("subtitle")} eyebrow={t("eyebrow")}>
      <div className="space-y-8">
        {GROUPS.map((group) => {
          const cards = TOOLS.filter((c) => c.group === group)
          if (!cards.length) return null
          return (
            <section key={group} className="space-y-3">
              <div>
                <h2 className="text-base font-semibold">{t(`groups.${group}`)}</h2>
                <p className="text-muted-foreground text-sm">{t(`groupHints.${group}`)}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map(({ id, href, icon: Icon, status }) => (
                  <Link key={id} href={href} className="group focus-visible:outline-none">
                    <Card
                      className={cn(
                        "h-full shadow-soft transition-colors",
                        "group-hover:border-primary/40 group-focus-visible:ring-2 group-focus-visible:ring-ring",
                      )}
                    >
                      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                          <Icon className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-base">{t(`tools.${id}.title`)}</CardTitle>
                            <Badge
                              variant={
                                status === "ready" ? "default" : status === "linked" ? "secondary" : "outline"
                              }
                              className="text-[10px]"
                            >
                              {t(`status.${status}`)}
                            </Badge>
                          </div>
                          <CardDescription className="leading-relaxed">
                            {t(`tools.${id}.description`)}
                          </CardDescription>
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
