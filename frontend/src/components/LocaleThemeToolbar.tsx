"use client"

import { Check, Languages, Monitor, Moon, Palette, Sun } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ACCENT_MENU_ITEMS, ACCENT_SWATCH, isBusinessAccent, type AccentPreset } from "@/lib/accent"
import { api } from "@/lib/api"
import { htmlDir, normalizeUiLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"
import { useThemeSettings, type ThemeMode } from "@/providers/AppProviders"

function AccentSwatch({ value, className }: { value: AccentPreset; className?: string }) {
  return (
    <span
      className={cn("shrink-0 rounded-full ring-1 ring-border", className)}
      style={{ background: ACCENT_SWATCH[value] }}
      aria-hidden
    />
  )
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "dark") return <Moon className="size-4" />
  if (mode === "light") return <Sun className="size-4" />
  return <Monitor className="size-4" />
}

export function LocaleThemeToolbar({ compact }: { compact?: boolean }) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations("common")
  const { mode, setMode, accent, setAccent } = useThemeSettings()

  const lng = normalizeUiLocale(locale)

  function changeLanguage(nextLocale: "en" | "fa") {
    document.cookie = `NEXT_LOCALE=${nextLocale};path=/;max-age=31536000`
    localStorage.setItem("locale", nextLocale)
    document.documentElement.lang = nextLocale
    document.documentElement.dir = htmlDir(nextLocale)
    void api("/api/v1/account/preferences", {
      method: "PATCH",
      json: { locale: nextLocale },
    }).catch(() => {})
    router.refresh()
  }

  const themeCycle: ThemeMode[] = ["light", "dark", "system"]
  const nextTheme = themeCycle[(themeCycle.indexOf(mode) + 1) % themeCycle.length] ?? "system"

  return (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "gap-1")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size={compact ? "icon" : "sm"}
            type="button"
            aria-label={t("locale_label")}
          >
            <Languages className="size-4" />
            {compact ? null : lng === "fa" ? t("locale_fa") : t("locale_en")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => changeLanguage("en")}>
            {t("locale_en")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => changeLanguage("fa")}>
            {t("locale_fa")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            type="button"
            className="relative"
            aria-label={t("accent_label")}
          >
            <Palette className="size-4" />
            <AccentSwatch value={accent} className="absolute end-1.5 bottom-1.5 size-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {ACCENT_MENU_ITEMS.map((item) => (
            <DropdownMenuItem
              key={item.value}
              className="gap-2"
              onClick={() => setAccent(item.value)}
            >
              <AccentSwatch
                value={item.value}
                className={cn(
                  "size-3.5",
                  isBusinessAccent(item.value) && "ring-primary/30 shadow-sm",
                )}
              />
              <span className="flex-1 text-start">{t(`accent_${item.value}` as never)}</span>
              {accent === item.value ? <Check className="ms-auto size-4 shrink-0" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setMode(nextTheme)}
        aria-label={t(`theme_${mode}` as "theme_light")}
      >
        <ThemeIcon mode={mode} />
      </Button>
    </div>
  )
}
