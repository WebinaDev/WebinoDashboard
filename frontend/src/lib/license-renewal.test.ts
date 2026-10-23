import assert from "node:assert/strict"
import { test } from "node:test"

import {
  faDate,
  faToman,
  isRestored,
  parseRenewal,
  readPaymentReturn,
  renewalPath,
  renewTarget,
  safeHttps,
  shouldShowBanner,
  stripPaymentParams,
} from "./license-renewal.ts"

const sample = {
  domain: "example.ir",
  product: "webino",
  plan: { code: "pro", name: "حرفه‌ای" },
  status: "suspended",
  expires_at: "2026-11-01T23:59:59+03:30",
  days_left: 0,
  site_status: "suspended",
  renewable: true,
  banner: { show: true, level: "danger", message: "x" },
  currency: "IRR",
  options: [{ id: 12, months: 12, label: "۱۲ ماهه", price_irr: 60000000, discount_percent: 10, final_irr: 54000000, final_toman: 5400000, new_expires_at: "2027-11-01T23:59:59+03:30", checkout_url: "https://erp/renew/34/pay/12" }],
  renew_url: "https://erp/renew/34",
  url_expires_at: "2026-10-30T23:20:00+03:30",
}

test("parses raw and enveloped bodies", () => {
  assert.equal(parseRenewal({ data: sample })?.plan?.name, "حرفه‌ای")
  assert.equal(parseRenewal({ success: true, data: sample })?.options.length, 1)
  assert.equal(parseRenewal({ message: "nope" }), null)
  assert.deepEqual(parseRenewal({ data: { ...sample, options: undefined } })?.options, [])
})

test("restored only when not expired/suspended", () => {
  const r = parseRenewal({ data: sample })
  assert.equal(isRestored(r), false)
  assert.equal(isRestored({ ...r!, status: "expired" }), false)
  assert.equal(isRestored({ ...r!, status: "active" }), true)
  assert.equal(isRestored({ ...r!, status: "expiring" }), true)
  assert.equal(isRestored(null), false)
})

test("payment return params", () => {
  assert.deepEqual(readPaymentReturn("?payment_id=u1&status=settled&gateway=zp&sig=a"), { paymentId: "u1", status: "settled" })
  assert.equal(readPaymentReturn("?status=settled"), null)
  assert.equal(stripPaymentParams("https://a.ir/?payment_id=1&status=settled&gateway=z&amount=1&sig=s&x=1"), "https://a.ir/?x=1")
})

test("renew target + banner + url safety", () => {
  const r = parseRenewal({ data: sample })
  assert.equal(renewTarget(r, "https://fallback"), "https://erp/renew/34")
  assert.equal(renewTarget(null, "https://fallback"), "https://fallback")
  assert.equal(shouldShowBanner(r), true)
  assert.equal(shouldShowBanner({ ...r!, banner: { show: false, level: "warning", message: "" } }), false)
  assert.equal(safeHttps("javascript:alert(1)"), null)
  assert.equal(safeHttps("http://x"), null)
  assert.equal(safeHttps("https://x/"), "https://x/")
  assert.equal(renewalPath("https://a.ir/"), "/api/v1/public/license-renewal?return_url=https%3A%2F%2Fa.ir%2F")
})

test("jalali + toman formatting", () => {
  assert.match(faDate("2026-11-01T23:59:59+03:30") ?? "", /۱۴۰۵/)
  assert.equal(faDate("bad"), null)
  assert.equal(faToman(5400000), "۵٬۴۰۰٬۰۰۰ تومان")
})
