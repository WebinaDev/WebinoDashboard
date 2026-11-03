"use client"

import Link from "next/link"
import {
  CalendarDays,
  ChefHat,
  Clock3,
  GalleryHorizontalEnd,
  Inbox,
  MapPin,
  QrCode,
  ShoppingBag,
  Store,
  UtensilsCrossed,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Card } from "@/components/ui/card"
import { formatDate, formatNumber, normalizeUiLocale } from "@/lib/locale"
import type { DashboardOverviewCafe } from "@/types/dashboardOverview"

const KITCHEN_STATUSES = [
  "new",
  "preparing",
  "ready",
  "served",
  "out_for_delivery",
  "done",
] as const

function kitchenStatusLabel(
  t: (key: `kitchen.status.${(typeof KITCHEN_STATUSES)[number]}`) => string,
  status: string,
): string {
  if ((KITCHEN_STATUSES as readonly string[]).includes(status)) {
    return t(`kitchen.status.${status as (typeof KITCHEN_STATUSES)[number]}`)
  }
  return status
}

const SHORTCUT_ICONS: Record<
  string,
  typeof ChefHat
> = {
  kitchen: ChefHat,
  menu: UtensilsCrossed,
  reservations: CalendarDays,
  qr: QrCode,
  inbox: Inbox,
  gallery: GalleryHorizontalEnd,
  hours: Clock3,
  venue: MapPin,
}

type HomeCafePanelProps = {
  cafe: DashboardOverviewCafe
  locale: string
}

function StatTile({
  title,
  value,
  hint,
  href,
  icon: Icon,
}: {
  title: string
  value: string
  hint?: string
  href: string
  icon: typeof ChefHat
}) {
  return (
    <Link
      href={href}
      className="wd-mini-tint flex min-h-[5.5rem] flex-col justify-between rounded-xl border bg-card px-3 py-2.5 transition-opacity hover:opacity-90"
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="wd-icon-chip size-6">
          <Icon className="size-3.5 shrink-0" />
        </span>
        <span className="truncate">{title}</span>
      </div>
      <p className="text-xl font-semibold tracking-tight">{value}</p>
      {hint ? (
        <p className="line-clamp-1 text-[10px] text-muted-foreground">{hint}</p>
      ) : (
        <p className="text-[10px]">{"\u00a0"}</p>
      )}
    </Link>
  )
}

export function HomeCafePanel({ cafe, locale }: HomeCafePanelProps) {
  const t = useTranslations("home.cafe")
  const lng = normalizeUiLocale(locale)
  const currency = cafe.currency || "IRR"

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          title={t("stat.orders_today")}
          value={formatNumber(cafe.today.orders, lng)}
          hint={t("stat.orders_today_hint")}
          href="/dashboard/orders"
          icon={ShoppingBag}
        />
        <Link
          href="/dashboard/orders"
          className="wd-mini-tint flex min-h-[5.5rem] flex-col justify-between rounded-xl border bg-card px-3 py-2.5 transition-opacity hover:opacity-90"
        >
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="wd-icon-chip size-6">
              <Store className="size-3.5 shrink-0" />
            </span>
            <span className="truncate">{t("stat.revenue_today")}</span>
          </div>
          <p className="text-xl font-semibold tracking-tight">
            <MoneyDisplay amount={cafe.today.revenue_minor} currency={currency} />
          </p>
          <p className="line-clamp-1 text-[10px] text-muted-foreground">
            {t("stat.revenue_today_hint")}
          </p>
        </Link>
        <StatTile
          title={t("stat.kitchen")}
          value={formatNumber(cafe.kitchen.open, lng)}
          hint={t("stat.kitchen_hint")}
          href={cafe.kitchen.href}
          icon={ChefHat}
        />
        <StatTile
          title={t("stat.reservations")}
          value={formatNumber(cafe.reservations.today, lng)}
          hint={
            cafe.reservations.pending > 0
              ? t("stat.reservations_pending", {
                  count: formatNumber(cafe.reservations.pending, lng),
                })
              : t("stat.reservations_hint")
          }
          href={cafe.reservations.href}
          icon={CalendarDays}
        />
        <StatTile
          title={t("stat.menu")}
          value={formatNumber(cafe.menu.items_published, lng)}
          hint={t("stat.menu_hint", {
            menus: formatNumber(cafe.menu.menus_active, lng),
          })}
          href={cafe.menu.href}
          icon={UtensilsCrossed}
        />
        <StatTile
          title={t("stat.tables")}
          value={formatNumber(cafe.tables.active, lng)}
          hint={t("stat.tables_hint", {
            total: formatNumber(cafe.tables.total, lng),
            branches: formatNumber(cafe.branches.count, lng),
          })}
          href={cafe.tables.href}
          icon={QrCode}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          title={t("stat.events")}
          value={formatNumber(cafe.events.upcoming, lng)}
          hint={
            cafe.events.bookings_pending > 0
              ? t("stat.events_pending", {
                  count: formatNumber(cafe.events.bookings_pending, lng),
                })
              : t("stat.events_hint")
          }
          href={cafe.events.href}
          icon={CalendarDays}
        />
        <StatTile
          title={t("stat.gallery")}
          value={formatNumber(cafe.gallery.count, lng)}
          hint={t("stat.gallery_hint")}
          href={cafe.gallery.href}
          icon={GalleryHorizontalEnd}
        />
        <StatTile
          title={t("stat.feedback")}
          value={formatNumber(cafe.engagement.feedback_count, lng)}
          hint={t("stat.feedback_hint")}
          href={cafe.engagement.href}
          icon={Inbox}
        />
        <StatTile
          title={t("stat.branches")}
          value={formatNumber(cafe.branches.count, lng)}
          hint={t("stat.branches_hint")}
          href={cafe.branches.href}
          icon={MapPin}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("kitchen.title")}</h3>
            <Link href={cafe.kitchen.href} className="text-xs font-medium text-primary hover:underline">
              {t("view_all")}
            </Link>
          </div>
          {cafe.kitchen.preview.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("kitchen.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {cafe.kitchen.preview.map((row) => (
                <li key={row.id}>
                  <Link
                    href={row.href}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">#{row.number}</span>
                      {row.table_number ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {t("kitchen.table", { table: String(row.table_number) })}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground block truncate text-xs">
                        {row.customer_name} · {kitchenStatusLabel(t, row.kitchen_status)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatNumber(row.item_count, lng)} {t("kitchen.items")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("reservations.title")}</h3>
            <Link
              href={cafe.reservations.href}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t("view_all")}
            </Link>
          </div>
          {cafe.reservations.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("reservations.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {cafe.reservations.upcoming.map((row) => (
                <li key={row.id}>
                  <Link
                    href={row.href}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{row.guest_name}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {row.reserved_at
                          ? formatDate(row.reserved_at, lng, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "—"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatNumber(row.party_size, lng)} {t("reservations.guests")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("popular.title")}</h3>
            <Link href={cafe.menu.href} className="text-xs font-medium text-primary hover:underline">
              {t("view_all")}
            </Link>
          </div>
          {cafe.engagement.popular_items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("popular.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {cafe.engagement.popular_items.map((row) => (
                <li key={row.product_id}>
                  <Link
                    href={row.href}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                  >
                    <span className="truncate font-medium">{row.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {row.metric === "sold"
                        ? t("popular.sold", { count: formatNumber(row.likes_count, lng) })
                        : t("popular.likes", { count: formatNumber(row.likes_count, lng) })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("feedback.title")}</h3>
            <Link
              href={cafe.engagement.href}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t("view_all")}
            </Link>
          </div>
          {cafe.engagement.recent_feedback.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("feedback.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {cafe.engagement.recent_feedback.map((row) => (
                <li key={row.id}>
                  <Link
                    href={row.href}
                    className="block rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{row.product_name}</span>
                      {row.rating > 0 ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatNumber(row.rating, lng)}/5
                        </span>
                      ) : null}
                    </div>
                    {row.comment ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {row.comment}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section className="space-y-2" aria-label={t("shortcuts")}>
        <h3 className="text-xs font-semibold text-muted-foreground">{t("shortcuts")}</h3>
        <div className="wd-desk-quick grid grid-cols-4 gap-2 sm:grid-cols-8">
          {cafe.shortcuts.map((s) => {
            const Icon = SHORTCUT_ICONS[s.key] ?? Store
            return (
              <Link
                key={s.key}
                href={s.href}
                className="wd-desk-quick-item flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-border/70 bg-card p-2.5 text-center text-[11px] font-medium leading-tight transition-colors hover:border-primary/40 hover:text-primary"
              >
                <span className="wd-desk-quick-ic grid size-9 place-items-center rounded-[10px] bg-primary/10 text-primary">
                  <Icon className="size-[18px]" strokeWidth={1.75} />
                </span>
                <span className="line-clamp-2 w-full break-words">
                  {t(`shortcut.${s.key}` as never)}
                </span>
              </Link>
            )
          })}
        </div>
      </section>
    </section>
  )
}
