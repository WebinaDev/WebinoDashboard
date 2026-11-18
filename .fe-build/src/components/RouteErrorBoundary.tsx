"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"

/** Fallback UI for Next.js `error.tsx` route segments. */
export function RouteErrorBoundary({
  error,
  reset,
  homeHref = "/dashboard",
  homeLabel,
}: {
  error: Error & { digest?: string }
  reset: () => void
  homeHref?: string
  homeLabel?: string
}) {
  const t = useTranslations("ui")
  const showDetails = process.env.NODE_ENV !== "production"

  useEffect(() => {
    console.error("[Webino Dashboard] Route render failed", error)
  }, [error])

  return (
    <div role="alert" className="flex flex-1 flex-col gap-3 p-6">
      <h1 className="text-lg font-semibold">{t("route_error_title")}</h1>
      <p className="text-muted-foreground text-sm">{t("route_error_body")}</p>
      {showDetails && error.message ? (
        <pre className="bg-muted max-h-40 overflow-auto rounded-md p-3 text-xs break-words whitespace-pre-wrap" dir="ltr">
          {error.message}
        </pre>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => reset()}>
          {t("retry")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
          {t("reload_page")}
        </Button>
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link href={homeHref}>{homeLabel ?? t("back_home")}</Link>
        </Button>
      </div>
    </div>
  )
}
