import assert from "node:assert/strict"
import test from "node:test"

import { inferThemeQuery } from "./context.ts"
import { fillDocumentTokens } from "./tokens.ts"

test("infer theme view from path", () => {
  assert.equal(inferThemeQuery("/shop").archive, "product")
  assert.equal(inferThemeQuery("/product/serum").singular, "product")
  assert.equal(inferThemeQuery("/blog/spring").singular, "post")
  assert.equal(inferThemeQuery("/blog").archive, "blog")
  assert.equal(inferThemeQuery("/pages/about").singular, "page")
  assert.equal(inferThemeQuery("/search").search, true)
  assert.equal(inferThemeQuery("/", "q=serum").search, true)
})

test("fill template tokens", () => {
  const filled = fillDocumentTokens({ text: "سلام {{name}}" }, { name: 'آرای"ش' })
  assert.equal(filled.text, 'سلام آرای"ش')
})
