import assert from "node:assert/strict"
import { test } from "node:test"

import { manualPoemRows, poemCarouselQuery, verseLines } from "./poem-carousel.ts"

test("poemCarouselQuery defaults to short poems with full text", () => {
  assert.equal(poemCarouselQuery({}), "per_page=8&with_text=1&flag=is_short")
  assert.equal(poemCarouselQuery({ filter: "short", count: 4, sort: "popular" }), "per_page=4&with_text=1&flag=is_short&sort=popular")
  assert.equal(poemCarouselQuery({ filter: "style", style: "دوبیتی,رباعی" }), "per_page=8&with_text=1&style=%D8%AF%D9%88%D8%A8%DB%8C%D8%AA%DB%8C%2C%D8%B1%D8%A8%D8%A7%D8%B9%DB%8C")
  assert.equal(poemCarouselQuery({ filter: "all", count: 12 }), "per_page=12&with_text=1")
})

test("verseLines keeps every misra and does not truncate", () => {
  const lines = ["یاس بودی از غبار طعنه ها پرپر شدی", "درهجوم شعله ها یک دشت خاکستر شدی", "پای پیمان ولایت جانفدا و سرفراز", "با وجود زخم ها همسنگر حیدر شدی"]
  assert.deepEqual(verseLines({ lines }), lines)
  assert.deepEqual(verseLines({ stanzas: [{ lines: lines.slice(0, 2) }, { lines: lines.slice(2) }] }), lines)
  assert.deepEqual(manualPoemRows("جانفدا|یاس بودی\\nدرهجوم شعله ها|/poem?poem=جانفدا|دوبیتی")[0].lines, ["یاس بودی", "درهجوم شعله ها"])
})
