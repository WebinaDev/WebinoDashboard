import assert from "node:assert/strict"
import { test } from "node:test"

import { linkAttrs, parseLinks, parseRows, rowsToLines } from "./props"

test("repeater rows round-trip the legacy line format", () => {
  const keys = ["label", "href"]
  const rows = parseRows("خانه|/\nفروشگاه|/shop", keys)
  assert.deepEqual(rows, [{ label: "خانه", href: "/" }, { label: "فروشگاه", href: "/shop" }])
  const lines = rowsToLines(rows, keys)
  assert.equal(lines, "خانه|/\nفروشگاه|/shop")
  assert.deepEqual(parseLinks(lines, []), rows)
  assert.equal(rowsToLines([{ label: "a|b", href: "/x" }], keys), "a/b|/x")
})

test("link attrs for new tab / nofollow", () => {
  assert.deepEqual(linkAttrs({ href: "/" }), {})
  assert.deepEqual(linkAttrs({ hrefNewTab: true }), { target: "_blank", rel: "noopener noreferrer" })
  assert.deepEqual(linkAttrs({ hrefNewTab: true, hrefNofollow: true }), { target: "_blank", rel: "noopener noreferrer nofollow" })
})
