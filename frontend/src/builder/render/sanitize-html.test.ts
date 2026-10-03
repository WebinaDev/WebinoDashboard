import assert from "node:assert/strict"
import test from "node:test"

import { embedVideoSrc, sanitizeBuilderHtml } from "./sanitize-html.ts"

test("builder html drops active content on the server allow-list", () => {
  const clean = sanitizeBuilderHtml('<p onclick="alert(1)">Hi</p><script>alert(1)</script><img src="javascript:alert(1)"><a href="javascript:alert(1)">x</a><a href="https://shop.example">ok</a>')
  assert.equal(clean.includes("onclick"), false)
  assert.equal(clean.includes("<script"), false)
  assert.equal(clean.includes("javascript:"), false)
  assert.equal(clean.includes("<p>Hi</p>"), true)
  assert.equal(clean.includes('href="https://shop.example"'), true)
})

test("embed urls require the real youtube or aparat host", () => {
  assert.equal(embedVideoSrc("https://evil.example/youtube.com"), null)
  assert.equal(embedVideoSrc("https://youtube.com.evil.com/embed/abcdefgh"), null)
  assert.equal(embedVideoSrc("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "https://www.youtube.com/embed/dQw4w9WgXcQ")
  assert.equal(embedVideoSrc("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube.com/embed/dQw4w9WgXcQ")
  assert.equal(embedVideoSrc("https://www.aparat.com/v/abc123")?.includes("aparat.com"), true)
  assert.equal(embedVideoSrc("https://notaparat.com/v/abc123"), null)
})
