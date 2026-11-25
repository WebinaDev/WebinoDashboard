import assert from "node:assert/strict"
import { test } from "node:test"

import { editRepeater, linkAttrs, parseLinks, parseRows, repeaterCells, repeaterRows, rowsToLines, toLocalInput } from "./props"

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

test("repeater edits preserve structured rows and their unexposed data", () => {
  const keys = ["label", "href"]
  const original = [{ label: "first", href: "/one", enabled: true, meta: { id: 3 } }, null, { label: "third", href: "/three", rank: 2 }]
  assert.equal(repeaterRows(original, keys).length, 3)
  const updated = editRepeater(original, keys, { kind: "set", index: 2, key: "label", value: "changed|value" })
  assert.deepEqual(updated, [original[0], null, { label: "changed|value", href: "/three", rank: 2 }])
  assert.deepEqual(original[2], { label: "third", href: "/three", rank: 2 })
  assert.deepEqual(editRepeater(updated, keys, { kind: "move", index: 2, delta: -1 }), [original[0], { label: "changed|value", href: "/three", rank: 2 }, null])
  assert.deepEqual(editRepeater(updated, keys, { kind: "delete", index: 1 }), [original[0], { label: "changed|value", href: "/three", rank: 2 }])
  assert.equal(editRepeater(original, keys, { kind: "move", index: 0, delta: -1 }), original)
  assert.equal(editRepeater(original, keys, { kind: "set", index: 0, key: "other", value: "x" }), original)
})

test("legacy repeater edits retain their line format", () => {
  const keys = ["label", "href"]
  assert.deepEqual(repeaterRows(" first |/one\\nnext ", keys), [{ label: " first ", href: "/one\nnext " }])
  const original = "first|/one\nsecond|/two"
  assert.equal(editRepeater(original, keys, { kind: "set", index: 1, key: "label", value: "updated" }), "first|/one\nupdated|/two")
  assert.equal(editRepeater(original, keys, { kind: "move", index: 0, delta: 1 }), "second|/two\nfirst|/one")
  assert.equal(editRepeater(original, keys, { kind: "add" }), "first|/one\nsecond|/two\n|")
  const extended = "first|/one|hidden\n\nsecond|/two|extra"
  assert.equal(editRepeater(extended, keys, { kind: "set", index: 1, key: "label", value: "updated" }), "first|/one|hidden\n\nupdated|/two|extra")
  assert.equal(editRepeater(extended, keys, { kind: "move", index: 1, delta: -1 }), "second|/two|extra\n\nfirst|/one|hidden")
})

test("rendered repeater cells support structured JSON and the legacy line format", () => {
  const keys = ["image", "href", "alt", "mobileImage"]
  const expected = [["/banner.jpg", "/shop", "Banner", "/mobile.jpg"]]
  assert.deepEqual(repeaterCells("/banner.jpg|/shop|Banner|/mobile.jpg", keys), expected)
  assert.deepEqual(repeaterCells([{ image: "/banner.jpg", href: "/shop", alt: "Banner", mobileImage: "/mobile.jpg", hidden: 1 }], keys), expected)
})

test("link attrs for new tab / nofollow", () => {
  assert.deepEqual(linkAttrs({ href: "/" }), {})
  assert.deepEqual(linkAttrs({ hrefNewTab: true }), { target: "_blank", rel: "noopener noreferrer" })
  assert.deepEqual(linkAttrs({ hrefNewTab: true, hrefNofollow: true }), { target: "_blank", rel: "noopener noreferrer nofollow" })
})
