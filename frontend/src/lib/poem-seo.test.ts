import { test } from "node:test"
import assert from "node:assert/strict"
import { poemCanonicalPath, poemDescription, poemJsonLd, poemTitle } from "./poem-seo.ts"

const poem = {
  slug: "باران",
  title: "باران",
  pen_name: "علی",
  sequence: [
    { type: "title", lines: ["باران"] },
    { type: "stanza", lines: ["<b>باران</b> که می‌بارد   دلم", "یاد تو می‌افتد"] },
    { type: "stanza", lines: Array.from({ length: 20 }, (_, i) => `مصراع شماره ${i} از این شعر بلند`) },
  ],
}

test("description: plain text from first lines, title skipped, ≤ ~156 chars", () => {
  const d = poemDescription(poem)
  assert.ok(d.startsWith("باران که می‌بارد دلم / یاد تو می‌افتد"))
  assert.ok(!d.includes("<"))
  assert.ok(d.length <= 156)
  assert.ok(d.endsWith("…"))
})

test("description falls back to excerpt", () => {
  assert.equal(poemDescription({ slug: "x", title: "x", excerpt: " کوتاه " }), "کوتاه")
})

test("title and canonical", () => {
  assert.equal(poemTitle(poem, "علی خباری"), "باران | علی خباری")
  assert.equal(poemTitle(poem, ""), "باران")
  assert.equal(poemCanonicalPath("/poem/", "a b"), "/poem?poem=a%20b")
})

test("json-ld", () => {
  const j = poemJsonLd(poem, "https://x/poem?poem=1", "S")
  assert.equal(j["@type"], "CreativeWork")
  assert.deepEqual(j.author, { "@type": "Person", name: "علی" })
})
