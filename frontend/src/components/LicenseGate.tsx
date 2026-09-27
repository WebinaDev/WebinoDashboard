"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { useBootstrapQuery } from "@/hooks/useBootstrapQuery"

const NAG_FORCE_DAYS = 2
const DISMISS_KEY = "license_soft_dismiss_until"

function dismissedUntil(): number {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) || 0)
  } catch {
    return 0
  }
}

export function LicenseSoftBanner() {
  const t = useTranslations("license")
  const { data } = useBootstrapQuery()
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    setHidden(Date.now() < dismissedUntil())
  }, [])

  if (!data || data.license.active || hidden) return null

  return (
    <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>{data.license.unreachable ? t("unreachable_banner") : t("inactive_banner")}</p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" asChild>
            <Link href="/dashboard/license">{t("open_license")}</Link>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              localStorage.setItem(DISMISS_KEY, String(Date.now() + 6 * 60 * 60 * 1000))
              setHidden(true)
            }}
          >
            {t("dismiss")}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function LicenseGate({ children }: { children: ReactNode }) {
  const t = useTranslations("license")
  const pathname = usePathname() ?? ""
  const { data, isError, isLoading } = useBootstrapQuery()

  if (isLoading) return children
  if (isError) {
    return (
      <>
        <div className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">
          {t("api_unavailable")}
        </div>
        {children}
      </>
    )
  }

  const license = data?.license
  if (!license || license.active) {
    return (
      <>
        <LicenseSoftBanner />
        {children}
      </>
    )
  }

  const checkedMs = license.checked_at ? Date.parse(license.checked_at) : 0
  const force =
    checkedMs > 0 && Date.now() - checkedMs > NAG_FORCE_DAYS * 24 * 60 * 60 * 1000

  const allowed =
    pathname.startsWith("/dashboard/license") ||
    pathname.startsWith("/dashboard/account") ||
    pathname === "/dashboard"

  if (force && !allowed) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="max-w-md text-sm">{t("gate_message")}</p>
        <Button asChild>
          <Link href="/dashboard/license">{t("open_license")}</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <LicenseSoftBanner />
      {children}
    </>
  )
}
