import { test } from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_GLOBALS } from "./globals"
import { exportPayload } from "./ops"
import { collectPortableDependencies, mergePortableDependencies, readPortableDependencies } from "./portable-dependencies"
import type { BuilderDocument } from "./types"

test("portable dependencies include nested components, variants and referenced variables", () => {
  const document: BuilderDocument = { version: 2, sections: [{ id: "s", columns: [{ id: "c", span: 12, widgets: [{ id: "w", type: "component", props: { component: "shared" } }] }] }] }
  const sections = [{ id: "inner", columns: [{ id: "inner-col", span: 12, widgets: [{ id: "inner-widget", type: "component", props: { component: "shared", queryId: "query" }, advanced: { classes: ["card"] } }] }] }]
  const globals = { ...DEFAULT_GLOBALS, components: [{ id: "shared", name: "Shared", sections, props: [] }], classes: [{ id: "card", name: "Card", style: { base: { color: "var(--wb-v-first)" } } }], queries: [{ id: "query", name: "Query", source: "products" as const }], variables: [{ id: "first", name: "First", kind: "color" as const, value: "var(--wb-v-second)" }, { id: "second", name: "Second", kind: "color" as const, value: "#fff" }], presets: [] }
  const dependencies = collectPortableDependencies(document, globals)
  const actual = [dependencies.components.length, dependencies.classes.length, dependencies.queries.length, dependencies.variables.length, readPortableDependencies(exportPayload(document, "Test", dependencies))]
  const expected = [1, 1, 1, 2, dependencies]
  assert.deepEqual(actual, expected)
})

test("portable imports reject duplicate IDs and preserve existing globals on conflict", () => {
  const document: BuilderDocument = { version: 2, sections: [] }
  const variable = { id: "accent", name: "Accent", kind: "color" as const, value: "#fff" }
  const dependencies = { components: [], classes: [], presets: [], queries: [], variables: [variable] }
  const globals = { ...DEFAULT_GLOBALS, variables: [{ ...variable, value: "#000" }] }
  const result = mergePortableDependencies(globals, dependencies)
  const duplicate = { ...dependencies, variables: [variable, variable] }
  const actual = [result.conflicts, result.globals.variables, globals.variables, readPortableDependencies(exportPayload(document, "Test", duplicate))]
  const expected = [["variables:accent"], globals.variables, globals.variables, false]
  assert.deepEqual(actual, expected)
})
