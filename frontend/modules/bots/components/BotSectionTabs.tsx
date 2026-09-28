"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"

import { dashboardPath } from "@/kernel/paths"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { cn } from "@/lib/utils"

import type { BotProvider } from "./BotProviderSwitcher"

type Section = "settings" | "logs" | "coupons"

export function providerFromRoute(route: ResolvedAdminRoute): BotProvider {
  return route.submodule === "telegram" ? "telegram" : "bale"
}

export function BotSectionTabs({ provider, active }: { provider: BotProvider; active: Section }) {
  const t = useTranslations("bots")
  const tabs: { id: Section; href: string; label: string }[] = [
    { id: "settings", href: dashboardPath(`bots/${provider}`), label: t("settings.title") },
    { id: "logs", href: dashboardPath(`bots/${provider}/logs`), label: t("logs.title") },
    { id: "coupons", href: dashboardPath(`bots/${provider}/coupons`), label: t("coupons.title") },
  ]

  return (
    <nav className="mb-4 flex flex-wrap gap-2 border-b border-border pb-2">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            tab.id === active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
