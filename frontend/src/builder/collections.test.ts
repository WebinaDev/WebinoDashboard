import assert from "node:assert/strict"
import { test } from "node:test"

import { collectionQuery, collectionRows } from "./collections.ts"

test("collection query builds search and safe filters", () => {
  const q = new URLSearchParams(collectionQuery({ collectionSearch: " علی ", collectionFilter: "city=تهران، Bad Key=x, role = a=b" }, 8, 2, "sort"))
  assert.equal(q.get("q"), "علی")
  assert.equal(q.get("filter[city]"), "تهران")
  assert.equal(q.get("filter[role]"), "a=b")
  assert.equal([...q.keys()].some((k) => k.includes("Bad")), false)
  assert.equal(q.get("limit"), "8")
})

test("cards link to the url field, else to the item page", () => {
  const payload = {
    collection: { fields: [{ key: "photo", type: "image" }, { key: "bio", type: "text" }, { key: "site", type: "url" }] },
    items: [{ slug: "ali", title: "علی", data: { photo: "/a.jpg", bio: "x", site: "javascript:1" } }, { slug: "sara", title: "سارا", data: { site: "https://s.ir" } }],
    total: 2,
  }
  const { rows, total } = collectionRows(payload, "team")
  assert.equal(total, 2)
  assert.equal(rows[0].href, "/c/team/ali")
  assert.equal(rows[0].image, "/a.jpg")
  assert.equal(rows[1].href, "https://s.ir")
})
