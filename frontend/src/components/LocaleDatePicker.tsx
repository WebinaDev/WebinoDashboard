"use client"

/**
 * LocaleDatePicker — Jalali when `locale` starts with `fa`, shadcn Calendar otherwise.
 * **Always stores ISO Gregorian date strings** (`YYYY-MM-DD`) via `onChange`.
 */
import dynamic from "next/dynamic"
import { CalendarIcon } from "lucide-react"
import { useState } from "react"
import persian from "react-date-object/calendars/persian"
import gregorian from "react-date-object/calendars/gregorian"
import persianFa from "react-date-object/locales/persian_fa"
import DateObject from "react-date-object"
import type { ChangedValue } from "react-multi-date-picker"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDate } from "@/lib/locale"
import { cn } from "@/lib/utils"

const DatePicker = dynamic(() => import("react-multi-date-picker"), {
  ssr: false,
  loading: () => (
    <div className="h-9 w-full max-w-xs animate-pulse rounded-md bg-muted" />
  ),
})

type Props = {
  locale: string
  /** ISO date `YYYY-MM-DD`, or empty string / null when unset */
  value: string | null
  /** Receives ISO Gregorian `YYYY-MM-DD`, or `null` when cleared */
  onChange: (value: string | null) => void
  "aria-label"?: string
}

export function LocaleDatePicker({
  locale,
  value,
  onChange,
  "aria-label": ariaLabel,
}: Props) {
  const isFa = locale.startsWith("fa")

  if (isFa) {
    return (
      <JalaliLocaleDatePicker
        value={value}
        onChange={onChange}
        aria-label={ariaLabel}
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
  "aria-label": ariaLabel,
}: Omit<Props, "locale">) {
  const dob =
    value != null && value !== ""
      ? new DateObject({
          date: value,
          calendar: persian,
          locale: persianFa,
        })
      : undefined

  return (
    <div className="max-w-xs">
      <DatePicker
        calendar={persian}
        locale={persianFa}
        value={dob}
        onChange={(d: ChangedValue) => {
          if (d == null) {
            onChange(null)
            return
          }
          const g = d.convert(gregorian)
          onChange(g.format("YYYY-MM-DD"))
        }}
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
          {value ? formatDate(value, "en") : t("datePicker_placeholder")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) {
              onChange(d.toISOString().slice(0, 10))
              setOpen(false)
            }
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
