"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type QueryErrorStateProps = {
  message?: string | null
  onRetry?: () => unknown
  className?: string
}

export function QueryErrorState({ message, onRetry, className }: QueryErrorStateProps) {
  const t = useTranslations("ui")
  const [isRetrying, setIsRetrying] = useState(false)

  const handleRetry = async () => {
    if (!onRetry || isRetrying) return
    setIsRetrying(true)
    try {
      await onRetry()
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <div
      role="alert"
      className={cn("space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center", className)}
    >
      <p className="text-sm text-destructive">{message || t("load_failed")}</p>
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isRetrying}
          aria-busy={isRetrying}
          onClick={() => void handleRetry()}
        >
          {t("retry")}
        </Button>
      ) : null}
    </div>
  )
}
