import assert from "node:assert/strict"
import { test } from "node:test"

import { duplicateSection, exportPayload, findNode, importPayload, isLocked, makeClip, moveSection, parseClip, pasteClip, pasteStyle, patchNode } from "./ops"
import type { BuilderDocument } from "./types"

function doc(): BuilderDocument {
  return {
    version: 2,
    sections: [
      { id: "s1", columns: [{ id: "c1", span: 12, widgets: [{ id: "w1", type: "heading", props: { text: "a" }, style: { base: { color: "red" } }, advanced: { cssClass: "x", cssId: "one" } }] }] },
      { id: "s2", locked: true, columns: [{ id: "c2", span: 12, widgets: [{ id: "w2", type: "text", props: {}, advanced: { cssId: "two" } }] }] },
    ],
  }
}

test("patch meta, lock inheritance, move and duplicate sections", () => {
  const d = patchNode(doc(), "w1", { label: "عنوان", hidden: true })
  const hit = findNode(d, "w1")
  assert.equal(hit?.kind === "widget" && hit.node.label, "عنوان")
  assert.equal(isLocked(d, "w2"), true)
  assert.equal(isLocked(d, "w1"), false)
  assert.deepEqual(moveSection(d, "s2", 0).sections.map((s) => s.id), ["s2", "s1"])
  const dup = duplicateSection(d, "s1")
  assert.equal(dup.doc.sections.length, 3)
  assert.notEqual(dup.doc.sections[1].columns[0].widgets[0].id, "w1")
})

test("clipboard round-trip pastes with new ids, paste style keeps anchor id", () => {
  const d = doc()
  const clip = parseClip(JSON.stringify(makeClip(d, "w1")))
  assert.ok(clip)
  const pasted = pasteClip(d, clip, "w2")
  const col = pasted.doc.sections[1].columns[0].widgets
  assert.equal(col.length, 2)
  assert.equal(col[1].id, pasted.id)
  assert.notEqual(pasted.id, "w1")
  const styled = pasteStyle(d, "w2", clip)
  const w2 = findNode(styled, "w2")
  assert.ok(w2?.kind === "widget")
  assert.equal(w2.node.style?.base?.color, "red")
  assert.equal(w2.node.advanced?.cssClass, "x")
  assert.equal(w2.node.advanced?.cssId, "two")
  const sectionClip = makeClip(d, "s1")
  assert.ok(sectionClip)
  assert.deepEqual(pasteClip(d, sectionClip, "w1").doc.sections.length, 3)
  assert.equal(parseClip("{bad"), null)
})

test("export / import", () => {
  const imported = importPayload(exportPayload(doc(), "t"))
  assert.ok(imported)
  assert.equal(imported.sections.length, 2)
  assert.notEqual(imported.sections[0].id, "s1")
  assert.equal(importPayload("{\"sections\":3}"), null)
})
