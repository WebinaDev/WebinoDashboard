import assert from "node:assert/strict"
import { test } from "node:test"

import { formatAmountDigits } from "./format-amount.ts"

test("formats prices in the active language", () => {
  assert.equal(formatAmountDigits(12345.1, ",", "fa"), "۱۲٬۳۴۵٫۱")
  assert.equal(formatAmountDigits(12345.1, ",", "en"), "12,345.1")
  assert.equal(formatAmountDigits(12345, " ", "en"), "12 345")
})
