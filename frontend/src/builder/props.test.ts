import assert from "node:assert/strict"
import { test } from "node:test"

import { linkAttrs, parseLinks, parseRows, rowsToLines, toLocalInput } from "./props"

test("repeater rows round-trip the legacy line format", () => {
  const keys = ["label", "href"]
  const rows = parseRows("خانه|/\nفروشگاه|/shop", keys)
  assert.deepEqual(rows, [{ label: "خانه", href: "/" }, { label: "فروشگاه", href: "/shop" }])
  const lines = rowsToLines(rows, keys)
  assert.equal(lines, "خانه|/\nفروشگاه|/shop")
  assert.deepEqual(parseLinks(lines, []), rows)
  assert.equal(rowsToLines([{ label: "a|b", href: "/x" }], keys), "a/b|/x")
  const multi = rowsToLines([{ label: "t", href: "line1\nline2" }], keys)
  assert.equal(multi.split("\n").length, 1)
  assert.deepEqual(parseRows(multi, keys), [{ label: "t", href: "line1\nline2" }])
})

test("datetime input converts UTC ISO to local", () => {
  assert.equal(toLocalInput("2026-10-14T10:30"), "2026-10-14T10:30")
  const local = toLocalInput("2026-10-14T10:30:00Z")
  const d = new Date("2026-10-14T10:30:00Z")
  assert.equal(local.slice(11), `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`)
})

test("link attrs for new tab / nofollow", () => {
  assert.deepEqual(linkAttrs({ href: "/" }), {})
  assert.deepEqual(linkAttrs({ hrefNewTab: true }), { target: "_blank", rel: "noopener noreferrer" })
  assert.deepEqual(linkAttrs({ hrefNewTab: true, hrefNofollow: true }), { target: "_blank", rel: "noopener noreferrer nofollow" })
})
