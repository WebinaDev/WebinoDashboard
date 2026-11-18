import assert from "node:assert/strict"
import { test } from "node:test"

import { pickVariant, storedVariant } from "./ab.ts"

test("split decides the share of variant B", () => {
  assert.equal(pickVariant(30, 0.29), "b")
  assert.equal(pickVariant(30, 0.3), "a")
  assert.equal(pickVariant(0, 0), "a")
  assert.equal(pickVariant(100, 0.999), "b")
  let b = 0
  for (let i = 0; i < 1000; i += 1) if (pickVariant(25, i / 1000) === "b") b += 1
  assert.equal(b, 250)
})

test("stored bucket is validated", () => {
  assert.equal(storedVariant("b"), "b")
  assert.equal(storedVariant("x"), null)
  assert.equal(storedVariant(null), null)
})
