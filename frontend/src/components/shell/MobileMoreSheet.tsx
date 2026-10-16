"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { Circle } from "lucide-react"

import type { NavSection } from "@/hooks/useDashboardNav"
import type { NavMainItem } from "@/components/sidebar-07/nav-main"
import { LocaleThemeToolbar } from "@/components/LocaleThemeToolbar"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { htmlDir } from "@/lib/locale"
import { cn } from "@/lib/utils"

type Tile = { key: string; title: string; url: string; icon: NavMainItem["icon"] }

function flatten(item: NavMainItem): Tile[] {
  if (item.items?.length) {
    const out: Tile[] = []
    const walk = (subs: NonNullable<NavMainItem["items"]>) => {
      for (const s of subs) {
        if (s.items?.length) walk(s.items as NonNullable<NavMainItem["items"]>)
        else if (s.url && s.url !== "#") out.push({ key: `${item.title}:${s.url}`, title: s.title, url: s.url, icon: item.icon })
      }
    }
    walk(item.items)
    return out
  }
  return item.url && item.url !== "#" ? [{ key: item.url, title: item.title, url: item.url, icon: item.icon }] : []
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  navSections: NavSection[]
}

/** ERP-style "More" bottom sheet: every nav section as a tile grid (mobile only). */
export function MobileMoreSheet({ open, onOpenChange, navSections }: Props) {
  const t = useTranslations("shell.mobileMore")
  const locale = useLocale()
  const pathname = usePathname() ?? ""

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        dir={htmlDir(locale)}
        className="wd-mobile-more max-h-[85svh] overflow-y-auto rounded-t-2xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-4 md:hidden"
      >
        <SheetHeader className="pe-10 ps-10 text-start">
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>
        <div className="mt-3 flex flex-col gap-5">
          {navSections.map((section) => {
            const tiles = section.items.flatMap(flatten)
            if (!tiles.length) return null
            return (
              <section key={section.groupLabel} className="flex flex-col gap-2">
                <h3 className="text-muted-foreground text-xs font-semibold">{section.groupLabel}</h3>
                <div className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4">
                  {tiles.map((tile) => {
                    const Icon = tile.icon ?? Circle
                    const active = pathname === tile.url || pathname.startsWith(`${tile.url}/`)
                    return (
                      <Link
                        key={tile.key}
                        href={tile.url}
                        onClick={() => onOpenChange(false)}
                        className={cn(
                          "flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-border/70 bg-card p-2.5 text-center text-[11px] font-medium leading-tight",
                          active && "border-primary/50 bg-primary/5 text-primary",
                        )}
                      >
                        <span className="grid size-9 place-items-center rounded-[10px] bg-primary/10 text-primary">
                          <Icon className="size-[18px]" strokeWidth={1.75} />
                        </span>
                        <span className="line-clamp-2 w-full break-words">{tile.title}</span>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          })}
          <section className="flex flex-col gap-2 border-t pt-4">
            <h3 className="text-muted-foreground text-xs font-semibold">{t("settings")}</h3>
            <LocaleThemeToolbar />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
