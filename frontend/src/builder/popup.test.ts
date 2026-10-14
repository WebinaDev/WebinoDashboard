import assert from "node:assert/strict"
import { test } from "node:test"

import { readRules, rulesAllow } from "./popup-rules"

const state = { lastShown: null, sessionShown: false, pageViews: 3, sessions: 1, referrer: "https://instagram.com/x", isMobile: false, now: Date.now() }

test("frequency, page views, referrer and device rules", () => {
  const rules = readRules({ frequency: "days", frequencyDays: 2, minPageViews: 2, referrer: "instagram" })
  assert.equal(rulesAllow(rules, state), true)
  assert.equal(rulesAllow(rules, { ...state, lastShown: state.now - 86_400_000 }), false)
  assert.equal(rulesAllow(rules, { ...state, lastShown: state.now - 3 * 86_400_000 }), true)
  assert.equal(rulesAllow(rules, { ...state, pageViews: 1 }), false)
  assert.equal(rulesAllow(rules, { ...state, referrer: "google" }), false)
  assert.equal(rulesAllow(readRules({ device: "mobile" }), state), false)
  assert.equal(rulesAllow(readRules({ frequency: "session" }), { ...state, sessionShown: true }), false)
  assert.equal(rulesAllow(readRules({ frequency: "once" }), { ...state, lastShown: 1 }), false)
})
