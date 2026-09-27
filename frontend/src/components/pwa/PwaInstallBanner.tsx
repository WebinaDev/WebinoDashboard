"use client"

import { Download, Share, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { PwaClientBootstrap } from "@/lib/pwa-settings"

const DISMISS_KEY = "wd_pwa_install_dismissed"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return true
  if (window.matchMedia("(display-mode: standalone)").matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  const webkit = /WebKit/.test(ua)
  const notChrome = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return iOS && webkit && notChrome
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1"
  } catch {
    return false
  }
}

function setDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1")
  } catch {
    /* ignore */
  }
}

type Props = {
  pwa: PwaClientBootstrap
  className?: string
  variant?: "login" | "shell"
}

export function PwaInstallBanner({ pwa, className, variant = "shell" }: Props) {
  const t = useTranslations("pwa")
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!pwa.enabled || !pwa.showInstallBanner) return
    if (isStandaloneDisplay() || wasDismissed()) return

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
      setIosHint(false)
    }
    window.addEventListener("beforeinstallprompt", onBip)

    if (isIosSafari()) {
      setIosHint(true)
      setVisible(true)
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip)
  }, [pwa.enabled, pwa.showInstallBanner])

  const dismiss = useCallback(() => {
    setDismissed()
    setVisible(false)
    setDeferred(null)
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return
    try {
      await deferred.prompt()
      await deferred.userChoice
    } catch {
      /* ignore */
    }
    setDeferred(null)
    setVisible(false)
    setDismissed()
  }, [deferred])

  if (!visible) return null

  return (
    <div
      role="region"
      aria-label={t("installRegion")}
      className={cn(
        "border-border bg-card text-card-foreground flex items-start gap-3 rounded-lg border p-3 shadow-sm",
        variant === "shell" &&
          "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-md md:inset-x-auto md:end-4 md:start-auto",
        variant === "login" && "mb-4 w-full",
        className,
      )}
    >
      <div className="bg-primary/10 text-primary mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md">
        {iosHint && !deferred ? (
          <Share className="size-4" aria-hidden />
        ) : (
          <Download className="size-4" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium leading-snug">{t("installTitle")}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {deferred ? t("installBodyAndroid") : t("installBodyIos")}
        </p>
        {deferred ? (
          <Button type="button" size="sm" className="mt-2" onClick={() => void install()}>
            {t("installAction")}
          </Button>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        onClick={dismiss}
        aria-label={t("installDismiss")}
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}
