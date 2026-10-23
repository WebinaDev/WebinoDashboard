import { test } from "node:test"
import assert from "node:assert/strict"
import { poemHref } from "./poem-href.ts"

test("poemHref", () => {
  assert.equal(poemHref("", { slug: "a b" }), "/poem?poem=a%20b")
  assert.equal(poemHref("/poem", { slug: "x" }), "/poem?poem=x")
  assert.equal(poemHref("/poem?poem={slug}", { slug: "x" }), "/poem?poem=x")
  assert.equal(poemHref("/poems/{slug}", { slug: "x" }), "/poems/x")
  assert.equal(poemHref("/p/{id}", { id: 7 }), "/p/7")
  assert.equal(poemHref("", { slug: null, id: 9 }), "/poem?poem=9")
  assert.equal(poemHref("javascript:alert(1)", { slug: "x" }), "/poem?poem=x")
})
