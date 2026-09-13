"use client"

import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"

export function isSmsUnavailable(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false
  const p = payload as { unavailable?: boolean; ok?: boolean }
  return p.unavailable === true || p.ok === false
}

export function SmsServiceBanner({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="border-destructive/30 bg-destructive/5 text-destructive mb-4 flex flex-wrap items-start gap-3 rounded-lg border p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">SMS service unavailable</p>
        <p className="text-destructive/80 text-xs leading-relaxed">
          {message || "CRM / ModirPayamak proxy did not respond. Check license and CRM base URL."}
        </p>
      </div>
      {onRetry ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}
