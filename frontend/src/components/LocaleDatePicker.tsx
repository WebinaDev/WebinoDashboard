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
  /** ISO `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` when `withTime` */
  value: string | null
  /** Gregorian ISO. Date-only is `YYYY-MM-DD`; with time it is `YYYY-MM-DDTHH:mm`. */
  onChange: (value: string | null) => void
  withTime?: boolean
  "aria-label"?: string
}

export function LocaleDatePicker({
  locale,
  value,
  onChange,
  withTime = false,
  "aria-label": ariaLabel,
}: Props) {
  if (isRtlLocale(locale)) {
    return (
      <JalaliLocaleDatePicker
        value={value}
        onChange={onChange}
        withTime={withTime}
        aria-label={ariaLabel}
      />
    )
  }

  return (
    <GregorianLocaleDatePicker
      value={value}
      onChange={onChange}
      withTime={withTime}
      aria-label={ariaLabel}
    />
  )
}

function jalaliValue(value: string | null, withTime: boolean) {
  if (value == null || value === "") return undefined
  const [datePart, timePart] = value.split(/[T ]/)
  const obj = new DateObject({
    date: datePart,
    format: "YYYY-MM-DD",
    calendar: gregorian,
  })
  if (withTime && timePart) {
    const [hh, mm] = timePart.split(":")
    obj.set({ hour: Number(hh) || 0, minute: Number(mm) || 0 })
  }
  return obj.convert(persian, persianFa)
}

function JalaliLocaleDatePicker({
  value,
  onChange,
  withTime = false,
  "aria-label": ariaLabel,
}: Omit<Props, "locale">) {
  return (
    <div className="max-w-xs" dir={htmlDir("fa")}>
      <DatePicker
        calendar={persian}
        locale={persianFa}
        value={jalaliValue(value, withTime)}
        format={withTime ? "YYYY/MM/DD HH:mm" : "YYYY/MM/DD"}
        plugins={withTime ? [<TimePicker key="time" hideSeconds position="bottom" />] : []}
        onChange={(d: ChangedValue) => {
          if (d == null || Array.isArray(d)) {
            onChange(null)
            return
          }
          const g = d.convert(gregorian)
          const date = g.format("YYYY-MM-DD")
          onChange(withTime ? `${date}T${g.format("HH:mm")}` : date)
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
  withTime = false,
  "aria-label": ariaLabel,
}: Omit<Props, "locale">) {
  const t = useTranslations("common")
  const [open, setOpen] = useState(false)
  if (withTime) {
    return (
      <Input
        type="datetime-local"
        aria-label={ariaLabel}
        className="max-w-xs"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      />
    )
  }
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
