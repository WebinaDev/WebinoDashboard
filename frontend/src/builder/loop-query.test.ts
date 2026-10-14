import assert from "node:assert/strict"
import test from "node:test"

import { applyFilterState, mergeQueryProps, parseFilterOptions, reduceFilterState } from "./loop-query.ts"

test("global query overrides loop props", () => {
  const props = { queryId: "team", perPage: 3, title: "T" }
  const merged = mergeQueryProps(props, [{ id: "team", name: "Team", source: "collection", collection: "team", filters: [{ key: "role", value: "مدیر" }], limit: 12, sort: "title" }])
  assert.equal(merged.source, "collection")
  assert.equal(merged.collectionFilter, "role=مدیر")
  assert.equal(merged.perPage, 12)
  assert.equal(merged.title, "T")
  assert.equal(mergeQueryProps({ queryId: "missing" }, []).source, undefined)
})

test("filter state reduces and applies", () => {
  let state = reduceFilterState({ filters: {} }, { category: "skin", filters: { role: "طراح|مدیر", "Bad Key": "x" } })
  state = reduceFilterState(state, { q: "  علی ", filters: { role: "" } })
  assert.deepEqual(state, { category: "skin", q: "علی", filters: {} })
  const applied = applyFilterState({ collectionFilter: "city=tehran" }, reduceFilterState(state, { filters: { role: "طراح" } }))
  assert.equal(applied.collectionFilter, "city=tehran, role=طراح")
  assert.equal(applied.category, "skin")
  assert.equal(applied.collectionSearch, "علی")
})

test("filter options parse", () => {
  assert.deepEqual(parseFilterOptions("a|الف\nb\n\n|x"), [{ value: "a", label: "الف" }, { value: "b", label: "b" }])
})
