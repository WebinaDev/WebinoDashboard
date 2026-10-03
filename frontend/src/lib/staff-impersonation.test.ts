import assert from "node:assert/strict"
import test from "node:test"

import {
  isStaffImpersonationJwt,
  safeNavigationUrl,
  staffImpersonationRedirect,
} from "./staff-impersonation.ts"

const TOKEN = "aaa.bbb.ccc"

test("accepts a compact jwt and rejects junk", () => {
  assert.equal(isStaffImpersonationJwt(TOKEN), true)
  assert.equal(isStaffImpersonationJwt("not a token"), false)
  assert.equal(isStaffImpersonationJwt("javascript:alert(1)"), false)
  assert.equal(isStaffImpersonationJwt(""), false)
  assert.equal(isStaffImpersonationJwt("a".repeat(24577)), false)
})

test("sends a query token to the login page without dropping it", () => {
  assert.deepEqual(
    staffImpersonationRedirect({
      pathname: "/dashboard",
      queryToken: TOKEN,
      hasImpersonationCookie: false,
    }),
    { action: "redirect-query", token: TOKEN },
  )
  assert.deepEqual(
    staffImpersonationRedirect({
      pathname: "/login",
      queryToken: TOKEN,
      hasImpersonationCookie: false,
    }),
    { action: "stay" },
  )
})

test("cookie exchange stays off the query string", () => {
  assert.deepEqual(
    staffImpersonationRedirect({
      pathname: "/dashboard/orders",
      queryToken: null,
      hasImpersonationCookie: true,
    }),
    { action: "redirect-cookie" },
  )
  assert.deepEqual(
    staffImpersonationRedirect({
      pathname: "/login",
      queryToken: "nope",
      hasImpersonationCookie: true,
    }),
    { action: "stay" },
  )
})

test("ignores a normal visit", () => {
  assert.deepEqual(
    staffImpersonationRedirect({
      pathname: "/login",
      queryToken: null,
      hasImpersonationCookie: false,
    }),
    { action: "none" },
  )
})

test("navigation urls are http(s) without credentials", () => {
  assert.equal(
    safeNavigationUrl("https://erp.example.com/admin/sites"),
    "https://erp.example.com/admin/sites",
  )
  assert.equal(safeNavigationUrl("http://erp.internal/sites"), "http://erp.internal/sites")
  assert.equal(safeNavigationUrl("javascript:alert(1)"), null)
  assert.equal(safeNavigationUrl("https://user:pass@erp.example.com/"), null)
  assert.equal(safeNavigationUrl("/dashboard"), null)
})
