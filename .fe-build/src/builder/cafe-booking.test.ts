import assert from "node:assert/strict"
import test from "node:test"

import { checkBookingSlot, slotToIso } from "./cafe-booking.ts"

const now = new Date(2026, 0, 1, 8, 0)
const hours = {
  days: [
    { day: "friday", closed: true },
    { day: "saturday", open: "09:00", close: "23:00" },
    { day: "sunday", open: "18:00", close: "02:00" },
  ],
  closed_dates: ["2026-01-05"],
}

test("booking slots respect opening hours", () => {
  assert.equal(checkBookingSlot(hours, "", now), "empty")
  assert.equal(checkBookingSlot(hours, "2025-12-31T10:00", now), "past")
  assert.equal(checkBookingSlot(hours, "2026-01-02T12:00", now), "closed_day") // Friday
  assert.equal(checkBookingSlot(hours, "2026-01-03T10:00", now), "ok") // Saturday
  assert.equal(checkBookingSlot(hours, "2026-01-03T23:30", now), "outside_hours")
  assert.equal(checkBookingSlot(hours, "2026-01-04T01:00", now), "ok") // Sunday, past midnight window
  assert.equal(checkBookingSlot(hours, "2026-01-05T12:00", now), "closed_date")
  assert.equal(checkBookingSlot(null, "2026-01-06T12:00", now), "ok")
  assert.equal(slotToIso("2026-01-03T10:00"), "2026-01-03T10:00:00+03:30")
})
