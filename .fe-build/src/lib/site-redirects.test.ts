import { test } from "node:test"
import assert from "node:assert/strict"
import { parseSiteRedirects, siteRedirectFor } from "./site-redirects.ts"

test("default alikhabari /about → /about-poet (served by the Dashboard frontend)", () => {
  const rules = parseSiteRedirects(undefined)
  assert.equal(siteRedirectFor("alikhabari.ir", "/about", rules), "/about-poet")
  assert.equal(siteRedirectFor("www.alikhabari.ir", "/about/", rules), "/about-poet")
  assert.equal(siteRedirectFor("parisma.ir", "/about", rules), null)
})

test("env format host:/from=/to", () => {
  assert.equal(siteRedirectFor("x.ir", "/a", parseSiteRedirects("/a=/b")), "/b")
})
