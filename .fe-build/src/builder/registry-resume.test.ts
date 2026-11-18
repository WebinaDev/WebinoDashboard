import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { fromJalali, formatResumeDate, toGregorian, toJalali } from "../../modules/resume/lib/jalali.ts"
import { RESUME_SECTIONS, RESUME_THEMES } from "../../modules/resume/lib/schema.ts"
import { RESUME_WIDGET_TYPES, RESUME_WIDGETS } from "./registry-resume.ts"

describe("resume widgets", () => {
  it("every widget is resume.* with a variant and the common props", () => {
    for (const w of RESUME_WIDGETS) {
      assert.ok(w.type.startsWith("resume."))
      const node = w.create()
      for (const k of ["variant", "title", "subtitle", "limit", "order_by", "show_placeholder", "lang", "anchor_id", "full_width"]) assert.ok(k in node.props, `${w.type}.${k}`)
    }
  })
  it("every theme layout only uses registered widgets", () => {
    for (const t of Object.values(RESUME_THEMES)) for (const row of t.layout) assert.ok(RESUME_WIDGET_TYPES.includes(row.type), row.type)
  })
  it("schema has ~15 sections plus settings", () => {
    assert.ok(RESUME_SECTIONS.length >= 16)
  })
})

describe("jalali", () => {
  it("converts both ways", () => {
    assert.deepEqual(toJalali(2024, 3, 20), [1403, 1, 1])
    assert.deepEqual(toGregorian(1403, 1, 1), [2024, 3, 20])
    assert.deepEqual(fromJalali(1398, 7, null), { j: "1398-07", g: "2019-09", precision: "month" })
  })
  it("formats fa as Jalali and en as Gregorian", () => {
    const d = fromJalali(1398, 7, null)
    assert.equal(formatResumeDate(d, "fa"), "مهر ۱۳۹۸")
    assert.equal(formatResumeDate(d, "en"), "Sep 2019")
  })
})
