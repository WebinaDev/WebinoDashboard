import assert from "node:assert/strict"
import { test } from "node:test"

import { dirForLang, pageSlugFromPath } from "./lang.ts"

test("direction by language", () => {
  assert.equal(dirForLang("fa"), "rtl")
  assert.equal(dirForLang("ar-IQ"), "rtl")
  assert.equal(dirForLang("en"), "ltr")
  assert.equal(dirForLang("tr"), "ltr")
  assert.equal(dirForLang(null), "rtl")
  assert.equal(dirForLang(undefined, "ltr"), "ltr")
})

test("page slug from path", () => {
  assert.equal(pageSlugFromPath("/pages/about-us?x=1"), "about-us")
  assert.equal(pageSlugFromPath("/pages/%D8%AF%D8%B1%D8%A8%D8%A7%D8%B1%D9%87"), "درباره")
  assert.equal(pageSlugFromPath("/pages/a/b"), null)
  assert.equal(pageSlugFromPath("/shop"), null)
  assert.equal(pageSlugFromPath(null), null)
})
