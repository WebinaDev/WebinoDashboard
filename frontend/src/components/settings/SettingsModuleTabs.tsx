"use client"

import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import type { SettingsSectionDef } from "@/lib/settings-nav"

export function SettingsModuleTabs({
  sections,
  activeRoute,
  className,
  alwaysShow = false,
}: {
  sections: SettingsSectionDef[]
  activeRoute?: string
  className?: string
  alwaysShow?: boolean
}) {
  const t = useTranslations("settings_hub")
  const locale = useLocale()

  if (sections.length === 0) return null
  if (!alwaysShow && sections.length <= 1) return null

  const path = (activeRoute ?? "").replace(/\/$/, "")

  return (
    <nav
      className={cn(
        "flex w-full min-w-0 gap-1 overflow-x-auto overscroll-x-contain touch-pan-x border-b border-border pb-px snap-x snap-mandatory",
        className
      )}
      aria-label={t("tabs_label")}
    >
      {sections.map((s) => {
        const route = s.route.replace(/\/$/, "")
        const isActive = path === route || path.startsWith(route + "/")
        const label = locale === "en" ? s.titleEn : s.titleFa
        return (
          <Link
            key={s.id}
            href={s.route}
            className={cn(
              "shrink-0 snap-start border-b-2 px-3.5 py-2.5 text-sm whitespace-nowrap transition-colors",
              isActive
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
