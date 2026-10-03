"use client"

/**
 * LocaleDatePicker — Jalali (RTL) when locale is `fa`, official shadcn Calendar otherwise.
 * **Always stores ISO Gregorian date strings** (`YYYY-MM-DD`) via `onChange`.
 */
import dynamic from "next/dynamic"
import { CalendarIcon } from "lucide-react"
import { useState } from "react"
import persian from "react-date-object/calendars/persian"
import gregorian from "react-date-object/calendars/gregorian"
import gregorianEn from "react-date-object/locales/gregorian_en"
import persianFa from "react-date-object/locales/persian_fa"
import DateObject from "react-date-object"
import type { ChangedValue } from "react-multi-date-picker"
import { useTranslations } from "next-intl"

import TimePicker from "react-multi-date-picker/plugins/time_picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { htmlDir, isRtlLocale } from "@/lib/locale"
import { formatDate } from "@/lib/locale/format-date"
import { cn } from "@/lib/utils"

const DatePicker = dynamic(() => import("react-multi-date-picker"), {
  ssr: false,
  loading: () => (
    <div className="h-9 w-full max-w-xs animate-pulse rounded-md bg-muted" />
  ),
})

type Props = {
  locale: string
  /** ISO date `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` when `withTime` is set. Empty string / null when unset. */
  value: string | null
  /** Receives an ISO Gregorian value, or `null` when cleared. */
  onChange: (value: string | null) => void
  /** Include a time of day. Stored value stays Gregorian `YYYY-MM-DDTHH:mm`. */
  withTime?: boolean
  id?: string
  "aria-label"?: string
}

function jalaliSeed(value: string | null, withTime: boolean): DateObject | undefined {
  if (value == null || value === "") return undefined
  const raw = value.trim().replace("T", " ")
  const hasTime = withTime && raw.length > 10
  const format = hasTime ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD"
  const date = raw.slice(0, hasTime ? 16 : 10)
  const parsed = new DateObject({ date, format, calendar: gregorian })
  if (!parsed.isValid) return undefined
  return parsed.convert(persian, persianFa)
}

export function LocaleDatePicker({
  locale,
  value,
  onChange,
  withTime = false,
  id,
  "aria-label": ariaLabel,
}: Props) {
  if (isRtlLocale(locale)) {
    return (
      <JalaliLocaleDatePicker
        value={value}
        onChange={onChange}
        withTime={withTime}
        id={id}
        aria-label={ariaLabel}
      />
    )
  }

  if (withTime) {
    return (
      <Input
        id={id}
        type="datetime-local"
        aria-label={ariaLabel}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    )
  }

  return (
    <GregorianLocaleDatePicker
      value={value}
      onChange={onChange}
      aria-label={ariaLabel}
    />
  )
}

function JalaliLocaleDatePicker({
  value,
  onChange,
  withTime = false,
  id,
  "aria-label": ariaLabel,
}: Omit<Props, "locale">) {
  const dob = jalaliSeed(value, withTime)

  return (
    <div className="max-w-xs" dir={htmlDir("fa")}>
      <DatePicker
        id={id}
        calendar={persian}
        locale={persianFa}
        value={dob}
        format={withTime ? "YYYY/MM/DD HH:mm" : "YYYY/MM/DD"}
        plugins={withTime ? [<TimePicker key="time" position="bottom" hideSeconds />] : []}
        onChange={(d: ChangedValue) => {
          const picked = Array.isArray(d) ? d[0] : d
          if (picked == null) {
            onChange(null)
            return
          }
          const g = picked.convert(gregorian).setLocale(gregorianEn)
          onChange(withTime ? g.format("YYYY-MM-DDTHH:mm") : g.format("YYYY-MM-DD"))
        }}
        calendarPosition="bottom-end"
        inputClass="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        containerClassName="w-full"
        aria-label={ariaLabel}
      />
    </div>
  )
}

function GregorianLocaleDatePicker({
  value,
  onChange,
  "aria-label": ariaLabel,
}: Omit<Props, "locale">) {
  const t = useTranslations("common")
  const [open, setOpen] = useState(false)
  const date = value ? new Date(value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={ariaLabel}
          className={cn(
            "w-full max-w-xs justify-start text-start font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="me-2 size-4" />
          {value ? formatDate(value, { locale: "en" }) : t("datePicker_placeholder")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" dir={htmlDir("en")}>
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) {
              const pad = (n: number) => String(n).padStart(2, "0")
              onChange(
                `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
              )
              setOpen(false)
            }
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
