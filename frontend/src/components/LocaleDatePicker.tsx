"use client"

import dynamic from "next/dynamic"
import persian from "react-date-object/calendars/persian"
import gregorian from "react-date-object/calendars/gregorian"
import persianFa from "react-date-object/locales/persian_fa"
import gregorianEn from "react-date-object/locales/gregorian_en"
import DateObject from "react-date-object"
import type { ChangedValue } from "react-multi-date-picker"

const DatePicker = dynamic(() => import("react-multi-date-picker"), {
  ssr: false,
  loading: () => (
    <div className="h-9 w-full max-w-xs animate-pulse rounded-md bg-muted" />
  ),
})

type Props = {
  locale: string
  value: Date | null
  onChange: (value: Date | null) => void
  "aria-label"?: string
}

/** Jalali picker when `locale` starts with `fa`, Gregorian otherwise (ARCHITECTURE). */
export function LocaleDatePicker({
  locale,
  value,
  onChange,
  "aria-label": ariaLabel,
}: Props) {
  const isFa = locale.startsWith("fa")
  const calendar = isFa ? persian : gregorian
  const loc = isFa ? persianFa : gregorianEn

  const dob =
    value != null
      ? new DateObject({
          date: value,
          calendar,
          locale: loc,
        })
      : undefined

  return (
    <div className="max-w-xs">
      <DatePicker
        calendar={calendar}
        locale={loc}
        value={dob}
        onChange={(d: ChangedValue) => {
          if (d == null) {
            onChange(null)
            return
          }
          onChange(d.toDate())
        }}
        inputClass="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        containerClassName="w-full"
        aria-label={ariaLabel}
      />
    </div>
  )
}
