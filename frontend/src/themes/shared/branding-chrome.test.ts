import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

const src = readFileSync(new URL("./branding.ts", import.meta.url), "utf8")

test("magazine atmosphere excludes builder poetry/wpz chrome header and footer", () => {
  assert.match(src, /\.sf-shell header:not\(\.akx\):not\(\.wpz\):not\(\.wbx-foot\)/)
  assert.match(src, /\.sf-shell footer:not\(\.akx\):not\(\.wpz\):not\(\.wbx-foot\)/)
  assert.doesNotMatch(src, /\.sf-shell header,\s*\n\.sf-shell \[data-site-header\]/)
  assert.doesNotMatch(src, /\.sf-shell footer,\s*\n\.sf-shell \[data-site-footer\]/)
})

test("poetry chrome CSS beats theme shell header/footer paint", () => {
  const css = readFileSync(new URL("../../builder/render/poetry-pages-widgets.css", import.meta.url), "utf8")
  assert.match(css, /\.sf-shell header\.akx-navwrap/)
  assert.match(css, /\.sf-shell footer\.akx-foot/)
  assert.match(css, /background: transparent/)
  assert.match(css, /background: var\(--akx-fbg/)
})

test("footer pattern layer sits above the foot background", () => {
  const css = readFileSync(new URL("../../builder/render/chrome-extras.css", import.meta.url), "utf8")
  assert.match(css, /\.wbx-foot\.wbx-has-pattern::before[^{]*\{[^}]*z-index:\s*0/)
  assert.match(css, /\.wbx-foot > \* \{ position: relative; z-index: 1; \}/)
})
