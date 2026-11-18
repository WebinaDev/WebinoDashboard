import assert from "node:assert/strict"
import { test } from "node:test"

import { applyBreakpoints, compileDocument, viewCss } from "./compile.ts"
import { documentCss } from "./style.ts"
import type { BuilderDocument } from "./types.ts"

const doc: BuilderDocument = {
  version: 2,
  sections: [{ id: "s1", columns: [{ id: "c1", span: 12, widgets: [{ id: "w1", type: "heading", props: {}, style: { base: { padding: { top: "4px" } }, mobile: { padding: { top: "8px" } } } }] }] }],
} as unknown as BuilderDocument

test("compiled css is reused only while it matches", () => {
  const compiled = compileDocument(doc)
  assert.equal(viewCss(compiled), documentCss(doc))
  const tampered = { ...compiled, compiled: { ...compiled.compiled!, css: "X" } }
  assert.equal(viewCss(tampered), "X")
  const edited = { ...tampered, sections: [] }
  assert.equal(viewCss(edited), "")
  assert.notEqual(viewCss(tampered, { tablet: 900, mobile: 600 }), "X")
})

test("custom breakpoints rewrite media queries only", () => {
  const css = "@media (max-width:767px){.a{width:767px}}@media (min-width:768px) and (max-width:1024px){.b{}}"
  const out = applyBreakpoints(css, { tablet: 900, mobile: 600 })
  assert.equal(out, "@media (max-width:600px){.a{width:767px}}@media (min-width:601px) and (max-width:900px){.b{}}")
  assert.equal(applyBreakpoints(css), css)
})
