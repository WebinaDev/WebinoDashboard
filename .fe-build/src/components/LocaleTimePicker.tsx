"use client"

/**
 * LocaleTimePicker: hour + minute selects. Shows Persian digits for fa,
 * always stores ASCII `HH:mm` (24h) so the backend can parse it.
 */
import { Clock } from "lucide-react"

import { isRtlLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"

export function localeDigits(value: string, locale: string): string {
  if (!isRtlLocale(locale)) return value
  return value.replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)] ?? d)
}

/** Normalise any typed clock (Persian/Arabic digits, `9:5`, `۹٫۰۰`) to `HH:mm`, or null. */
export function normalizeClock(raw: string | null | undefined): string | null {
  if (!raw) return null
  const ascii = raw
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٫.،]/g, ":")
    .trim()
  const m = ascii.match(/^(\d{1,2}):(\d{1,2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if ((h > 23 && !(h === 24 && min === 0)) || min > 59) return null
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

const pad = (n: number) => String(n).padStart(2, "0")
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i))
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5))

type Props = {
  locale: string
  value: string | null
  onChange: (value: string) => void
  disabled?: boolean
  "aria-label"?: string
  className?: string
}

const selectClass =
  "h-9 rounded-md border border-input bg-background text-foreground [color-scheme:light] dark:[color-scheme:dark] px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"

export function LocaleTimePicker({ locale, value, onChange, disabled, "aria-label": ariaLabel, className }: Props) {
  const clock = normalizeClock(value) ?? "00:00"
  const [h, m] = clock.split(":")
  const minutes = MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort()
  const hours = HOURS.includes(h) ? HOURS : [...HOURS, h]

  return (
    <div className={cn("flex items-center gap-1", className)} dir="ltr" aria-label={ariaLabel} role="group">
      <Clock className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <select className={selectClass} value={h} disabled={disabled} onChange={(e) => onChange(`${e.target.value}:${m}`)}>
        {hours.map((x) => (
          <option key={x} value={x} className="bg-background text-foreground">{localeDigits(x, locale)}</option>
        ))}
      </select>
      <span>:</span>
      <select className={selectClass} value={m} disabled={disabled} onChange={(e) => onChange(`${h}:${e.target.value}`)}>
        {minutes.map((x) => (
          <option key={x} value={x} className="bg-background text-foreground">{localeDigits(x, locale)}</option>
        ))}
      </select>
    </div>
  )
}
