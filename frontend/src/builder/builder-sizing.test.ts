import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { compileDocument, viewCss } from "./compile"
import { mergeStyle, styleToCss } from "./style"
import type { BuilderDocument } from "./types"

describe("responsive builder sizing", () => {
  it("applies dimensions in the editor and rejects unsafe values", () => {
    const css = styleToCss(mergeStyle({ base: { height: "18rem", minWidth: "2rem", maxHeight: "50vh" }, mobile: { height: "auto" } }, "mobile"))
    assert.equal(css.height, "auto")
    assert.equal(css.minWidth, "2rem")
    assert.equal(css.maxHeight, "50vh")
    assert.equal(styleToCss({ height: "url(javascript:bad)" }).height, undefined)
  })
  it("compiles responsive dimensions and discards obsolete CSS caches", () => {
    const doc: BuilderDocument = { version: 2, sections: [{ id: "s", columns: [{ id: "c", span: 12, widgets: [{ id: "w", type: "heading", props: {}, style: { base: { height: "18rem", minWidth: "2rem", maxHeight: "50vh" }, mobile: { height: "auto" } } }] }] }] }
    const compiled = compileDocument(doc)
    assert.ok(compiled.compiled?.css.includes("height:18rem"))
    assert.ok(compiled.compiled?.css.includes("min-width:2rem"))
    assert.ok(compiled.compiled?.css.includes("max-height:50vh"))
    assert.ok(compiled.compiled?.css.includes("height:auto"))
    assert.notEqual(viewCss({ ...compiled, compiled: { ...compiled.compiled!, v: 3, css: "STALE" } }), "STALE")
  })
})
