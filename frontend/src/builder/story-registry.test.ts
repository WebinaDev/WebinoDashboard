import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { COMMERCE_WIDGETS } from "./registry-commerce"
import { POETRY_WIDGETS } from "./registry-poetry"
import { importPayload } from "./ops"

describe("story-strip compatibility", () => {
  it("registers one definition and keeps the existing Dashboard defaults", () => {
    const matches = [...COMMERCE_WIDGETS, ...POETRY_WIDGETS].filter((item) => item.type === "story-strip")
    assert.equal(matches.length, 1)
    const props = matches[0].create().props
    assert.equal(props.title, "هایلایت‌ها")
    assert.equal(props.variant, "")
    assert.equal(props.layout, "rings")
    const fields = matches[0].fields.map((field) => field.key)
    for (const key of ["title", "limit", "variant", "layout", "tone"]) assert.ok(fields.includes(key))
  })
  it("preserves existing story settings while importing legacy documents", () => {
    const props = { title: "Example", limit: 3, variant: "poetry", layout: "carousel", tone: "glass" }
    const imported = importPayload(JSON.stringify({ version: 1, sections: [{ id: "s", columns: [{ id: "c", span: 12, widgets: [{ id: "w", type: "story-strip", props }] }] }] }))
    assert.deepEqual(imported?.sections[0].columns[0].widgets[0].props, props)
  })
})
