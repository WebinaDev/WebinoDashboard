import assert from "node:assert/strict"
import { test } from "node:test"

import { POETRY_MODULE_WIDGETS } from "./registry-poetry-module.ts"
import { POETRY_PAGE_WIDGET_TYPES, POETRY_PAGE_WIDGETS } from "./registry-poetry-pages.ts"

test("poetry page widgets: nine mockup types with defaults for every field", () => {
  assert.deepEqual(POETRY_PAGE_WIDGETS.map((w) => w.type), [...POETRY_PAGE_WIDGET_TYPES])
  for (const w of POETRY_PAGE_WIDGETS) {
    const n = w.create()
    assert.equal(n.type, w.type)
    assert.equal(n.props.accent, "#B4101E")
    for (const f of w.fields) assert.ok(f.key in n.props, `${w.type}.${f.key}`)
  }
})

test("poet profile defaults to no photo; shop defaults to checkout off", () => {
  const profile = POETRY_PAGE_WIDGETS.find((w) => w.type === "poet-profile")!.create()
  assert.equal(profile.props.photoMode, "logo")
  const shop = POETRY_PAGE_WIDGETS.find((w) => w.type === "poetry-shop")!.create()
  assert.equal(shop.props.checkoutMode, "inquiry")
})

test("poetry module widgets registered", () => {
  assert.ok(POETRY_MODULE_WIDGETS.length >= 3)
})
