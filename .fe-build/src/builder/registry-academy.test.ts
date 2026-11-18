import assert from "node:assert/strict"
import { test } from "node:test"

import { ACADEMY_WIDGET_TYPES, ACADEMY_WIDGETS } from "./registry-academy.ts"

test("academy widgets match declared types", () => {
  assert.deepEqual(ACADEMY_WIDGETS.map((w) => w.type), [...ACADEMY_WIDGET_TYPES])
  for (const w of ACADEMY_WIDGETS) {
    assert.ok(w.label)
    assert.ok(w.fields.length > 0)
    const node = w.create()
    assert.equal(node.type, w.type)
    assert.ok(node.id)
  }
})

test("academy hero defaults use blush tone for Gatabi-family brand", () => {
  const hero = ACADEMY_WIDGETS.find((w) => w.type === "academy-hero")!.create()
  assert.equal(hero.props.tone, "blush")
  assert.equal(hero.props.fullBleed, true)
})

test("course-grid defaults to live academy source", () => {
  const grid = ACADEMY_WIDGETS.find((w) => w.type === "course-grid")!.create()
  assert.equal(grid.props.source, "live")
})
