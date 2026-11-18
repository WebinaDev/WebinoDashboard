"use client"

import {
  Activity,
  Bot,
  Package,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"

import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import type {
  DashboardOverviewPanels,
  DashboardOverviewProductStats,
} from "@/types/dashboardOverview"

type SmsRefetchState = {
  status: "loading" | "error"
  onRetry: () => void
  message?: string
}

type HomeMiniCardsStripProps = {
  panels?: DashboardOverviewPanels
  products?: DashboardOverviewProductStats
  locale: string
  smsRefetch?: SmsRefetchState
  licenseActive?: boolean
  trafficActive?: boolean
  trafficOnline?: number
  shopActive?: boolean
}

function MiniCard({
  title,
  value,
  hint,
  href,
  icon: Icon,
  variant = "default",
  onRetry,
  retryLabel,
}: {
  title: string
  value: string
  hint?: string
  href?: string
  icon: typeof Package
  variant?: "default" | "error"
  onRetry?: () => void
  retryLabel?: string
}) {
  const isError = variant === "error"
  const inner = (
    <div
      className={`flex min-h-[5.25rem] min-w-[10rem] shrink-0 flex-col justify-between rounded-xl border px-3 py-2 ${
        isError ? "border-destructive/60 bg-destructive/5" : "wd-mini-tint bg-card"
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className={
            isError
              ? "inline-flex size-6 items-center justify-center rounded-md bg-destructive/15 text-destructive"
              : "wd-icon-chip size-6"
          }
        >
          <Icon className="size-3.5 shrink-0" />
        </span>
        <span className="truncate">{title}</span>
      </div>
      <p
        className={`text-base font-semibold leading-tight ${isError ? "text-destructive" : ""}`}
      >
        {value}
      </p>
      <p
        className={`line-clamp-2 text-[10px] ${isError ? "text-destructive/80" : "text-muted-foreground"}`}
      >
        {hint ?? "\u00a0"}
      </p>
      {onRetry && retryLabel ? (
        <button
          type="button"
          className="mt-1 text-start text-[10px] font-medium text-primary hover:underline"
          onClick={onRetry}
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  )
  if (href && !onRetry) {
    return (
      <Link href={href} className="transition-opacity hover:opacity-90">
        {inner}
      </Link>
    )
  }
  return inner
}

export function HomeMiniCardsStrip({
  panels,
  products,
  locale,
  smsRefetch,
  licenseActive: licenseActiveProp,
  trafficActive: trafficActiveProp,
  trafficOnline = 0,
  shopActive: shopActiveProp,
}: HomeMiniCardsStripProps) {
  const t = useTranslations("home")
  const lng = normalizeUiLocale(locale)

  if (
    !panels &&
    !products &&
    licenseActiveProp === undefined &&
    trafficActiveProp === undefined &&
    shopActiveProp === undefined
  ) {
    return null
  }

  const licenseActive = licenseActiveProp ?? panels?.license?.active ?? false
  const trafficActive = trafficActiveProp ?? panels?.analytics?.active ?? false
  const onlineCount = trafficActive
    ? (panels?.analytics?.online ?? trafficOnline)
    : 0
  const shopActive = shopActiveProp ?? panels?.woocommerce?.active ?? false

  const smsError =
    panels?.sms &&
    (panels.sms.unavailable ||
      panels.sms.low_balance ||
      panels.sms.balance === null)

  const smsLoading = smsRefetch?.status === "loading"
  const smsFetchError = smsRefetch?.status === "error"

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {products ? (
        <MiniCard
          title={t("sections.products")}
          value={formatNumber(products.total ?? 0, lng)}
          hint={t("products.total")}
          href="/dashboard/products"
          icon={Package}
        />
      ) : null}

      {panels?.sms ? (
        <MiniCard
          title={t("panels.sms_charge")}
          value={
            smsLoading
              ? "…"
              : panels.sms.unavailable || panels.sms.balance === null
                ? "—"
                : formatNumber(panels.sms.balance, lng)
          }
          hint={
            smsLoading
              ? t("sms.checking")
              : smsFetchError
                ? t("sms.fetch_failed")
                : panels.sms.unavailable
                  ? t("panels.sms_unavailable")
                  : panels.sms.low_balance
                    ? t("sms.low_balance")
                    : panels.sms.price_per_unit > 0
                      ? `${t("panels.sms_unit_price")}: ${formatNumber(panels.sms.price_per_unit, lng)}`
                      : t("sms.charge")
          }
          href={smsFetchError ? undefined : "/dashboard/marketing/sms/topup"}
          icon={Wallet}
          variant={smsError || smsFetchError ? "error" : "default"}
          onRetry={smsFetchError ? smsRefetch.onRetry : undefined}
          retryLabel={smsFetchError ? t("sms.retry") : undefined}
        />
      ) : null}

      <MiniCard
        title={t("panels.license")}
        value={licenseActive ? t("panels.active") : t("panels.inactive")}
        hint={licenseActive ? t("panels.active") : t("panels.inactive")}
        href="/dashboard/settings"
        icon={Shield}
        variant={licenseActive ? "default" : "error"}
      />

      {panels?.security ? (
        <MiniCard
          title={t("panels.security")}
          value={
            panels.security.active
              ? panels.security.score !== null
                ? formatNumber(panels.security.score, lng)
                : t("panels.active")
              : t("panels.inactive")
          }
          hint={
            panels.security.active
              ? t("panels.security_hint", {
                  mode: panels.security.waf_mode,
                  findings: panels.security.open_findings,
                })
              : t("panels.inactive")
          }
          href="/dashboard/settings/site/security"
          icon={ShieldCheck}
          variant={
            !panels.security.active || panels.security.open_findings > 0
              ? "error"
              : "default"
          }
        />
      ) : null}

      <MiniCard
        title={t("sections.traffic")}
        value={
          trafficActive ? formatNumber(onlineCount, lng) : t("panels.inactive")
        }
        hint={trafficActive ? t("traffic.online_now") : "\u00a0"}
        href="/dashboard/analytics/overview"
        icon={Activity}
      />

      <MiniCard
        title={t("panels.shop")}
        value={shopActive ? t("panels.active") : t("panels.inactive")}
        hint={shopActive ? t("panels.shop_hint") : t("panels.inactive")}
        href="/dashboard/settings/shop/general"
        icon={ShoppingCart}
        variant={shopActive ? "default" : "error"}
      />

      {(panels?.bots ?? []).map((bot) => (
        <MiniCard
          key={bot.provider}
          title={t(`panels.bot.${bot.provider}` as "panels.bot.telegram")}
          value={formatNumber(bot.sessions_24h, lng)}
          hint={
            bot.webhook_configured ? t("panels.webhook_ok") : t("panels.webhook_off")
          }
          href={`/dashboard/bots/${bot.provider}`}
          icon={Bot}
          variant={bot.webhook_configured ? "default" : "error"}
        />
      ))}
    </div>
  )
}
