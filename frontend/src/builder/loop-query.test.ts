import assert from "node:assert/strict"
import test from "node:test"

import { applyFilterState, archiveFilterParams, archiveFiltersFromSearch, archiveFiltersToSearch, catalogSort, cleanArchiveFilters, mergeQueryProps, parseFilterOptions, reduceFilterState } from "./loop-query.ts"

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

test("archive filters clean, sync to URL and map to catalog params", () => {
  assert.deepEqual(cleanArchiveFilters({ minPrice: 900, maxPrice: 100, sort: "bogus", tag: "a b", inStock: true }), { minPrice: 100, maxPrice: 900, inStock: true })
  const search = archiveFiltersToSearch("utm=x", { category: "قهوه", archive: { minPrice: 10, onSale: true, sort: "price_desc", attr: "color:red" } }, "shop")
  const back = archiveFiltersFromSearch(search, "shop")
  assert.equal(new URLSearchParams(search).get("utm"), "x")
  assert.equal(back.category, "قهوه")
  assert.deepEqual(back.archive, { minPrice: 10, onSale: true, sort: "price_desc", attr: "color:red" })
  const params = archiveFilterParams(new URLSearchParams(), back.archive)
  assert.equal(params.get("builder"), "1")
  assert.equal(params.get("attr"), "color:red")
  assert.equal(catalogSort("price"), "price_asc")
  let state = reduceFilterState({ filters: {} }, { archive: { inStock: true } })
  assert.deepEqual(state.archive, { inStock: true })
  state = reduceFilterState(state, { archive: {} })
  assert.equal(state.archive, undefined)
  assert.deepEqual(applyFilterState({}, { filters: {}, archive: { tag: "x" } }).archive, { tag: "x" })
})
