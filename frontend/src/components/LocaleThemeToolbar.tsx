"use client"

import { Languages, Moon, Sun } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { normalizeUiLocale } from "@/lib/locale"
import type { Accent } from "@/providers/AppProviders"
import { useThemeSettings } from "@/providers/AppProviders"

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
    document.documentElement.dir = nextLocale === "fa" ? "rtl" : "ltr"
    router.refresh()
  }

  const accents: Accent[] = ["zinc", "slate", "blue", "green", "rose", "orange"]

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
          <Button variant="outline" size="sm" type="button">
            {t(`accent_${accent}` as never)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {accents.map((a) => (
            <DropdownMenuItem key={a} onClick={() => setAccent(a)}>
              {t(`accent_${a}` as never)}
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
