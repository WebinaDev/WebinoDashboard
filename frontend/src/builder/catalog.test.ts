import assert from "node:assert/strict"
import test from "node:test"

import { mapApiBrand, mapApiProduct } from "./catalog.ts"

test("mapApiProduct keeps live price, stock, brand and installments", () => {
  const product = mapApiProduct(
    {
      id: 9,
      slug: "lamp",
      name: "چراغ",
      price_minor: 2000,
      discounted_price_minor: 1500,
      is_available: true,
      is_sold_out: false,
      description: "<p>روشن</p>",
      cover_image_url: "https://cdn.example/a.jpg",
      brands: [{ name: "نورا", slug: "nora" }],
      media: [{ url: "https://cdn.example/b.jpg" }],
      variants: [{ id: 3, name: "بزرگ", price_minor: 1800, stock: 0, stock_status: "outofstock", manage_stock: true }],
      pricing: { types: { cash: 1400 }, installments: [{ months: 3, monthly_minor: 500, total_minor: 1500 }] },
    },
    0,
  )
  assert.equal(product.live, true)
  assert.equal(product.price, 1500)
  assert.equal(product.compare, 2000)
  assert.equal(product.brand, "نورا")
  assert.equal(product.brandSlug, "nora")
  assert.equal(product.images[0], "https://cdn.example/a.jpg")
  assert.equal(product.variants[0]?.inStock, false)
  assert.equal(product.installments[0]?.months, 3)
  assert.equal(product.cashPrice, 1400)
  assert.equal(product.description, "روشن")
})

test("mapApiBrand drops incomplete rows", () => {
  assert.equal(mapApiBrand({ name: "نورا" }), null)
  assert.deepEqual(mapApiBrand({ name: "نورا", slug: "nora" }), { name: "نورا", slug: "nora" })
})
