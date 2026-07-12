"use client"

import { Languages, Moon, Sun } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Accent } from "@/providers/AppProviders"
import { useThemeSettings } from "@/providers/AppProviders"

export function LocaleThemeToolbar() {
  const { i18n, t } = useTranslation()
  const { mode, setMode, accent, setAccent } = useThemeSettings()

  const lng = i18n.language.startsWith("fa") ? "fa" : "en"

  const accents: Accent[] = ["zinc", "slate", "blue", "green", "rose", "orange"]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" type="button">
            <Languages className="size-4" />
            {lng === "fa" ? t("common:locale_fa") : t("common:locale_en")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void i18n.changeLanguage("en")}>
            {t("common:locale_en")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void i18n.changeLanguage("fa")}>
            {t("common:locale_fa")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" type="button">
            {t(`common:accent_${accent}` as never)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {accents.map((a) => (
            <DropdownMenuItem key={a} onClick={() => setAccent(a)}>
              {t(`common:accent_${a}` as never)}
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
