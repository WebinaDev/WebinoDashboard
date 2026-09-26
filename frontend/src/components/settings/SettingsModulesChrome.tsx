"use client"

import type { ReactNode } from "react"
import { useLocale, useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import { useMemo } from "react"

import { SettingsModuleCardStrip } from "@/components/settings/SettingsModuleCardStrip"
import { SettingsModuleTabs } from "@/components/settings/SettingsModuleTabs"
import {
  activeSectionForPath,
  findUnitByPath,
} from "@/lib/settings-nav"

export function SettingsModulesChrome({ children }: { children: ReactNode }) {
  const t = useTranslations("settings_hub")
  const locale = useLocale()
  const pathname = usePathname() ?? ""

  const activeUnit = useMemo(() => findUnitByPath(pathname), [pathname])
  const activeSection = activeUnit
    ? activeSectionForPath(activeUnit, pathname)
    : undefined

  const title = activeUnit
    ? locale === "en"
      ? activeUnit.titleEn
      : activeUnit.titleFa
    : t("title")

  const description = activeUnit
    ? activeUnit.area === "site"
      ? t("site_description")
      : t("shop_description")
    : t("description")

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div>
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {t("title")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      <SettingsModuleCardStrip activeUnitId={activeUnit?.id} />
      {activeUnit ? (
        <>
          <SettingsModuleTabs
            sections={activeUnit.sections}
            activeRoute={activeSection?.route ?? pathname}
            alwaysShow={activeUnit.sections.length > 1}
          />
          <div className="min-w-0">{children}</div>
        </>
      ) : (
        <div className="min-w-0 space-y-3">
          <p className="text-muted-foreground text-sm">{t("pick_hint")}</p>
          {children}
        </div>
      )}
    </div>
  )
}
