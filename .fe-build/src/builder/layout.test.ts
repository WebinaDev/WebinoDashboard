import assert from "node:assert/strict"
import test from "node:test"

import { migrateDocument } from "./migrate.ts"
import { documentCss } from "./style.ts"
import type { BuilderDocument } from "./types.ts"

const v1: BuilderDocument = {
  version: 1,
  sections: [
    {
      id: "sec_a",
      columns: [
        {
          id: "col_a",
          span: 6,
          mobileSpan: 12,
          widgets: [{ id: "w_c", type: "container", props: {}, children: [{ id: "sec_n", columns: [{ id: "col_n", span: 12, widgets: [] }] }] }],
        },
      ],
    },
  ],
}

test("v1 documents migrate to v2 with every section (incl. nested) marked legacy, idempotently", () => {
  const v2 = migrateDocument(v1)
  assert.equal(v2.version, 2)
  assert.equal(v2.sections[0].legacy, true)
  assert.equal(v2.sections[0].columns[0].widgets[0].children?.[0].legacy, true)
  assert.equal(migrateDocument(v2), v2)
  assert.equal(v1.sections[0].legacy, undefined, "input not mutated")
})

test("legacy sections emit no span/layout rules (render unchanged)", () => {
  const css = documentCss(migrateDocument(v1))
  assert.doesNotMatch(css, /grid-column/)
  assert.doesNotMatch(css, /wb-columns/)
})

test("v2 sections emit per-breakpoint spans, flex/grid layout and order", () => {
  const doc: BuilderDocument = {
    version: 2,
    sections: [
      {
        id: "sec_b",
        style: { base: { display: "grid", gridColumns: "3", columnGap: "12px" }, mobile: { display: "flex", flexDirection: "column" } },
        columns: [
          { id: "col_x", span: 8, tabletSpan: 6, mobileSpan: 12, style: { mobile: { order: "2" } }, widgets: [] },
          { id: "col_y", span: 4, widgets: [] },
        ],
      },
    ],
  }
  const css = documentCss(doc)
  assert.match(css, /\.wb-sec_b > \.wb-columns\{display:grid;grid-template-columns:repeat\(3, minmax\(0, 1fr\)\);column-gap:12px\}/)
  assert.match(css, /\.wb-sec_b > \.wb-columns > \*\{grid-column:auto\}/)
  assert.match(css, /@media \(max-width:767px\)\{\.wb-sec_b > \.wb-columns\{display:flex;flex-direction:column\}/)
  assert.match(css, /\.wb-col_x\{grid-column:span 8\}/)
  assert.match(css, /@media \(max-width:1024px\)\{\.wb-col_x\{grid-column:span 6\}\}/)
  assert.match(css, /@media \(max-width:767px\)\{\.wb-col_x\{grid-column:span 12\}\}/)
  assert.match(css, /@media \(max-width:767px\)\{\.wb-col_x\{order:2\}\}/)
})
