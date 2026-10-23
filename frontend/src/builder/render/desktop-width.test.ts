import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dwAttr, dwClass, dwRowClass, sectionDesktopWidth, widgetDesktopWidth } from "./desktop-width.ts"
import type { SectionNode, WidgetNode } from "../types.ts"

const w = (desktopWidth: string, type = "poem-list") => ({ id: "w" + desktopWidth, type, props: { desktopWidth } }) as unknown as WidgetNode

test("desktopWidth → item class + data attribute", () => {
  assert.equal(widgetDesktopWidth(w("half")), "half")
  assert.equal(widgetDesktopWidth(w("wide")), "wide")
  assert.equal(widgetDesktopWidth(w("bogus")), "full")
  assert.equal(widgetDesktopWidth(w("half", "poetry-footer")), "full")
  assert.equal(dwClass("half"), "wb-dw-item wb-dw-half")
  assert.equal(dwClass("narrow"), "wb-dw-item wb-dw-narrow")
  assert.equal(dwClass("full"), "")
  assert.deepEqual(dwAttr("half"), { "data-dw": "half" })
  assert.match(dwRowClass(false, "desktop"), /\bwb-dw-row\b/)
  assert.doesNotMatch(dwRowClass(false, "desktop"), /wb-dw-edit/)
  const s = { id: "s", columns: [{ id: "c", widgets: [w("half")] }] } as unknown as SectionNode
  assert.equal(sectionDesktopWidth(s), "half")
})

test("shipped CSS lays rows out horizontally (overrides Tailwind flex-col) with the right bases", () => {
  const css = readFileSync(new URL("./desktop-width.css", import.meta.url), "utf8")
  assert.match(css, /@media \(min-width: 992px\)/)
  assert.match(css, /\.wb-dw-row:not\(\.wb-dw-edit\) \{[^}]*flex-direction: row;[^}]*flex-wrap: wrap;[^}]*gap: 24px/)
  assert.match(css, /> \.wb-dw-half \{ flex-basis: calc\(50% - 12px\)/)
  assert.match(css, /> \.wb-dw-wide \{ flex-basis: calc\(60% - 12px\)/)
  assert.match(css, /> \.wb-dw-narrow \{ flex-basis: calc\(40% - 12px\)/)
  const view = readFileSync(new URL("./DocumentView.tsx", import.meta.url), "utf8")
  assert.match(view, /import "\.\/desktop-width\.css"/)
  assert.match(view, /dwAttr\(dw\)/)
})

import { packDesktopWidths, packVisible } from "./desktop-width.ts"
test("packDesktopWidths: stray halves go full, pairs kept (alikhabari layout)", () => {
  assert.deepEqual(packDesktopWidths(["half", "half", "half", "full", "half", "full", "half", "half"]), ["half", "half", "full", "full", "full", "full", "half", "half"])
  assert.deepEqual(packDesktopWidths(["wide", "narrow", "wide", "half"]), ["wide", "narrow", "full", "full"])
  assert.deepEqual(packDesktopWidths(["narrow", "narrow", "half"]), ["narrow", "narrow", "full"])
  assert.deepEqual(packDesktopWidths(["half", "half", "half", "half"]), ["half", "half", "half", "half"])
})
test("packVisible skips hidden items", () => {
  const xs = [{ w: "half", h: false }, { w: "half", h: true }, { w: "half", h: false }] as const
  assert.deepEqual(packVisible([...xs], (x) => x.w, (x) => x.h), ["half", "full", "half"])
})
