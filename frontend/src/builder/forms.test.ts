import assert from "node:assert/strict"
import { test } from "node:test"

import { missingOnStep, parseFormFields, stepCount, visiblePayload } from "./forms"

test("legacy lines stay required text fields", () => {
  const [field] = parseFormFields("نام|name|text")
  assert.equal(field.required, true)
  assert.equal(field.step, 1)
})

test("steps, options, optional and conditional fields", () => {
  const fields = parseFormFields("نوع|kind|radio|فرد،شرکت||1\nشرکت|company|text||yes|2|kind=شرکت\nتوضیح|note|textarea||no|2")
  assert.deepEqual(fields[0].options, ["فرد", "شرکت"])
  assert.equal(stepCount(fields), 2)
  assert.deepEqual(missingOnStep(fields, { kind: "فرد" }, 2), [])
  assert.deepEqual(missingOnStep(fields, { kind: "شرکت" }, 2), ["company"])
  assert.deepEqual(visiblePayload(fields, { kind: "فرد", company: "x", note: "n" }), { kind: "فرد", note: "n" })
})
