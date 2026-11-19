import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { compareMark, decorateCompareHtml } from "./compare-table.ts"

describe("compare-table", () => {
  test("marks yes/no phrases", () => {
    assert.equal(compareMark("دارد"), "yes")
    assert.equal(compareMark("ندارد"), "no")
    assert.equal(compareMark("بله"), "yes")
    assert.equal(compareMark(" محدود "), "")
  })

  test("decorates cells and wraps the table for horizontal scroll", () => {
    const html = decorateCompareHtml(`<div class="ak-compare"><table><tr><td>حساب</td><td>ندارد</td><td>دارد</td></tr></table></div>`)
    assert.match(html, /wb-compare-wrap/)
    assert.match(html, /wb-compare-table/)
    assert.match(html, /wb-cmp-no/)
    assert.match(html, /wb-cmp-yes/)
    assert.match(html, /wb-cmp-icon/)
    assert.doesNotMatch(html, /wb-compare-wrap"><div class="wb-compare-wrap"/)
  })
})
