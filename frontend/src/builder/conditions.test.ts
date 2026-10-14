import assert from "node:assert/strict"
import { test } from "node:test"

import { evaluateConditions } from "./conditions"

const base = { loggedIn: true, cartCount: 2, now: new Date(2026, 9, 14, 10, 0), search: new URLSearchParams("utm_source=ig") }

test("all / any / hide mode and pending session", () => {
  assert.equal(evaluateConditions({ login: "in", cart: "not_empty" }, base), true)
  assert.equal(evaluateConditions({ login: "out", hours: "9-18" }, base), false)
  assert.equal(evaluateConditions({ match: "any", login: "out", hours: "9-18" }, base), true)
  assert.equal(evaluateConditions({ mode: "hide", param: "utm_source=ig" }, base), false)
  assert.equal(evaluateConditions({ login: "in" }, { ...base, loggedIn: null }), null)
  assert.equal(evaluateConditions({ hours: "22-6" }, base), false)
  assert.equal(evaluateConditions({ days: [base.now.getDay()], from: "2026-10-01T00:00", to: "2026-10-20T00:00" }, base), true)
})
