import assert from "node:assert/strict"
import test from "node:test"

import { readCookieValue } from "./auth-cookie.ts"

test("reads a sanctum token that contains a pipe", () => {
  const header = "NEXT_LOCALE=fa; webino_auth_token=4%7Cabc.def_token; other=1"
  assert.equal(readCookieValue(header, "webino_auth_token"), "4|abc.def_token")
})

test("does not truncate on extra equals in the value", () => {
  assert.equal(readCookieValue("webino_auth_token=abc=def", "webino_auth_token"), "abc=def")
})

test("returns null when the cookie is missing", () => {
  assert.equal(readCookieValue("NEXT_LOCALE=fa", "webino_auth_token"), null)
  assert.equal(readCookieValue(null, "webino_auth_token"), null)
})
