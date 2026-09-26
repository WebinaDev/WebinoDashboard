"use client"

import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useRef } from "react"
import { Building2, ChevronLeft, ChevronRight, Puzzle, Store } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  SETTINGS_UNITS,
  type SettingsUnitDef,
} from "@/lib/settings-nav"

function CardIcon({ unit, active }: { unit: SettingsUnitDef; active: boolean }) {
  const cls = cn("size-4", active ? "text-primary" : "text-muted-foreground")
  if (unit.area === "site" && unit.id === "site-security") {
    return <Building2 className={cls} aria-hidden />
  }
  if (unit.area === "shop" && unit.id === "shop-general") {
    return <Store className={cls} aria-hidden />
  }
  if (unit.area === "site") return <Building2 className={cls} aria-hidden />
  if (unit.area === "shop") return <Store className={cls} aria-hidden />
  return <Puzzle className={cls} aria-hidden />
}

export function SettingsModuleCardStrip({
  activeUnitId,
  className,
}: {
  activeUnitId?: string
  className?: string
}) {
  const t = useTranslations("settings_hub")
  const locale = useLocale()
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !activeUnitId) return
    const active = el.querySelector<HTMLElement>(
      `[data-module-slug="${CSS.escape(activeUnitId)}"]`
    )
    active?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" })
  }, [activeUnitId])

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    const amount = Math.min(320, el.clientWidth * 0.7)
    const rtl = getComputedStyle(el).direction === "rtl"
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * amount, behavior: "smooth" })
  }

  return (
    <div className={cn("w-full min-w-0 space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {t("strip_title")}
        </p>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={t("scroll_prev")}
            onClick={() => scrollBy(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={t("scroll_next")}
            onClick={() => scrollBy(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="flex w-full min-w-0 gap-2.5 overflow-x-auto overscroll-x-contain touch-pan-x pb-2 snap-x snap-mandatory"
        role="list"
        aria-label={t("strip_title")}
      >
        {SETTINGS_UNITS.map((g) => {
          const to = g.sections[0]?.route ?? "/dashboard/settings"
          const active = g.id === activeUnitId
          const label = locale === "en" ? g.titleEn : g.titleFa
          return (
            <Link
              key={g.id}
              href={to}
              role="listitem"
              data-module-slug={g.id}
              className={cn(
                "bg-card hover:bg-accent/40 flex w-[10.5rem] shrink-0 snap-start flex-col gap-2 rounded-2xl border px-3.5 py-3 shadow-sm transition-[box-shadow,border-color,background]",
                active
                  ? "border-primary/40 ring-primary/20 shadow-md ring-2"
                  : "border-border/70"
              )}
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-xl",
                  active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                <CardIcon unit={g} active={active} />
              </span>
              <span className="truncate text-sm font-medium leading-tight">{label}</span>
              <span className="text-muted-foreground truncate text-[11px]">
                {t("section_count", { count: g.sections.length })}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
