"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { Circle } from "lucide-react"

import type { NavMainItem } from "@/components/sidebar-07/nav-main"
import { useDashboardNav } from "@/hooks/useDashboardNav"
import { DASHBOARD_BASE } from "@/kernel/paths"

const PREFERRED = [
  "/orders",
  "/products",
  "/users",
  "/marketing/coupons",
  "/tickets",
  "/media",
  "/reports",
  "/settings",
]

type QuickLink = { title: string; url: string; icon: NavMainItem["icon"] }

/** ERP quick-link grid: permission-aware (built from the visible nav). */
export function HomeQuickLinks() {
  const t = useTranslations("shell.home")
  const { navSections } = useDashboardNav()

  const all: QuickLink[] = []
  for (const section of navSections) {
    for (const item of section.items) {
      if (item.url && item.url !== "#" && item.url !== DASHBOARD_BASE) all.push({ title: item.title, url: item.url, icon: item.icon })
      for (const sub of item.items ?? []) {
        if (sub.url && sub.url !== "#") all.push({ title: sub.title, url: sub.url, icon: item.icon })
      }
    }
  }
  const picked: QuickLink[] = []
  for (const suffix of PREFERRED) {
    const hit = all.find((l) => l.url === `${DASHBOARD_BASE}${suffix}` && !picked.includes(l))
    if (hit) picked.push(hit)
  }
  for (const l of all) {
    if (picked.length >= 8) break
    if (!picked.some((p) => p.url === l.url)) picked.push(l)
  }
  if (!picked.length) return null

  return (
    <section className="space-y-2" aria-label={t("quick")}>
      <h2 className="text-muted-foreground text-xs font-semibold">{t("quick")}</h2>
      <div className="wd-desk-quick grid grid-cols-4 gap-2">
        {picked.slice(0, 8).map((l) => {
          const Icon = l.icon ?? Circle
          return (
            <Link
              key={l.url}
              href={l.url}
              className="wd-desk-quick-item flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-border/70 bg-card p-2.5 text-center text-[11px] font-medium leading-tight transition-colors hover:border-primary/40 hover:text-primary"
            >
              <span className="wd-desk-quick-ic grid size-9 place-items-center rounded-[10px] bg-primary/10 text-primary">
                <Icon className="size-[18px]" strokeWidth={1.75} />
              </span>
              <span className="line-clamp-2 w-full break-words">{l.title}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
