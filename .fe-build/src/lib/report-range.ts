import DateObject from "react-date-object"
import persian from "react-date-object/calendars/persian"

export const REPORT_RANGE_PRESETS = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "custom",
] as const

export type ReportRangePreset = (typeof REPORT_RANGE_PRESETS)[number]

export type ReportRange = { from: Date; to: Date }

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** 6 = Saturday (fa), 1 = Monday (other locales); JS getDay() numbering. */
export function weekStartDay(locale: string): number {
  return locale === "fa" ? 6 : 1
}

function startOfWeek(d: Date, locale: string): Date {
  const diff = (d.getDay() - weekStartDay(locale) + 7) % 7
  return startOfDay(addDays(d, -diff))
}

function monthBounds(d: Date, locale: string): ReportRange {
  if (locale === "fa") {
    const first = new DateObject({ date: d, calendar: persian }).toFirstOfMonth().toDate()
    const last = new DateObject({ date: d, calendar: persian }).toLastOfMonth().toDate()
    return { from: startOfDay(first), to: endOfDay(last) }
  }
  return {
    from: new Date(d.getFullYear(), d.getMonth(), 1),
    to: endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  }
}

function yearStart(d: Date, locale: string): Date {
  if (locale === "fa") {
    return startOfDay(new DateObject({ date: d, calendar: persian }).toFirstOfYear().toDate())
  }
  return new Date(d.getFullYear(), 0, 1)
}

/**
 * Resolve a preset to a local-time `{from, to}` range (from = 00:00, to = 23:59:59.999).
 * Jalali months/years and Saturday week start for `fa`; Gregorian + Monday otherwise.
 * "This …" presets end today. `custom` returns `custom` when given, else falls back to thisMonth.
 */
export function presetToRange(
  preset: ReportRangePreset,
  locale: string,
  custom?: ReportRange,
  now: Date = new Date(),
): ReportRange {
  const today = startOfDay(now)
  const todayEnd = endOfDay(now)
  switch (preset) {
    case "today":
      return { from: today, to: todayEnd }
    case "yesterday": {
      const y = addDays(today, -1)
      return { from: y, to: endOfDay(y) }
    }
    case "last7":
      return { from: addDays(today, -6), to: todayEnd }
    case "last30":
      return { from: addDays(today, -29), to: todayEnd }
    case "thisWeek":
      return { from: startOfWeek(today, locale), to: todayEnd }
    case "lastWeek": {
      const start = addDays(startOfWeek(today, locale), -7)
      return { from: start, to: endOfDay(addDays(start, 6)) }
    }
    case "thisMonth":
      return { from: monthBounds(today, locale).from, to: todayEnd }
    case "lastMonth": {
      const prev = addDays(monthBounds(today, locale).from, -1)
      return monthBounds(prev, locale)
    }
    case "thisYear":
      return { from: yearStart(today, locale), to: todayEnd }
    case "custom":
      if (custom) return { from: startOfDay(custom.from), to: endOfDay(custom.to) }
      return { from: monthBounds(today, locale).from, to: todayEnd }
  }
}

/** Local calendar date as `YYYY-MM-DD` (Gregorian). */
export function toYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Parse `YYYY-MM-DD` as a local date (00:00). Returns null when invalid. */
export function fromYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

export function toUnixSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000)
}
