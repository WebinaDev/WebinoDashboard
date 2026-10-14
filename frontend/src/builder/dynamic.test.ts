import assert from "node:assert/strict"
import { test } from "node:test"

import { dynamicNeeds, resolveProps, resolveValue } from "./dynamic"

const data = {
  siteName: "ویبینو",
  logoUrl: "/logo.png",
  pageTitle: "خانه",
  userName: "آرسلان",
  product: { name: "کفش", slug: "shoe", price: 120000, image: "/shoe.jpg" },
  custom: { meta: { material: "چرم" } },
  now: new Date("2026-10-14T08:00:00Z"),
}

test("resolves every tag, with before/after and fallback", () => {
  assert.equal(resolveValue({ tag: "product.title", before: "« ", after: " »" }, data), "« کفش »")
  assert.match(resolveValue({ tag: "product.price" }, data), /تومان$/)
  assert.equal(resolveValue({ tag: "product.image" }, data), "/shoe.jpg")
  assert.equal(resolveValue({ tag: "product.link" }, data), "/product/shoe")
  assert.equal(resolveValue({ tag: "site.name" }, data), "ویبینو")
  assert.equal(resolveValue({ tag: "site.logo" }, data), "/logo.png")
  assert.equal(resolveValue({ tag: "user.name" }, data), "آرسلان")
  assert.equal(resolveValue({ tag: "page.title" }, data), "خانه")
  assert.ok(resolveValue({ tag: "date.current" }, data).length > 4)
  assert.equal(resolveValue({ tag: "custom.field", key: "material" }, data), "چرم")
  assert.equal(resolveValue({ tag: "user.name", fallback: "مهمان", before: "سلام " }, { ...data, userName: "" }), "مهمان")
})

test("resolveProps keeps unbound props and reports needs", () => {
  const props = { title: { dynamic: { tag: "product.title" } }, text: "ثابت" }
  assert.deepEqual(resolveProps(props, data), { title: "کفش", text: "ثابت" })
  const plain = { text: "x" }
  assert.equal(resolveProps(plain, data), plain)
  assert.deepEqual(dynamicNeeds(props), { product: true, user: false })
})
