"use client"

import { AlertTriangle } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

export function isSmsUnavailable(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false
  const p = payload as { unavailable?: boolean; ok?: boolean }
  return p.unavailable === true || p.ok === false
}

/** Hide raw SQL / provider internals from operators. */
export function sanitizeSmsErrorMessage(message?: string | null): string | undefined {
  if (!message) return undefined
  const m = message.trim()
  if (!m) return undefined
  if (/SQLSTATE|relation\s+"|Undefined table|modirpayamak_|ippanel|stack\s+trace/i.test(m)) {
    return undefined
  }
  return m
}

export function SmsServiceBanner({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const t = useTranslations("sms")
  const detail = sanitizeSmsErrorMessage(message)

  return (
    <div className="border-destructive/30 bg-destructive/5 text-destructive mb-4 flex flex-wrap items-start gap-3 rounded-lg border p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{t("serviceUnavailableTitle")}</p>
        <p className="text-destructive/80 text-xs leading-relaxed">{detail || t("serviceUnavailable")}</p>
      </div>
      {onRetry ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          {t("retry")}
        </Button>
      ) : null}
    </div>
  )
}
