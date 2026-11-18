/* Jalali ⇄ Gregorian (jalaali-js algorithm), mirrored by backend App\Services\Resume\Jalali. */
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
const div = (a: number, b: number) => Math.trunc(a / b)
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b

function jalCal(jy: number) {
  const gy = jy + 621
  let leapJ = -14
  let jp = BREAKS[0]
  let jump = 0
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }
  let n = jy - jp
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ++
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4
  return { leap, gy, march }
}
function g2d(gy: number, gm: number, gd: number) {
  const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
}
function d2g(jdn: number): [number, number, number] {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(i, 153), 5) + 1
  const gm = mod(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return [gy, gm, gd]
}
export function toGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  const r = jalCal(jy)
  return d2g(g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1)
}
export function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const jdn = g2d(gy, gm, gd)
  let jy = d2g(jdn)[0] - 621
  const r = jalCal(jy)
  let k = jdn - g2d(gy, 3, r.march)
  if (k >= 0) {
    if (k <= 185) return [jy, 1 + div(k, 31), mod(k, 31) + 1]
    k -= 186
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }
  return [jy, 7 + div(k, 30), mod(k, 30) + 1]
}
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return jalCal(jy).leap === 0 ? 30 : 29
}

export type Precision = "year" | "month" | "day"
export type ResumeDate = { g: string; j: string; precision: Precision }

const pad = (n: number) => String(n).padStart(2, "0")
export function fromJalali(y: number, m: number | null, d: number | null): ResumeDate {
  const precision: Precision = d ? "day" : m ? "month" : "year"
  if (precision === "year") return { j: String(y), g: String(y + 621), precision }
  const [gy, gm, gd] = toGregorian(y, m ?? 1, d ?? 1)
  return precision === "month"
    ? { j: `${y}-${pad(m!)}`, g: `${gy}-${pad(gm)}`, precision }
    : { j: `${y}-${pad(m!)}-${pad(d!)}`, g: `${gy}-${pad(gm)}-${pad(gd)}`, precision }
}
export function fromGregorian(y: number, m: number | null, d: number | null): ResumeDate {
  const precision: Precision = d ? "day" : m ? "month" : "year"
  if (precision === "year") return { g: String(y), j: String(y - 621), precision }
  const [jy, jm, jd] = toJalali(y, m ?? 1, d ?? 1)
  return precision === "month"
    ? { g: `${y}-${pad(m!)}`, j: `${jy}-${pad(jm)}`, precision }
    : { g: `${y}-${pad(m!)}-${pad(d!)}`, j: `${jy}-${pad(jm)}-${pad(jd)}`, precision }
}

export const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]
export const GREGORIAN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export const faDigits = (s: string | number) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])

/** fa → Jalali with Persian digits/month names; en → Gregorian. */
export function formatResumeDate(d: ResumeDate | null | undefined, lang: string, calendar: "auto" | "jalali" | "gregorian" = "auto"): string {
  if (!d) return ""
  const useJ = calendar === "jalali" || (calendar === "auto" && lang === "fa")
  const raw = useJ ? d.j : d.g
  if (!raw) return ""
  const [y, m] = raw.split("-").map(Number)
  const months = useJ ? JALALI_MONTHS : GREGORIAN_MONTHS
  const text = m && d.precision !== "year" ? `${months[m - 1]} ${y}` : String(y)
  return lang === "fa" ? faDigits(text) : text
}

export function durationLabel(months: number | null | undefined, lang: string): string {
  if (!months) return ""
  const y = Math.floor(months / 12)
  const m = months % 12
  if (lang === "fa") return faDigits([y ? `${y} سال` : "", m ? `${m} ماه` : ""].filter(Boolean).join(" و "))
  return [y ? `${y} yr${y > 1 ? "s" : ""}` : "", m ? `${m} mo` : ""].filter(Boolean).join(" ")
}
