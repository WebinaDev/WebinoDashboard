import assert from "node:assert/strict"
import { test } from "node:test"

import { POETRY_WIDGET_TYPES, POETRY_WIDGETS } from "./registry-poetry.ts"

test("poetry widgets: nine types with Persian labels", () => {
  assert.deepEqual(POETRY_WIDGETS.map((w) => w.type), [...POETRY_WIDGET_TYPES])
  for (const w of POETRY_WIDGETS) {
    assert.match(w.label, /[\u0600-\u06FF]/)
    assert.equal(w.create().type, w.type)
  }
})

test("poetry footer and poet-about expose socials (network|href)", () => {
  for (const t of ["poetry-footer", "poet-about"]) {
    const def = POETRY_WIDGETS.find((w) => w.type === t)
    const f = def?.fields.find((x) => x.key === "socials")
    assert.ok(f && f.kind === "repeater")
    assert.deepEqual(f.fields.map((x) => x.key), ["network", "href"])
  }
})
