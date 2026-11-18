import assert from "node:assert/strict"
import { test } from "node:test"

import { missingOnStep, parseFormFields, stepCount, visiblePayload } from "./forms"

test("legacy lines stay required text fields", () => {
  const [field] = parseFormFields("نام|name|text")
  assert.equal(field.required, true)
  assert.equal(field.step, 1)
})

test("heading fields are never required and stay out of the payload", () => {
  const fields = parseFormFields("مشخصات|info|heading\nنام|name|text")
  assert.equal(fields[0].type, "heading")
  assert.equal(fields[0].required, false)
  assert.deepEqual(visiblePayload(fields, { name: "علی" }), { name: "علی" })
  assert.deepEqual(missingOnStep(fields, {}, 1), ["name"])
})

test("steps, options, optional and conditional fields", () => {
  const fields = parseFormFields("نوع|kind|radio|فرد،شرکت||1\nشرکت|company|text||yes|2|kind=شرکت\nتوضیح|note|textarea||no|2")
  assert.deepEqual(fields[0].options, ["فرد", "شرکت"])
  assert.equal(stepCount(fields), 2)
  assert.deepEqual(missingOnStep(fields, { kind: "فرد" }, 2), [])
  assert.deepEqual(missingOnStep(fields, { kind: "شرکت" }, 2), ["company"])
  assert.deepEqual(visiblePayload(fields, { kind: "فرد", company: "x", note: "n" }), { kind: "فرد", note: "n" })
})
