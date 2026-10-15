/** Cafe table booking helpers for the `cafe-table-booking` builder widget (pure; tested). */

export type CafeHourDay = { day: string; open?: string | null; close?: string | null; closed?: boolean }
export type CafeHours = { timezone?: string; days?: CafeHourDay[]; closed_dates?: string[] }
export type SlotStatus = "ok" | "empty" | "past" | "closed_date" | "closed_day" | "outside_hours"

/** JS getDay() index → cafe hours day key. */
export const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const

export const DAY_LABELS_FA: Record<string, string> = {
  saturday: "شنبه",
  sunday: "یکشنبه",
  monday: "دوشنبه",
  tuesday: "سه‌شنبه",
  wednesday: "چهارشنبه",
  thursday: "پنجشنبه",
  friday: "جمعه",
}

function minutes(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "")
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * Check a local `YYYY-MM-DDTHH:mm` slot against the cafe opening hours.
 * Days without configured hours are treated as open (the cafe never set them); close before open means past midnight.
 */
export function checkBookingSlot(hours: CafeHours | null | undefined, local: string, now: Date = new Date()): SlotStatus {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local ?? "")
  if (!m) return "empty"
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as [number, number, number, number, number, number]
  const date = new Date(y, mo - 1, d, h, mi)
  if (date.getTime() <= now.getTime()) return "past"
  if ((hours?.closed_dates ?? []).some((c) => c.slice(0, 10) === local.slice(0, 10))) return "closed_date"
  const day = (hours?.days ?? []).find((row) => row.day === WEEKDAY_KEYS[date.getDay()])
  if (!day) return "ok"
  if (day.closed) return "closed_day"
  const open = minutes(day.open)
  const close = minutes(day.close)
  if (open == null || close == null) return "ok"
  const at = h * 60 + mi
  const inside = close > open ? at >= open && at < close : at >= open || at < close
  return inside ? "ok" : "outside_hours"
}

/** Local slot → ISO with the cafe's offset (Tehran has no DST, +03:30). */
export function slotToIso(local: string, timezone = "Asia/Tehran"): string {
  const base = local.slice(0, 16)
  return timezone === "Asia/Tehran" ? `${base}:00+03:30` : `${base}:00`
}

export const SLOT_MESSAGES: Record<Exclude<SlotStatus, "ok">, string> = {
  empty: "تاریخ و ساعت را انتخاب کنید.",
  past: "زمان انتخابی گذشته است.",
  closed_date: "کافه در این تاریخ تعطیل است.",
  closed_day: "کافه در این روز هفته تعطیل است.",
  outside_hours: "این ساعت خارج از ساعت کاری کافه است.",
}
