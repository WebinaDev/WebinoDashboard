import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// isClearColor lives in a .tsx client module; test a copy of its contract against the source to keep this node-only.
const src = readFileSync(new URL("./poetry-pages-widgets.tsx", import.meta.url), "utf8")

test("poetry-nav applies capsuleBg (incl. transparent) to --akx-nav and marks clear capsules", () => {
  assert.match(src, /navBg: capsuleBg \|\| propStr\(p, "navBg"\)/)
  assert.match(src, /\["--akx-nav" as string\]: capsuleBg/)
  assert.match(src, /akx-nav-clear/)
  const css = readFileSync(new URL("./poetry-pages-widgets.css", import.meta.url), "utf8")
  assert.match(css, /\.akx-nav\.akx-nav-clear[^{]*\{[^}]*backdrop-filter: none/)
})

test("clear capsule never keeps a shadow/ring, even when capsuleShadow is unset", () => {
  assert.match(src, /!capsuleClear && propBool\(p, "capsuleShadow", true\) \? "" : "akx-nav-flat"/)
  const css = readFileSync(new URL("./poetry-pages-widgets.css", import.meta.url), "utf8")
  assert.match(css, /\.akx-navwrap\.akx-mfw \.akx-nav\.akx-nav-flat[^{]*\{[^}]*box-shadow: none !important/)
})
test("media rows with only a cover are kept; carousel arrows not hidden on touch", () => {
  const w = readFileSync(new URL("./poetry-widgets.tsx", import.meta.url), "utf8")
  assert.match(w, /r\.title\.trim\(\) \|\| r\.cover\.trim\(\) \|\| r\.src\.trim\(\)/)
  const css = readFileSync(new URL("./poetry-widgets.css", import.meta.url), "utf8")
  assert.doesNotMatch(css, /\.wpz-carousel-btn \{ display: none; \}/)
})
