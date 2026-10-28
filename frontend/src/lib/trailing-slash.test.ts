import { test } from "node:test"
import assert from "node:assert/strict"
import { trailingSlashTarget } from "./trailing-slash.ts"

test("strips the trailing slash once and keeps the query", () => {
  assert.equal(trailingSlashTarget("http://127.0.0.1:3000/product-category/skincare/"), "/product-category/skincare")
  assert.equal(trailingSlashTarget("http://x/shop/?orderby=price"), "/shop?orderby=price")
  assert.equal(trailingSlashTarget("http://x/a//"), "/a")
  assert.equal(trailingSlashTarget("http://x/"), "/")
})

test("target never ends with a slash (no self-redirect loop)", () => {
  for (const p of ["/x/", "/%D8%A2/", "/product-category/skin-care/"]) assert.ok(!trailingSlashTarget(`http://x${p}`).endsWith("/"))
})
