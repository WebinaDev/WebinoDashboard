import { test } from "node:test"
import assert from "node:assert/strict"
import { fieldsForPanel } from "./field-panels"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
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

test("divider design labels exist in both supported locales", () => {
  const fields = widgetDef("divider")!.fields ?? []
  const keys = fields.flatMap((field) => [
    ...(field.labelKey ? [field.labelKey] : []),
    ...(field.kind === "select" ? field.options.flatMap((option) => option.labelKey ? [option.labelKey] : []) : []),
  ])
  for (const locale of ["en", "fa"]) {
    const messages = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../messages", `${locale}.json`), "utf8")).builder
    for (const key of keys) assert.ok(messages[key], `${locale}:${key}`)
  }
})

test("common controls use their panel without hiding content or overriding explicit assignments", () => {
  const fields: FieldDef[] = [
    { kind: "repeater", key: "columns", label: "Content columns", fields: [] },
    { kind: "number", key: "columns", label: "Column count" },
    { kind: "color", key: "background", label: "Background" },
    { kind: "color", key: "accent", label: "Accent", panel: "content" },
    { kind: "switch", key: "autoplay", label: "Autoplay" },
    { kind: "number", key: "limit", label: "Limit" },
    { kind: "switch", key: "mobileFullWidth", label: "Mobile width" },
    { kind: "select", key: "layout", label: "Layout", options: [] },
    { kind: "text", key: "anchor_id", label: "Anchor" },
  ]
  assert.deepEqual(fieldsForPanel(fields, "content").map((field) => field.key), ["columns", "accent"])
  assert.deepEqual(fieldsForPanel(fields, "design").map((field) => field.key), ["columns", "background", "mobileFullWidth", "layout"])
  assert.deepEqual(fieldsForPanel(fields, "settings").map((field) => field.key), ["autoplay", "limit", "anchor_id"])
})
