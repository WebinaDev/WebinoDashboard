import assert from "node:assert/strict"
import { test } from "node:test"

import { dirForLang, pageSlugFromPath, previewTokenFromPath, uiLocaleForLang } from "./lang.ts"

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

test("ui locale for page language", () => {
  assert.equal(uiLocaleForLang("en"), "en")
  assert.equal(uiLocaleForLang("fa"), "fa")
  assert.equal(uiLocaleForLang("ar"), "fa")
  assert.equal(uiLocaleForLang("ku"), "fa")
  assert.equal(uiLocaleForLang("tr"), "en")
  assert.equal(uiLocaleForLang("en-GB"), "en")
})

test("preview token from path", () => {
  const tok = `12.${"a".repeat(48)}`
  assert.equal(previewTokenFromPath(`/preview/${tok}`), tok)
  assert.equal(previewTokenFromPath("/preview/bad"), null)
})
