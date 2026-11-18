import { test } from "node:test"
import assert from "node:assert/strict"
import { isDarkColor, luminance, sectionIsDark } from "./contrast.ts"

test("luminance of hex / rgb / gradient", () => {
  assert.ok((luminance("#fff") ?? 0) > 0.9)
  assert.ok((luminance("#000000") ?? 1) < 0.01)
  assert.ok(isDarkColor("rgb(74, 7, 16)"))
  assert.ok(isDarkColor("linear-gradient(180deg, #5a0f17, #2a0a0d)"))
  assert.ok(!isDarkColor("#f7efe1"))
  assert.equal(luminance("var(--x)"), null)
})

test("sectionIsDark", () => {
  assert.ok(sectionIsDark({ tone: "dark" }))
  assert.ok(sectionIsDark({ tone: "light", bgImage: "/a.jpg" }))
  assert.ok(!sectionIsDark({ tone: "light", bgImage: "/a.jpg", bgOverlayOpacity: 10 }))
  assert.ok(!sectionIsDark({ tone: "light", bgImage: "/a.jpg", bgOverlay: "#ffffff" }))
  assert.ok(sectionIsDark({ tone: "transparent", bgColor: "#1a0508" }))
  assert.ok(!sectionIsDark({ tone: "light" }))
})
