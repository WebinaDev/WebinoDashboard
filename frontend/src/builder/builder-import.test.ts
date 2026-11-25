import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { exportPayload, importPayload } from "./ops"
import type { BuilderDocument } from "./types"

const doc: BuilderDocument = { version: 2, sections: [{ id: "s", columns: [{ id: "c", span: 12, widgets: [{ id: "w", type: "heading", props: { text: "Hello" } }] }] }] }

describe("builder JSON import", () => {
  it("round-trips a document and assigns fresh node ids", () => {
    const imported = importPayload(exportPayload(doc, "Example"))!
    assert.deepEqual(imported.sections[0].columns[0].widgets[0].props, { text: "Hello" })
    assert.notEqual(imported.sections[0].id, "s")
    assert.notEqual(imported.sections[0].columns[0].widgets[0].id, "w")
  })
  it("migrates a bare legacy document", () => {
    assert.equal(importPayload(JSON.stringify({ ...doc, version: 1 }))?.sections[0].legacy, true)
  })
  it("keeps unique IDs when replacing so custom CSS and links still target the same nodes", () => {
    const original = { ...doc, css: "#w { color: red }", compiled: { v: 4, bp: "1024/767", hash: "old", css: "stale" } }
    const imported = importPayload(exportPayload(original, "Example"), { preserveIds: true })!
    assert.equal(imported.sections[0].columns[0].widgets[0].id, "w")
    assert.equal(imported.css, original.css)
    assert.equal(imported.compiled, undefined)
    assert.notEqual(importPayload(exportPayload(original, "Example"))!.sections[0].columns[0].widgets[0].id, "w")
  })
  it("regenerates IDs if a replacement has missing or duplicate node IDs", () => {
    const invalidIds = { ...doc, sections: [{ ...doc.sections[0], id: "w" }] }
    const result = importPayload(JSON.stringify(invalidIds), { preserveIds: true })!
    assert.notEqual(result.sections[0].id, "w")
    assert.notEqual(result.sections[0].columns[0].widgets[0].id, "w")
  })
  it("rejects invalid node IDs when custom CSS could reference them", () => {
    const invalidIds = { ...doc, css: "#w { color: red }", sections: [{ ...doc.sections[0], id: "w" }] }
    assert.equal(importPayload(JSON.stringify(invalidIds), { preserveIds: true }), null)
  })
  it("rejects malformed and unsupported documents", () => {
    for (const value of ["{", JSON.stringify({ version: 3, sections: [] }), JSON.stringify({ sections: [null] }), JSON.stringify({ sections: [{ columns: [{ span: 12, widgets: [{ type: "heading" }] }] }] })]) {
      assert.equal(importPayload(value), null)
    }
    assert.equal(importPayload(JSON.stringify({ format: "other-builder", document: doc })), null)
    assert.equal(importPayload('{"sections":[{"columns":[{"span":1e999,"widgets":[]}]}]}'), null)
    assert.equal(importPayload(JSON.stringify({ ...doc, sections: [{ ...doc.sections[0], columns: [{ ...doc.sections[0].columns[0], widgets: [{ id: "w", type: " ", props: {} }] }] }] })), null)
  })
})
