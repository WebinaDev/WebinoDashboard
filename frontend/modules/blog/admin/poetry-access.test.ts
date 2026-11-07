import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

test("poem editor exposes free/premium access controls", () => {
  const src = readFileSync(new URL("./poem-editor.tsx", import.meta.url), "utf8")
  assert.match(src, /panel_access/)
  assert.match(src, /access_free/)
  assert.match(src, /access_premium/)
  assert.match(src, /is_premium: true/)
  assert.match(src, /is_premium: false/)
  // premium is no longer buried only inside the generic flags checklist
  assert.doesNotMatch(src, /\["is_premium", "flag_is_premium"\]/)
})

test("media admin exposes free/premium access controls", () => {
  const src = readFileSync(new URL("./poetry-media-admin.tsx", import.meta.url), "utf8")
  assert.match(src, /panel_access/)
  assert.match(src, /set\("is_premium", true\)/)
  assert.match(src, /set\("is_premium", false\)/)
  assert.match(src, /is_premium: !!r\.is_premium/)
})
