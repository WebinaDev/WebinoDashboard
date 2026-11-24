import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { PLANNED_VISUAL_STYLES } from "./visual-style-catalog"

describe("planned visual styles", () => {
  it("reserves unique, stable identifiers across all requested families", () => {
    const ids = PLANNED_VISUAL_STYLES.map((style) => style.id)
    assert.equal(new Set(ids).size, ids.length)
    assert.equal(ids.length, 77)
    assert.equal(new Set(PLANNED_VISUAL_STYLES.map((style) => style.family)).size, 7)
  })
})
