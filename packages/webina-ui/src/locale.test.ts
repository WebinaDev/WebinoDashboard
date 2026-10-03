import assert from "node:assert/strict"
import test from "node:test"

import {
  emptyMark,
  formatChartDateLabel,
  formatDate,
  formatMonthYear,
  formatNumber,
  toJalali,
} from "./locale.ts"

test("Nowruz 2026 is 1 Farvardin 1405", () => {
  assert.deepEqual(toJalali(2026, 3, 21), { jy: 1405, jm: 1, jd: 1 })
})

test("3 Oct 2026 is 11 Mehr 1405", () => {
  assert.deepEqual(toJalali(2026, 10, 3), { jy: 1405, jm: 7, jd: 11 })
})

test("fa dates use Jalali and Persian digits", () => {
  const text = formatDate("2026-10-03", "fa")
  assert.match(text, /مهر/)
  assert.match(text, /۱۴۰۵/)
  assert.doesNotMatch(text, /[0-9]/)
  assert.equal(text.includes("—"), false)
})

test("fa date-time keeps Tehran wall clock", () => {
  const text = formatDate("2026-10-03T18:05:00+03:30", "fa", { includeTime: true })
  assert.match(text, /۱۸:۰۵/)
  assert.match(text, /مهر/)
})

test("chart axis labels are Jalali with Persian digits", () => {
  assert.equal(formatChartDateLabel("2026-10-03", "fa"), "۱۱ مهر")
  assert.equal(formatChartDateLabel("2026-10", "fa"), "مهر ۱۴۰۵")
  assert.doesNotMatch(formatChartDateLabel("2026-W40", "fa"), /[0-9]/)
})

test("fa numbers use Persian digits", () => {
  const text = formatNumber(1234567, "fa")
  assert.match(text, /[۰-۹]/)
  assert.doesNotMatch(text, /[0-9]/)
  assert.equal(formatNumber(12.5, "fa", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).includes("."), false)
})

test("en stays Gregorian with Latin digits", () => {
  assert.match(formatDate("2026-10-03", "en"), /2026|Oct/)
  assert.match(formatNumber(1200, "en"), /1,200/)
  assert.equal(emptyMark("en"), "—")
  assert.equal(emptyMark("fa"), "-")
})

test("month label from a timestamp is Jalali", () => {
  const text = formatMonthYear(Date.parse("2026-10-03T12:00:00+03:30"), "fa")
  assert.equal(text, "مهر ۱۴۰۵")
})
