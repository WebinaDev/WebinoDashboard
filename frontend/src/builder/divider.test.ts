import assert from "node:assert/strict"
import { test } from "node:test"
import { dividerStyle } from "./divider"

test("old divider documents retain their original inline appearance", () => {
  assert.deepEqual(dividerStyle({}), { borderColor: "var(--color-border)" })
  assert.deepEqual(dividerStyle({ color: "#123456" }), { borderColor: "#123456" })
})

test("divider design controls apply bounded widths, styles, and logical alignment", () => {
  assert.deepEqual(dividerStyle({ color: "red", dividerThickness: 3, dividerWidth: 45, dividerLineStyle: "dashed", dividerAlignment: "center" }), {
    borderColor: "red", borderTopWidth: 3, width: "45%", borderTopStyle: "dashed", marginInlineStart: "auto", marginInlineEnd: "auto",
  })
  assert.deepEqual(dividerStyle({ dividerThickness: 900, dividerWidth: -2, dividerLineStyle: "invalid", dividerAlignment: "end" }), {
    borderColor: "var(--color-border)", borderTopWidth: 24, width: "1%", marginInlineStart: "auto", marginInlineEnd: 0,
  })
  assert.deepEqual(dividerStyle({ dividerThickness: Number.NaN, dividerWidth: Number.POSITIVE_INFINITY }), { borderColor: "var(--color-border)" })
})
