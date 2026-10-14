import assert from "node:assert/strict"
import { test } from "node:test"

import { auditDocument, contrastRatio } from "./a11y.ts"
import type { BuilderDocument } from "./types.ts"

const w = (id: string, type: string, props: Record<string, unknown>, style?: Record<string, unknown>) => ({ id, type, props, ...(style ? { style: { base: style } } : {}) })
const doc = (widgets: unknown[]): BuilderDocument => ({ version: 2, sections: [{ id: "s", columns: [{ id: "c", span: 12, widgets }] }] }) as unknown as BuilderDocument

test("contrast ratio matches WCAG reference values", () => {
  assert.equal(contrastRatio("#000000", "#ffffff")?.toFixed(1), "21.0")
  assert.equal(contrastRatio("#777", "#fff")?.toFixed(2), "4.48")
  assert.equal(contrastRatio("var(--x)", "#fff"), null)
})

test("audit finds alt, headings, empty buttons, labels and contrast", () => {
  const codes = auditDocument(doc([
    w("i1", "image", { src: "/a.jpg", alt: "" }),
    w("i2", "image", { src: "/a.jpg", alt: "گل" }),
    w("h1", "heading", { text: "A", tag: "h1" }),
    w("h2", "heading", { text: "B", tag: "h3" }),
    w("h3", "heading", { text: "C", tag: "h1" }),
    w("b1", "button", { label: "" }),
    w("f1", "form", { fields: "|email|email" }),
    w("t1", "text", { html: "x" }, { color: "#999999", background: "#ffffff" }),
  ])).map((i) => `${i.id}:${i.code}`)
  assert.deepEqual(codes, ["i1:img_alt", "h2:heading_skip", "h3:heading_multiple_h1", "b1:button_text", "f1:form_label", "t1:contrast"])
  assert.deepEqual(auditDocument(doc([w("x", "text", {})])).map((i) => i.code), ["no_h1"])
})
