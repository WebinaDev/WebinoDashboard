import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { appendImportedDocument, chooseImportMode, insertLibraryDocument, missingDocumentDependencies, unknownWidgetTypes } from "./import-flow"
import type { BuilderDocument } from "./types"

describe("JSON import choice", () => {
  it("replaces an empty document without a prompt", () => {
    let calls = 0
    const confirm = () => { calls++; return false }
    assert.equal(chooseImportMode(false, confirm, confirm), "replace")
    assert.equal(calls, 0)
  })
  it("replaces only after confirmation", () => {
    let calls = 0
    const append = () => { calls++; return false }
    assert.equal(chooseImportMode(true, () => true, append), "replace")
    assert.equal(calls, 0)
  })
  it("requires separate consent to append and can cancel", () => {
    assert.equal(chooseImportMode(true, () => false, () => true), "append")
    assert.equal(chooseImportMode(true, () => false, () => false), "cancel")
  })
})

describe("append import", () => {
  const current: BuilderDocument = { version: 2, css: ".old{}", sections: [{ id: "old", columns: [{ id: "col-old", span: 12, widgets: [] }] }] }
  const imported: BuilderDocument = { version: 2, css: "#new{}", sections: [{ id: "new", columns: [{ id: "col-new", span: 12, widgets: [] }] }] }
  it("inserts library page CSS and nodes at the requested location without ID collisions", () => {
    const result = insertLibraryDocument(current, imported, 0)!
    assert.deepEqual([result.sections.map((section) => section.id), result.css, insertLibraryDocument(current, current, 0)], [["new", "old"], ".old{}\n#new{}", null])
  })
  it("preserves IDs and both CSS blocks while invalidating compiled CSS", () => {
    const result = appendImportedDocument({ ...current, compiled: { v: 1, bp: "", hash: "", css: "stale" } }, imported)!
    assert.deepEqual(result.sections.map((s) => s.id), ["old", "new"])
    assert.equal(result.css, ".old{}\n#new{}")
    assert.equal(result.compiled, undefined)
    assert.equal(current.sections.length, 1)
  })
  it("rejects collisions without modifying either document", () => {
    const nested = { ...imported, sections: [{ ...imported.sections[0], columns: [{ id: "col-old", span: 12, widgets: [] }] }] }
    assert.equal(appendImportedDocument(current, nested), null)
    assert.equal(current.sections.length, 1)
  })
})

it("finds unknown types in nested sections without listing duplicates", () => {
  const document: BuilderDocument = { version: 2, sections: [{ id: "s", columns: [{ id: "c", span: 12, widgets: [{ id: "w", type: "container", props: {}, children: [{ id: "s2", columns: [{ id: "c2", span: 12, widgets: [{ id: "w2", type: "unknown", props: {} }, { id: "w3", type: "unknown", props: {} }] }] }] }] }] }] }
  assert.deepEqual(unknownWidgetTypes(document, (type) => type === "container"), ["unknown"])
})

it("finds missing global dependencies through reusable components without looping", () => {
  const componentSections = [{ id: "cs", columns: [{ id: "cc", span: 12, widgets: [{ id: "cw", type: "component", props: { component: "shared", queryId: "missing-query" }, advanced: { classes: ["missing-class"] } }] }] }]
  const document: BuilderDocument = { version: 2, sections: [{ id: "s", advanced: { preset: "missing-preset" }, columns: [{ id: "c", span: 12, widgets: [{ id: "w", type: "component", props: { component: "shared" } }] }] }] }
  const globals = { components: [{ id: "shared", name: "Shared", sections: componentSections, props: [] }], classes: [], presets: [], queries: [] }
  assert.deepEqual(new Set(missingDocumentDependencies(document, globals)), new Set(["preset:missing-preset", "class:missing-class", "query:missing-query"]))
  assert.ok(missingDocumentDependencies(document, { ...globals, components: [] }).includes("component:shared"))
})
