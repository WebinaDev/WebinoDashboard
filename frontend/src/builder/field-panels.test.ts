import { test } from "node:test"
import assert from "node:assert/strict"
import { fieldsForPanel } from "./field-panels"
import { widgetDef } from "./registry"
import type { FieldDef } from "./types"

test("legacy fields remain editable in content and explicitly assigned fields appear in their panels", () => {
  const fields: FieldDef[] = [
    { kind: "text", key: "title", label: "Title" },
    { kind: "color", key: "tone", label: "Tone", panel: "design" },
    { kind: "number", key: "limit", label: "Limit", panel: "settings" },
  ]
  const actual = (["content", "design", "settings"] as const).map((panel) => fieldsForPanel(fields, panel).map((field) => field.key))
  assert.deepEqual(actual, [["title"], ["tone"], ["limit"]])
})

test("basic widget controls appear in their intended panels", () => {
  const popup = widgetDef("popup")!
  assert.ok(fieldsForPanel(popup.fields ?? [], "content").some((field) => field.key === "title"))
  assert.ok(fieldsForPanel(popup.fields ?? [], "design").some((field) => field.key === "layout"))
  assert.ok(fieldsForPanel(popup.fields ?? [], "settings").some((field) => field.key === "trigger"))
  assert.ok(fieldsForPanel(widgetDef("spacer")!.fields ?? [], "design").some((field) => field.key === "size"))
  assert.ok(fieldsForPanel(widgetDef("divider")!.fields ?? [], "design").some((field) => field.key === "color"))
})
