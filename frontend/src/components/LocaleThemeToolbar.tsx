"use client"

import { Check, Languages, Moon, Palette, Sun } from "lucide-react"
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
import { htmlDir, normalizeUiLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"
import { useThemeSettings } from "@/providers/AppProviders"

function AccentSwatch({ value, className }: { value: AccentPreset; className?: string }) {
  return (
    <span
      className={cn("shrink-0 rounded-full ring-1 ring-border", className)}
      style={{ background: ACCENT_SWATCH[value] }}
      aria-hidden
    />
  )
}

export function LocaleThemeToolbar() {
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
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" type="button">
            <Languages className="size-4" />
            {lng === "fa" ? t("locale_fa") : t("locale_en")}
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
          <Button variant="outline" size="icon" type="button" className="relative" aria-label="accent">
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
        onClick={() => setMode(mode === "dark" ? "light" : "dark")}
        aria-label={mode === "dark" ? "light" : "dark"}
      >
        {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    </div>
  )
}
