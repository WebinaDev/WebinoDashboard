"use client"

import { useTranslations } from "next-intl"

import { RouteErrorBoundary } from "@/components/RouteErrorBoundary"

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("ui")
  return <RouteErrorBoundary error={error} reset={reset} homeHref="/" homeLabel={t("back_site")} />
}
